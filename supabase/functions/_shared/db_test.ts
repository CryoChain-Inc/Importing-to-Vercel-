import assert from 'node:assert/strict';

const assertEquals: typeof assert.deepEqual = assert.deepEqual;
import { json, mutateWorkspace } from './db.ts';

Deno.test('json responses carry the CORS headers', async () => {
  const res = json({ ok: true, error: 'nope' }, 409);
  assertEquals(res.status, 409);
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(res.headers.get('access-control-allow-origin'), '*');
  assertEquals(await res.json(), { ok: true, error: 'nope' });
});

type Row = { version: number; state: Record<string, unknown> } | null;

function fakeAdmin(options: {
  read: () => Row | { error: string };
  write?: (version: number, state: Record<string, unknown>) => { version: number }[];
}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  const row = options.read();
                  if (row && 'error' in row) return { data: null, error: { message: row.error } };
                  return { data: row, error: null };
                },
              };
            },
          };
        },
        update(payload: { state: Record<string, unknown> }) {
          return {
            eq() {
              return {
                eq(_column: string, version: number) {
                  return {
                    select: async () => ({
                      data: options.write?.(version, payload.state) ?? [],
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test('mutateWorkspace retries when the version changed underneath', async () => {
  let reads = 0;
  let writes = 0;
  const admin = fakeAdmin({
    read: () => {
      reads += 1;
      return { version: reads, state: { n: 0 } };
    },
    write: () => {
      writes += 1;
      return writes === 1 ? [] : [{ version: 3 }];
    },
  });
  let applied = 0;
  const version = await mutateWorkspace(admin as never, (state) => {
    applied += 1;
    state.n = Number(state.n) + 1;
  });
  assertEquals(version, 3);
  assertEquals(reads, 2);
  assertEquals(writes, 2);
  assertEquals(applied, 2);
});

Deno.test(
  'mutateWorkspace fails when the workspace is missing or keeps losing the race',
  async () => {
    await assert.rejects(
      () => mutateWorkspace(fakeAdmin({ read: () => null }) as never, () => undefined),
      /Workspace is not bootstrapped\./,
    );
    await assert.rejects(
      () =>
        mutateWorkspace(
          fakeAdmin({ read: () => ({ error: 'db down' }) }) as never,
          () => undefined,
        ),
      /db down/,
    );
    await assert.rejects(
      () =>
        mutateWorkspace(
          fakeAdmin({
            read: () => ({ version: 1, state: {} }),
            write: () => [],
          }) as never,
          () => undefined,
        ),
      /Could not save\. Retry\./,
    );
  },
);
