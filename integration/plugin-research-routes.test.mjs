import { expect, test } from 'bun:test';
import { Hono } from 'hono';
import { registerPluginResearchRoutes } from './plugin-research-routes';
function app(auth = { kind: 'user', workspaceId: 'test-workspace' }, overrides = {}) {
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('auth', auth); await next(); });
  registerPluginResearchRoutes(app, { isDemoMode: () => false, search: async (input) => ({ source: input.source, status: 'no-results', items: [] }), generate: async () => ({ text: 'Cited report [E1]' }), ...overrides });
  return app;
}
function post(path, payload) { return new Request('http://localhost/api/v1/plugins/research/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
test('anonymous and API token callers cannot spend the workspace model budget', async () => {
  for (const auth of [undefined, { kind: 'token', workspaceId: 'ws' }]) {
    const response = await app(auth === undefined ? null : auth).request(post('generate', { system: '', prompt: 'hi' }));
    expect(response.status).toBe(403);
  }
});
test('authenticated caller can search supported fixed sources', async () => {
  const response = await app().request(post('search', { query: 'AI', source: 'news', days: 30 }));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ source: 'news', status: 'no-results' });
});
test('arbitrary destinations, excessive windows and payload extensions are rejected', async () => {
  for (const input of [{ query: 'AI', source: 'http://127.0.0.1', days: 30 }, { query: 'AI', source: 'news', days: 999 }, { query: 'AI', source: 'news', days: 30, url: 'http://internal' }]) {
    expect((await app().request(post('search', input))).status).toBe(400);
  }
});
test('generation respects limits and never forwards provider exceptions', async () => {
  expect((await app().request(post('generate', { system: '', prompt: 'hi', maxOutputTokens: 999999 }))).status).toBe(400);
  const response = await app(undefined, { generate: async () => { throw new Error('Bearer DUMMY_SECRET_TEST_VALUE'); } }).request(post('generate', { system: '', prompt: 'hi' }));
  expect(response.status).toBe(502); expect(await response.text()).not.toContain('DUMMY_SECRET_TEST_VALUE');
});
test('demo cannot invoke AI and normal generation has an abort signal', async () => {
  expect((await app(undefined, { isDemoMode: () => true }).request(post('generate', { system: '', prompt: 'hi' }))).status).toBe(403);
  const response = await app(undefined, { generate: async (_input, signal) => { expect(signal).toBeInstanceOf(AbortSignal); return { text: 'ok' }; } }).request(post('generate', { system: '', prompt: 'hi' }));
  expect(await response.json()).toEqual({ text: 'ok' });
});
