import { expect, test } from 'bun:test';
import { boundedRequest } from '../src/requests';
import { evidencePrompt, exportMarkdown, fuse, newRun, regenerateReport, research } from '../src/engine';
import { ResearchStore } from '../src/store';
import type { Evidence, ResearchBridge } from '../src/types';
const evidence: Evidence = { id: 'E1', source: 'news', title: 'OpenAI release', summary: 'Reported release', url: 'https://example.org/release', coverage: 'headline' };
const update = async () => {};
const bridge = (): ResearchBridge => ({ ai: { status: async () => ({ configured: true }), generate: async () => ({ text: '报道提及新变化 [E1]' }) }, research: { search: async ({ source }) => ({ source, status: 'ok', items: [{ ...evidence, source }] }) } });
test('a non-cooperating provider is bounded and receives cancellation', async () => {
  let signal: AbortSignal | undefined;
  await expect(boundedRequest(child => { signal = child; return new Promise(() => {}); }, new AbortController().signal, 5)).rejects.toThrow('超时');
  expect(signal?.aborted).toBe(true);
});
test('user cancellation wins even if the provider ignores AbortSignal', async () => {
  const controller = new AbortController();
  const request = boundedRequest(() => new Promise(() => {}), controller.signal, 10000);
  controller.abort(new Error('User cancelled'));
  await expect(request).rejects.toThrow('User cancelled');
});
test('research only contacts selected sources and rejects empty selection', async () => {
  const b = bridge(); const sources: string[] = [];
  b.research.search = async ({ source }) => { sources.push(source); return { source, status: 'ok', items: [evidence] }; };
  const run = newRun('OpenAI', 30, 'quick', ['news']);
  await research(b, run, new AbortController().signal, update); expect(sources).toEqual(['news']);
  const empty = newRun('OpenAI', 30, 'quick', []); await research(b, empty, new AbortController().signal, update);
  expect(empty.status).toBe('error'); expect(sources).toHaveLength(1);
});
test('AI status failure still lets public evidence be collected', async () => {
  const b = bridge(); b.ai.status = async () => { throw new Error('Network unavailable'); };
  const run = newRun('OpenAI', 30, 'quick', ['news']); await research(b, run, new AbortController().signal, update);
  expect(run.evidence).toHaveLength(1); expect(run.reportKind).toBe('evidence'); expect(run.status).toBe('complete');
});
test('regeneration makes no searches and preserves the saved note reference', async () => {
  const b = bridge(); let searches = 0; b.research.search = async () => { searches++; throw new Error('must not search'); };
  const run = newRun('OpenAI', 30, 'quick'); Object.assign(run, { evidence: [evidence], status: 'complete', reportKind: 'evidence', report: 'Original', noteId: 'saved-note' });
  await regenerateReport(b, run, new AbortController().signal, update);
  expect(searches).toBe(0); expect(run.reportKind).toBe('ai'); expect(run.report).toContain(evidence.url); expect(run.noteId).toBe('saved-note');
  const completed = run.report; b.ai.generate = async () => { throw new Error('Provider unavailable'); };
  await expect(regenerateReport(b, run, new AbortController().signal, update)).rejects.toThrow('Provider unavailable');
  expect(run.report).toBe(completed); expect(run.reportKind).toBe('ai'); expect(run.status).toBe('complete');
});
test('regeneration cancellation retains the previous report and evidence', async () => {
  const b = bridge(); const controller = new AbortController();
  b.ai.generate = async () => { controller.abort(); return new Promise(() => {}); };
  const run = newRun('OpenAI', 30, 'quick'); Object.assign(run, { evidence: [evidence], status: 'complete', report: 'Previous', reportKind: 'ai' });
  await expect(regenerateReport(b, run, controller.signal, update)).rejects.toThrow();
  expect(run.report).toBe('Previous'); expect(run.status).toBe('complete'); expect(run.evidence).toHaveLength(1);
});
test('large evidence is bounded without dropping IDs or corrupting JSON', () => {
  const items = Array.from({length: 40}, (_, i) => ({ ...evidence, id: `E${i+1}`, summary: '长'.repeat(10000), comments: ['a'.repeat(10000), 'b'.repeat(10000), 'c'.repeat(10000)] }));
  const prompt = evidencePrompt(items); expect(prompt.length).toBeLessThan(57000); const parsed = JSON.parse(prompt);
  expect(parsed).toHaveLength(40); expect(parsed[39].id).toBe('E40'); expect(parsed[0].title).toBe(evidence.title);
});
test('AI keywords do not match unrelated substrings such as chair or said', () => {
  const items = [{ ...evidence, title: 'He said the chair arrived', summary: '' }, { ...evidence, title: 'AI-powered tools', summary: '', url: 'https://example.org/ai' }];
  const result = fuse([{ source: 'news', status: 'ok', items }], 'AI', 30); expect(result).toHaveLength(1); expect(result[0].title).toBe('AI-powered tools');
});
test('watchlists retain source/depth settings and migrate old defaults', async () => {
  const store = new ResearchStore({storage: { get: async () => null, set: async () => {}, remove: async () => {} }});
  const first = await store.addWatch('OpenAI', 30, ['news'], 'deep');
  expect((await store.addWatch('openai', 30, ['news'], 'deep')).id).toBe(first.id);
  const different = await store.addWatch('OpenAI', 30, ['github'], 'quick'); expect(different.id).not.toBe(first.id);
  expect(first.sources).toEqual(['news']); expect(first.depth).toBe('deep');
  store.state.watches.push({id:'legacy',topic:'Legacy',days:7,scheduled:false});
  expect((await store.addWatch('Legacy',7)).id).toBe('legacy');
});
test('exports count retained evidence rather than discarded search hits', () => {
  const run = newRun('OpenAI', 30, 'quick', ['news', 'github']); run.evidence = [evidence]; run.coverage = [{source:'github',status:'ok',items:[]}];
  expect(exportMarkdown(run)).toContain('已取得结果：新闻资讯。');
});
