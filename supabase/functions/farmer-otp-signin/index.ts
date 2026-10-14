import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Same demo code the app shows on the verify screen. Replace this when a real SMS provider sends the code.
const DEMO_CODE = "123456";

function loginTarget(identifier: string): { email: string; phone: string | null } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return { email: trimmed.toLowerCase(), phone: null };
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `233${digits.slice(1)}`;
  return { email: `${digits}@farmers.cryochain.app`, phone: digits };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => null);
  const identifier = String(body?.identifier ?? "");
  const code = String(body?.code ?? "");
  if (!identifier || code !== DEMO_CODE) return json({ error: "invalid_code" }, 401);

  const { email, phone } = loginTarget(identifier);
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const lookup = phone
    ? await admin.from("profiles").select("id, role").eq("phone", phone).maybeSingle()
    : await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (lookup.error) return json({ error: "lookup" }, 500);
  if (!lookup.data || (lookup.data.role !== "farmer" && lookup.data.role !== "pending")) {
    return json({ error: "not_found" }, 404);
  }

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return json({ error: "not_found" }, 404);
  return json({ token_hash: tokenHash });
});
