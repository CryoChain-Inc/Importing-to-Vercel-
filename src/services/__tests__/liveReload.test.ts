import { AppState } from 'react-native';
import { watchChanges } from '../liveReload';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({ supabase: { channel: jest.fn(), removeChannel: jest.fn() } }));

const handlers: (() => void)[] = [];
const channel = { on: jest.fn(), subscribe: jest.fn() };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  handlers.length = 0;
  channel.on.mockImplementation((_e: string, _f: unknown, cb: () => void) => { handlers.push(cb); return channel; });
  (supabase.channel as jest.Mock).mockReturnValue(channel);
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});
afterEach(() => jest.useRealTimers());

test('a burst of changes across tables causes one reload', () => {
  const onChange = jest.fn();
  const stop = watchChanges(['orders', 'delivery_stops'], onChange);
  expect(channel.on.mock.calls.map((c: unknown[]) => (c[1] as { table: string }).table)).toEqual(['orders', 'delivery_stops']);
  handlers[0]();
  handlers[1]();
  handlers[0]();
  jest.advanceTimersByTime(900);
  expect(onChange).toHaveBeenCalledTimes(1);
  stop();
});

test('reloads once a minute as a safety net, and not at all after stopping', () => {
  const onChange = jest.fn();
  const stop = watchChanges(['orders'], onChange);
  jest.advanceTimersByTime(60000);
  expect(onChange).toHaveBeenCalledTimes(1);
  stop();
  expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  handlers[0]();
  jest.advanceTimersByTime(120000);
  expect(onChange).toHaveBeenCalledTimes(1);
});
