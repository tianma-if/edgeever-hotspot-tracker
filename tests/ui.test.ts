import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { fixture } from './fixture';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' }).window;
Object.assign(globalThis, { window: dom, document: dom.document });
const { TrackerApp } = await import('../src/ui');
const apps: InstanceType<typeof TrackerApp>[] = [];
afterEach(() => { apps.splice(0).forEach(app => app.dispose()); document.body.replaceChildren(); });
const findButton = (root: ShadowRoot, text: string) => [...root.querySelectorAll('button')].find(b => b.textContent === text)!;
async function until(condition: () => boolean) { for (let i = 0; i < 150; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('UI did not settle'); }
async function mount(f = fixture()) {
  const app = new TrackerApp(f.host); apps.push(app); await app.init(); const container = document.createElement('div'); document.body.append(container);
  const close = app.mount(container); await app.service.refresh();
  return { f, app, container, close, root: container.firstElementChild!.shadowRoot! };
}
test('home has no research composer, source choices, depth or per-topic watch workflow', async () => {
  const { root } = await mount(); expect(root.querySelector('textarea')).toBeNull(); expect(root.querySelector('select')).toBeNull();
  expect(root.textContent).toContain('AI'); expect(root.textContent).toContain('每周一 09:00'); expect(root.textContent).toContain('自动生成已开启');
  for (const label of ['开始研究', '我的追踪', '研究深度', '最近 30 天']) expect(root.textContent).not.toContain(label);
});
test('one click generates, sanitizes, automatically saves and opens the existing note', async () => {
  const f = fixture(); const generate = f.host.ai!.generate;
  f.host.ai!.generate = async input => input.maxOutputTokens === 3500 ? { text: '可核查的测试资料 [E1]<img src=x onerror="alert(1)"><script>alert(1)</script>' } : generate(input);
  const { app, root, close, container } = await mount(f); findButton(root, '立即生成').click();
  await until(() => Boolean(app.store.state.runs[0]?.noteId) && !app.service.running);
  expect(root.textContent).toContain('可核查的测试资料'); expect(root.querySelector('.report script')).toBeNull(); expect(root.querySelector('.report img')).toBeNull();
  expect(root.querySelector('.report a')?.getAttribute('href')).toContain('https://example.org/fixture/');
  findButton(root, '打开笔记 ↗').click(); await until(() => Boolean(f.calls.opened)); expect(f.notes).toHaveLength(1);
  close(); app.mount(container); expect(container.firstElementChild!.shadowRoot!.textContent).toContain('可核查的测试资料');
});
test('empty settings and missing network disable generation with guidance', async () => {
  const f = fixture(); f.settings['digest.interests'] = ''; const { root } = await mount(f);
  expect(findButton(root, '立即生成').disabled).toBe(true); expect(root.textContent).toContain('插件设置');
  const g = fixture(); delete g.host.network; const mounted = await mount(g); expect(mounted.root.textContent).toContain('网络访问能力');
  expect(findButton(mounted.root, '立即生成').disabled).toBe(true);
});
test('pause/resume and settings refresh update the compact subscription summary', async () => {
  const { f, root, app } = await mount(); findButton(root, '暂停自动生成').click(); await until(() => Boolean(findButton(root, '恢复自动生成')) && !findButton(root, '恢复自动生成').disabled);
  expect(f.schedules.size).toBe(0); expect(root.textContent).toContain('已暂停');
  f.settings['digest.frequency'] = 'daily'; f.settings['digest.interests'] = '科技产品'; findButton(root, '刷新设置').click();
  await until(() => root.textContent!.includes('日报 · 每日')); expect(root.textContent).toContain('科技产品'); expect(app.store.state.runs).toHaveLength(0);
});
test('save failures expose retry and retain existing reports', async () => {
  const f = fixture(); const create = f.host.notes.create; f.host.notes.create = async () => { throw new Error('保存失败'); };
  const { app, root } = await mount(f); findButton(root, '立即生成').click(); await until(() => Boolean(findButton(root, '重试保存')) && !findButton(root, '重试保存').disabled);
  expect(root.textContent).toContain('保存失败'); const searches = f.calls.searches; f.host.notes.create = create; findButton(root, '重试保存').click();
  await until(() => Boolean(app.store.state.runs[0]?.noteId)); expect(f.calls.searches).toBe(searches); expect(f.notes).toHaveLength(1);
});
test('legacy history remains accessible and cannot create new watch tasks', async () => {
  const { newRun } = await import('../src/engine'); const f = fixture(); const run = newRun('Legacy report', 30, 'quick'); run.status = 'complete'; run.report = 'Previous content';
  f.values.set('research-state-v1', { version: 1, runs: [run], watches: [] }); const { root } = await mount(f);
  findButton(root, 'Legacy report').click(); expect(root.textContent).toContain('Previous content'); expect(findButton(root, '追踪这个话题')).toBeUndefined();
});
test('preferences card distinguishes status badges, offers empty suggestions, and auto-refreshes on window focus', async () => {
  const f = fixture(); f.settings['digest.interests'] = '';
  const { root } = await mount(f);
  expect(root.querySelector('.badge-inactive')?.textContent).toBe('自动生成未开启');
  expect(root.querySelector('.empty-suggestions')).not.toBeNull();
  expect(root.textContent).toContain('AI · 大模型');

  f.settings['digest.interests'] = '云原生架构';
  window.dispatchEvent(new dom.window.Event('focus'));
  await until(() => Boolean(root.querySelector('.badge-active')));
  expect(root.querySelector('.badge-active')?.textContent).toBe('自动生成已开启');
  expect(root.textContent).toContain('云原生架构');

  findButton(root, '暂停自动生成').click();
  await until(() => root.querySelector('.badge-paused')?.textContent === '已暂停');
});

