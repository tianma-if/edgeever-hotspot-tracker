import { expect, test } from 'bun:test';
import { fuseDigest, newRun, research } from '../src/engine';
import type { Evidence, ResearchBridge, SearchResult } from '../src/types';
function run() {
  const run = newRun('热点日报', 1, 'standard');
  run.digest = { frequency: 'daily', interests: ['AI', 'Design'], periodKey: 'daily:test' }; return run;
}
function evidence(interest: string, index: number): Evidence {
  return { id: '', source: 'news', title: `${interest} release`, summary: `${interest} update`, url: `https://example.org/${interest}/${index}`, coverage: 'headline', publishedAt: new Date(Date.now() - 1000).toISOString() };
}
test('each interest has a fair evidence share before applying the 40 item cap', () => {
  const r = run(); const results: SearchResult[] = r.digest!.interests.map(interest => ({ source: 'news', status: 'ok', interest, items: Array.from({ length: 40 }, (_, i) => evidence(interest, i)) }));
  const items = fuseDigest(results, r); expect(items).toHaveLength(40);
  expect(items.filter(e => e.interests?.includes('AI'))).toHaveLength(20); expect(items.filter(e => e.interests?.includes('Design'))).toHaveLength(20);
  expect(new Set(items.map(e => e.id)).size).toBe(40);
});
test('shared links retain both domain labels and undated, old, future items are excluded', () => {
  const r = run(); const common = { ...evidence('AI', 0), title: 'AI Design update' };
  const items = fuseDigest([
    { source: 'news', status: 'ok', interest: 'AI', items: [common, { ...common, url: 'https://example.org/undated', publishedAt: undefined }, { ...common, url: 'https://example.org/old', publishedAt: new Date(Date.now() - 2 * 86400000).toISOString() }, { ...common, url: 'https://example.org/future', publishedAt: new Date(Date.now() + 86400000).toISOString() }] },
    { source: 'news', status: 'ok', interest: 'Design', items: [{ ...common, url: common.url + '?utm_source=test' }] },
  ], r);
  expect(items).toHaveLength(1); expect(items[0].interests).toEqual(['AI', 'Design']);
});
test('English query expansion is associated with its original Chinese interest', () => {
  const r = run(); r.digest!.interests = ['人工智能'];
  const items = fuseDigest([{ source: 'news', status: 'ok', interest: '人工智能', query: 'AI', items: [evidence('AI', 0)] }], r);
  expect(items).toHaveLength(1); expect(items[0].interests).toEqual(['人工智能']);
});
test('domains are searched independently; synthesis requests all groups and has one source map', async () => {
  const r = run(); const queries: string[] = []; let reportPrompt = '';
  const bridge: ResearchBridge = {
    ai: { status: async () => ({ configured: true }), generate: async input => {
      if (input.maxOutputTokens === 500) return { text: JSON.stringify({ queries: [input.prompt] }) };
      if (input.maxOutputTokens === 900) return { text: '{"keep":["E1","E2"]}' };
      reportPrompt = input.prompt; return { text: '## AI\n变化 [E1]\n## Design\n变化 [E2]' };
    } },
    research: { search: async ({ query, source, days }) => { queries.push(query); expect(days).toBe(1); return { source, status: 'ok', items: source === 'news' ? [evidence(query, 0)] : [] }; } },
  };
  await research(bridge, r, new AbortController().signal, async () => {});
  expect([...new Set(queries)]).toEqual(['AI', 'Design']); expect(r.evidence).toHaveLength(2); expect(r.reportKind).toBe('ai');
  expect(reportPrompt).toContain('发生了什么'); expect(reportPrompt).toContain('为什么值得关注'); expect(reportPrompt).toContain('["AI","Design"]');
  expect(r.report).toContain('https://example.org/Design/0');
});
test('failed sources and AI failure keep grouped evidence and mark sparse domains honestly', async () => {
  const r = run(); const bridge: ResearchBridge = {
    ai: { status: async () => ({ configured: true }), generate: async () => { throw new Error('unavailable'); } },
    research: { search: async ({ query, source }) => ({ source, status: query === 'AI' ? 'ok' : 'unreachable', items: query === 'AI' && source === 'news' ? [evidence('AI', 0)] : [] }) },
  };
  await research(bridge, r, new AbortController().signal, async () => {});
  expect(r.reportKind).toBe('evidence'); expect(r.report).toContain('## AI'); expect(r.report).toContain('## Design');
  expect(r.warnings.join()).toContain('Design：本期未取得'); expect(r.report).toContain('不是 AI 综合报告');
});
