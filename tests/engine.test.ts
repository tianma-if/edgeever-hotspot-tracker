import { describe, expect, test } from 'bun:test';
import { canonicalUrl, exportMarkdown, fuse, newRun, research, validateCitations } from '../src/engine';
import { ResearchStore } from '../src/store';
import type { Evidence, ResearchBridge, SearchResult } from '../src/types';
const evidence: Evidence = { id: 'E1', source: 'news', title: 'Relevant release', summary: 'OpenAI release', url: 'https://example.org/A?x=1', publishedAt: new Date().toISOString(), coverage: 'headline' };
const batch: SearchResult = { source: 'news', status: 'ok', items: [evidence] };
function bridge(configured = true): ResearchBridge { return { ai: { status: async () => ({ configured }), generate: async (input) => ({ text: input.maxOutputTokens === 500 ? '{"queries":["OpenAI","OpenAI releases"]}' : input.maxOutputTokens === 900 ? '{"keep":["E1"]}' : '有一个新进展。[E1]' }) }, research: { search: async ({ source }) => source === 'news' ? batch : ({ source, status: 'no-results', items: [] }) } }; }
describe('research evidence integrity', () => {
  test('deduplicates tracking links without lowercasing case-sensitive paths', () => {
    expect(canonicalUrl('https://Example.org/A?x=1&utm_source=foo#section')).toBe('https://example.org/A?x=1');
    const merged = fuse([batch, { ...batch, items: [{ ...evidence, url: evidence.url + '&utm_source=x', comments: ['a valuable comment'] }] }], 'OpenAI', 30);
    expect(merged).toHaveLength(1); expect(merged[0].comments).toEqual(['a valuable comment']);
  });
  test('removes old and future evidence while keeping unknown dates explicit', () => {
    const items = [{ ...evidence, url: 'https://example.org/old', publishedAt: '2020-01-01T00:00:00Z' }, { ...evidence, url: 'https://example.org/future', publishedAt: '2099-01-01T00:00:00Z' }, { ...evidence, publishedAt: undefined }];
    expect(fuse([{ ...batch, items }], 'OpenAI', 30)).toHaveLength(1);
  });
  test('does not accept model-invented links or evidence IDs', () => {
    const result = validateCitations('支持 [E1]，伪造 [E99] [链接](https://evil.example/steal) https://madeup.example/item', [evidence]);
    expect(result).toContain(`[1](${evidence.url})`); expect(result).not.toContain('evil.example'); expect(result).not.toContain('madeup.example'); expect(result).toContain('引用未核实');
  });
  test('completes multi-source research and persists provenance', async () => {
    const run = newRun('OpenAI', 30, 'standard'); let checkpoints = 0;
    await research(bridge(), run, new AbortController().signal, async () => { checkpoints++; });
    expect(run.status).toBe('complete'); expect(run.queries).toHaveLength(2); expect(run.evidence).toHaveLength(1); expect(checkpoints).toBeGreaterThan(4); expect(exportMarkdown(run)).toContain(evidence.url);
  });
  test('missing AI produces explicitly labeled evidence, not a fake synthesis', async () => {
    const run = newRun('OpenAI', 30, 'quick'); await research(bridge(false), run, new AbortController().signal, async () => {});
    expect(run.status).toBe('complete'); expect(run.warnings.join()).toContain('不是 AI 综合报告'); expect(run.evidence.length).toBe(1);
  });
  test('failed search is not reported as nobody discussing the topic', async () => {
    const b = bridge(); b.research.search = async ({ source }) => ({ source, status: 'unreachable', items: [] });
    const run = newRun('topic', 7, 'quick'); await research(b, run, new AbortController().signal, async () => {});
    expect(run.report).toContain('不能据此判断');
  });
  test('cancellation preserves retrieved evidence and stops synthesis', async () => {
    const controller = new AbortController(); const b = bridge(); let count = 0;
    b.research.search = async () => { count++; if (count === 2) controller.abort(); return batch; };
    const run = newRun('topic', 7, 'quick'); await research(b, run, controller.signal, async () => {});
    expect(run.status).toBe('cancelled'); expect(count).toBe(2); expect(run.report).toBe('');
  });
  test('restoring storage marks abandoned tasks interrupted and serializes snapshots', async () => {
    let stored: unknown = { version: 1, runs: [newRun('topic', 30, 'quick')], watches: [] };
    const store = new ResearchStore({ storage: { get: async <T>() => structuredClone(stored) as T, set: async (_key, value) => { stored = structuredClone(value); }, remove: async () => {} } });
    await store.load(); expect(store.state.runs[0].status).toBe('interrupted');
    const first = await store.addWatch('OpenAI', 30); const second = await store.addWatch('openai', 30); expect(first.id).toBe(second.id);
  });
});


test('local relevance removes keyword-free search noise', () => {
  const items = [evidence, { ...evidence, title: 'Package delivered empty', summary: 'Shipping issue', url: 'https://example.org/noise' }];
  expect(fuse([{ ...batch, items }], 'OpenAI', 30)).toHaveLength(1);
});
test('semantic relevance uses real evidence IDs and preserves provenance', async () => {
  const b = bridge();
  b.research.search = async ({ source }) => source === 'news' ? { ...batch, items: Array.from({ length: 5 }, (_, i) => ({ ...evidence, url: `https://example.org/${i}` })) } : { source, status: 'no-results', items: [] };
  b.ai.generate = async (input) => ({ text: input.maxOutputTokens === 500 ? '{"queries":["OpenAI"]}' : input.maxOutputTokens === 900 ? '{"keep":["E2"]}' : 'Relevant [E2]' });
  const run = newRun('OpenAI', 30, 'standard'); await research(b, run, new AbortController().signal, async () => {});
  expect(run.evidence.map(e => e.id)).toEqual(['E2']); expect(run.report).toContain('[2](https://example.org/1)');
  b.ai.generate = async (input) => ({ text: input.maxOutputTokens === 500 ? '{"queries":["OpenAI"]}' : input.maxOutputTokens === 900 ? '{"keep":["E999"]}' : 'Relevant [E1]' });
  const retry = newRun('OpenAI', 30, 'standard'); await research(b, retry, new AbortController().signal, async () => {});
  expect(retry.evidence.length).toBe(5); expect(retry.warnings.join()).toContain('语义筛选暂不可用');
});


test('planner cannot silently replace the original research topic', async () => {
  const b = bridge(); b.ai.generate = async input => ({ text: input.maxOutputTokens === 500 ? '{"queries":["unrelated keyword"]}' : input.maxOutputTokens === 900 ? '{"keep":["E1"]}' : 'Report [E1]' });
  const run = newRun('OpenAI', 30, 'standard'); await research(b, run, new AbortController().signal, async () => {});
  expect(run.queries[0]).toBe('OpenAI'); expect(run.queries.length).toBeLessThanOrEqual(2);
});
test('semantic filtering also rejects a sparse set of irrelevant hits', async () => {
  const b = bridge(); b.ai.generate = async input => ({ text: input.maxOutputTokens === 500 ? '{"queries":["OpenAI"]}' : '{"keep":[]}' });
  const run = newRun('OpenAI', 30, 'standard'); await research(b, run, new AbortController().signal, async () => {});
  expect(run.evidence).toHaveLength(0); expect(run.report).toContain('没有找到足够的相关证据');
});
