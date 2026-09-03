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
  const app = new TrackerApp(fixture.context); await app.init(); const container = document.createElement('div'); document.body.append(container); const close = app.mount(container); const root = container.firstElementChild!.shadowRoot!;
  expect(root.textContent).toContain('请更新'); expect(findButton(root, '开始研究 ↗').disabled).toBe(true); close(); app.dispose(); container.remove();
});

test('source selection, report-only retry, and watch preferences work together', async () => {
  const fixture = host(); let configured = false; let searches = 0;
  const commands = new Map<string, () => void | Promise<void>>();
  fixture.context.ai!.status = async () => ({ configured });
  fixture.context.ai!.generate = async () => ({ text: '资料中的变化 [E1]' });
  const originalSearch = fixture.context.research!.search;
  fixture.context.research!.search = async (input, options) => { searches++; expect(input.source).toBe('news'); return originalSearch(input, options); };
  fixture.context.commands.register = command => { commands.set(command.id, command.run); return () => { commands.delete(command.id); }; };
  const app = new TrackerApp(fixture.context); await app.init();
  const container = document.createElement('div'); document.body.append(container); const close = app.mount(container); const root = container.firstElementChild!.shadowRoot!;
  for (const label of ['检索Hacker News', '检索GitHub', '检索Reddit']) root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!.click();
  root.querySelector<HTMLInputElement>('[aria-label="检索新闻资讯"]')!.click();
  expect(root.querySelector<HTMLInputElement>('[aria-label="检索新闻资讯"]')!.checked).toBe(true);
  const depth = root.querySelector<HTMLSelectElement>('[aria-label="研究深度"]')!; depth.value = 'quick'; depth.dispatchEvent(new dom.Event('change') as unknown as Event);
  const input = root.querySelector('textarea')!; input.value = 'AI'; input.dispatchEvent(new dom.Event('input') as unknown as Event);
  findButton(root, '开始研究 ↗').click(); await until(() => app.store.state.runs[0]?.status === 'complete');
  expect(searches).toBe(1); expect(app.store.state.runs[0].reportKind).toBe('evidence');
  configured = true; findButton(root, '用已有资料生成报告').click(); await until(() => app.store.state.runs[0].reportKind === 'ai');
  expect(searches).toBe(1); expect(root.textContent).toContain('资料中的变化');
  findButton(root, '追踪这个话题').click(); await until(() => commands.size === 1);
  const watch = app.store.state.watches[0]; expect(watch.sources).toEqual(['news']); expect(watch.depth).toBe('quick'); expect(watch.baselineUrls).toEqual(['https://example.org/article']);
  app.store.state.runs = []; // Previous run aged out of bounded history.
  fixture.context.research!.search = async ({ source }) => ({source, status:'ok',items:[{ id:'',source,title:'AI update',summary:'AI new evidence',url:'https://example.org/new',coverage:'headline' }]});
  await commands.get(`watch-${watch.id}`)!(); expect(app.store.state.runs[0].newEvidence).toBe(1); expect(app.store.state.runs[0].sources).toEqual(['news']);
  close(); app.dispose(); container.remove();
});

test('history and source filters only change displayed results', async () => {
  const fixture = host(); const app = new TrackerApp(fixture.context); await app.init();
  const { newRun } = await import('../src/engine'); const run = newRun('AI tools',30,'quick'); run.status = 'complete'; run.report='A report';
  run.evidence = ['news','github'].map((source,i) => ({id:`E${i+1}`,source:source as 'news'|'github',title:'AI tools',summary:'AI',url:`https://example.org/${i}`,coverage:'headline'}));
  await app.store.addRun(run);
  const container = document.createElement('div'); document.body.append(container); const close = app.mount(container); const root = container.firstElementChild!.shadowRoot!;
  findButton(root,'AI tools').click(); const select = root.querySelector<HTMLSelectElement>('[aria-label="筛选证据来源"]')!; select.value='github'; select.dispatchEvent(new dom.Event('change') as unknown as Event);
  expect(root.querySelectorAll('.evidence').length).toBe(1); expect(app.store.state.runs[0].evidence).toHaveLength(2);
  findButton(root,'研究历史1').click(); const search=root.querySelector<HTMLInputElement>('[aria-label="搜索研究历史"]')!; search.value='unmatched'; search.dispatchEvent(new dom.Event('input') as unknown as Event);
  expect(root.textContent).toContain('没有匹配的研究'); expect(app.store.state.runs).toHaveLength(1);
  expect(root.querySelector('[aria-label="搜索研究历史"]') === search).toBe(true); search.value = ''; search.dispatchEvent(new dom.Event('input') as unknown as Event); expect(root.querySelectorAll('.card-title').length).toBe(1);
  close(); app.dispose(); container.remove();
});
