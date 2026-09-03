import { expect, test } from 'bun:test';
const values = new Map();
globalThis.window ??= { location: { href: 'https://example.test' }, localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }, addEventListener() {}, removeEventListener() {} };
globalThis.document ??= { documentElement: { classList: { contains: () => false }, dataset: {}, style: { setProperty() {}, removeProperty() {} }, removeAttribute() {} } };
const { EdgeEverPluginHost } = await import('./plugin-host');
const base = { type: 'plugin', id: 'org.edgeever.research-test', name: 'test', version: '1.0.0', apiVersion: '1', entry: './test.js', permissions: [] };
test('research permissions are independent and retained contexts stop after deactivation', async () => {
  let calls = 0; let receivedSignal;
  const host = new EdgeEverPluginHost({ repository: {}, scope: 'research-test', researchAdapter: { ai: { status: async () => { calls++; return { configured: true }; }, generate: async (input) => { receivedSignal = input.signal; calls++; return { text: 'ok' }; } }, research: { search: async () => { calls++; return { source: 'news', status: 'no-results', items: [] }; } } } });
  const disposers = []; const denied = host.createContext(base, disposers);
  await expect(denied.ai.status()).rejects.toThrow(); await expect(denied.research.search({ query: 'x', days: 7, source: 'news' })).rejects.toThrow(); expect(calls).toBe(0);
  const allowed = host.createContext({ ...base, permissions: ['ai:generate'] }, disposers);
  await allowed.ai.generate({ system: '', prompt: 'test' }); expect(calls).toBe(1); expect(receivedSignal.aborted).toBe(false);
  await expect(allowed.research.search({ query: 'x', days: 7, source: 'news' })).rejects.toThrow();
  disposers.forEach((dispose) => dispose()); expect(receivedSignal.aborted).toBe(true); await expect(allowed.ai.status()).rejects.toThrow(); expect(calls).toBe(1);
});
