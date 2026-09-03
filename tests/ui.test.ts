import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import type { PluginHost } from '../src/types';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' }).window;
Object.assign(globalThis, { window: dom, document: dom.document });
const { TrackerApp } = await import('../src/ui');
function host() {
  const values = new Map<string, unknown>(); let creates = 0; let generated = 0; let lastNote = '';
  const context: PluginHost = {
    ai: { status: async () => ({ configured: true, modelName: 'Test model' }), generate: async (input) => { generated++; return { text: input.maxOutputTokens === 500 ? '{"queries":["AI"]}' : '可核查的发现 [E1]。<img src=x onerror="alert(1)"><script>alert(1)</script>' }; } },
    research: { search: async ({ source }) => ({ source, status: source === 'news' ? 'ok' : 'no-results', items: source === 'news' ? [{ id: '', source, title: 'AI release', url: 'https://example.org/article', summary: 'AI release details', publishedAt: new Date().toISOString(), coverage: 'headline' }] : [] }) },
    commands: { register: () => () => {} }, ui: { panels: { register: () => () => {}, open: async () => {} }, showNotice: () => {}, openNote: async (id) => { lastNote = id; } },
    storage: { get: async <T>(key: string) => structuredClone(values.get(key) ?? null) as T | null, set: async (key, value) => { values.set(key, structuredClone(value)); }, remove: async (key) => { values.delete(key); } },
    notebooks: { list: async () => [{ id: 'notebook', name: 'Notebook' }] }, notes: { create: async () => { creates++; return { id: 'note-created' }; } },
  };
  return { context, counts: () => ({ creates, generated, lastNote }) };
}
const findButton = (root: ShadowRoot, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;
async function until(condition: () => boolean) { for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise((resolve) => setTimeout(resolve, 5)); } throw new Error('UI did not settle'); }
test('native flow researches, sanitizes reports, saves once and reopens after panel close', async () => {
  const fixture = host(); const app = new TrackerApp(fixture.context); await app.init();
  const container = document.createElement('div'); document.body.append(container); let close = app.mount(container); let root = container.firstElementChild!.shadowRoot!;
  const input = root.querySelector('textarea')!; input.value = 'AI'; input.dispatchEvent(new dom.Event('input') as unknown as Event);
  findButton(root, '开始研究 ↗').click(); await until(() => app.store.state.runs[0]?.status === 'complete');
  expect(root.textContent).toContain('可核查的发现'); expect(Boolean(root.querySelector('.report script'))).toBe(false); expect(Boolean(root.querySelector('.report img'))).toBe(false); expect(root.querySelector('.report a')?.getAttribute('href')).toBe('https://example.org/article');
  findButton(root, '保存为笔记').click(); await until(() => Boolean(app.store.state.runs[0].noteId));
  findButton(root, '打开已保存笔记 ↗').click(); await until(() => fixture.counts().lastNote === 'note-created'); expect(fixture.counts().creates).toBe(1);
  findButton(root, '追踪这个话题').click(); await until(() => app.store.state.watches.length === 1);
  close(); close = app.mount(container); root = container.firstElementChild!.shadowRoot!; expect(root.textContent).toContain('可核查的发现');
  close(); app.dispose(); container.remove();
});
test('old host shows an actionable upgrade message and cannot start a pretend research', async () => {
  const fixture = host(); delete fixture.context.ai; delete fixture.context.research;
  const app = new TrackerApp(fixture.context); await app.init(); const container = document.createElement('div'); const close = app.mount(container); const root = container.firstElementChild!.shadowRoot!;
  expect(root.textContent).toContain('请更新'); expect(findButton(root, '开始研究 ↗').disabled).toBe(true); close(); app.dispose();
});
