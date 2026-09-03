import { expect, test } from 'bun:test';
import manifest from '../manifest.json';
import { createResearchRuntime } from '../src/runtime';
import { newRun, research } from '../src/engine';
import type { PublicFetch } from '../src/types';

test('all four source adapters execute inside the plugin through generic network.fetch', async () => {
  const requests: string[] = [];
  const network = { fetch: (async (input, init) => {
    requests.push(input); expect(typeof input).toBe('string');
    expect(manifest.networkHosts).toContain(new URL(input).hostname);
    expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('manual');
    expect(init?.transport).toBe('public');
    expect(init?.headers).not.toHaveProperty('User-Agent');
    const domain = new URL(input).hostname;
    if (domain === 'hn.algolia.com') {
      if (new URL(input).pathname.includes('/items/')) return Response.json({ children: [{ author: 'alice', text: 'AI useful comment' }] });
      return Response.json({ hits: [{ title: 'AI story', objectID: '123', story_text: 'AI details', points: 5 }] });
    }
    if (domain === 'api.github.com') return Response.json({ items: [{ title: 'AI issue', body: 'AI details', html_url: 'https://github.com/example/project/issues/1', comments: 2 }] });
    if (domain === 'news.google.com') return new Response('<rss><channel><item><title>AI news</title><link>https://example.org/story</link><description>AI news excerpt</description></item></channel></rss>');
    return new Response('<feed><entry><title>AI post</title><link href="https://www.reddit.com/r/test/comments/abc"/><content>AI excerpt</content></entry></feed>');
  }) satisfies PublicFetch };
  const host = { network, get research(): never { throw new Error('A plugin must never access host.research'); } };
  const runtime = createResearchRuntime(host)!;
  const run = newRun('AI', 30, 'quick');
  await research(runtime, run, new AbortController().signal, async () => {});
  expect(run.status).toBe('complete'); expect(run.reportKind).toBe('evidence'); expect(run.evidence).toHaveLength(4);
  expect(run.evidence.find(item => item.source === 'hackernews')?.comments).toEqual(['alice: AI useful comment']);
  expect(requests).toHaveLength(5);
  expect(manifest.permissions).not.toContain('research:search');
});

test('source transport failures remain visible while another source can succeed', async () => {
  const runtime = createResearchRuntime({ network: { fetch: async input => {
    if (new URL(input).hostname === 'news.google.com') throw new TypeError('Failed to fetch');
    return Response.json({ items: [{ title: 'AI issue', body: 'AI details', html_url: 'https://github.com/example/project/issues/1' }] });
  } } })!;
  const run = newRun('AI', 7, 'quick', ['news', 'github']);
  await research(runtime, run, new AbortController().signal, async () => {});
  expect(run.evidence).toHaveLength(1); expect(run.coverage.find(source => source.source === 'news')?.status).toBe('unreachable');
  expect(run.coverage.find(source => source.source === 'news')?.message).toContain('跨域');
});

test('generic AI receives plugin-built prompts and never source-specific API arguments', async () => {
  const inputs: string[] = [];
  const runtime = createResearchRuntime({
    network: { fetch: async () => Response.json({ items: [{ title: 'AI issue', body: 'AI details', html_url: 'https://github.com/example/project/issues/1' }] }) },
    ai: { status: async () => ({ configured: true }), generate: async input => { inputs.push(input.prompt); return { text: '变化 [E1]' }; } },
  })!;
  const run = newRun('AI', 7, 'quick', ['github']);
  await research(runtime, run, new AbortController().signal, async () => {});
  expect(inputs).toHaveLength(1); expect(inputs[0]).toContain('AI details'); expect(run.reportKind).toBe('ai');
  expect(run.report).toContain('https://github.com/example/project/issues/1');
});
