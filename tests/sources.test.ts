import { expect, test } from 'bun:test';
import { searchPublicSources } from '../src/sources';
const now = Date.parse('2026-09-03T12:00:00Z');
function responder(body: string, inspect?: (url: string, init?: RequestInit) => void) { return (async (input: URL | RequestInfo, init?: RequestInit) => { inspect?.(String(input), init); return new Response(body); }) as unknown as typeof fetch; }
test('RSS dates, escaped titles, URLs and headlines are preserved', async () => {
  const result = await searchPublicSources({ query: 'AI', source: 'news', days: 7 }, { now, fetch: responder('<rss><channel><item><title>AI &amp; people</title><link>https://example.org/new</link><description>Headline only</description><pubDate>Wed, 02 Sep 2026 12:00:00 GMT</pubDate></item><item><title>old</title><link>https://example.org/old</link><pubDate>Wed, 02 Sep 2020 12:00:00 GMT</pubDate></item></channel></rss>') });
  expect(result.items).toHaveLength(1); expect(result.items[0].title).toBe('AI & people'); expect(result.items[0].coverage).toBe('headline');
});
test('user input cannot replace destination or enable redirects', async () => {
  await searchPublicSources({ query: 'https://127.0.0.1/secrets&target=internal', source: 'news', days: 7 }, { now, fetch: responder('<rss><channel/></rss>', (url, init) => { expect(new URL(url).hostname).toBe('news.google.com'); expect(init?.redirect).toBe('manual'); expect(init?.headers).not.toHaveProperty('Authorization'); }) });
});
test('Reddit Atom is fetched once and never represented as full comment coverage', async () => {
  let calls = 0;
  const result = await searchPublicSources({ query: 'topic', source: 'reddit', days: 7 }, { now, fetch: responder('<feed><entry><title>Topic</title><link href="https://www.reddit.com/r/test/comments/abc"/><updated>2026-09-02T12:00:00Z</updated><content>Body</content></entry></feed>', () => { calls++; }) });
  expect(calls).toBe(1); expect(result.items[0].url).toContain('/comments/abc'); expect(result.items[0].coverage).toBe('headline');
});
test('rate limits remain distinct from clean empty results', async () => {
  const result = await searchPublicSources({ query: 'topic', source: 'github', days: 30 }, { fetch: (async () => new Response('', { status: 429 })) as unknown as typeof fetch });
  expect(result.status).toBe('rate-limited');
});
test('malformed provider response is visible as incomplete coverage', async () => {
  const result = await searchPublicSources({ query: 'topic', source: 'github', days: 30 }, { fetch: responder('{"unexpected":true}') });
  expect(result.status).toBe('unreachable');
});
test('cancellation propagates instead of being converted to an empty source', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(searchPublicSources({ query: 'topic', source: 'news', days: 30 }, { signal: controller.signal, fetch: (async (_input: URL | RequestInfo, init?: RequestInit) => { init?.signal?.throwIfAborted(); return new Response(''); }) as unknown as typeof fetch })).rejects.toThrow();
});


test('nested encoded RSS markup becomes plain text before reaching the model', async () => {
  const result = await searchPublicSources({ query: 'AI', source: 'news', days: 7 }, { now, fetch: responder('<rss><channel><item><title>AI</title><link>https://example.org/new</link><description>&amp;lt;a href="https://example.org"&amp;gt;Article&amp;lt;/a&amp;gt;&amp;nbsp;Publisher</description></item></channel></rss>') });
  expect(result.items[0].summary).toBe('Article Publisher');
});
test('redirects are rejected without following their destination', async () => {
  let calls = 0;
  const result = await searchPublicSources({ query: 'AI', source: 'news', days: 7 }, { now, fetch: (async () => { calls++; return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/secrets' } }); }) as unknown as typeof fetch });
  expect(calls).toBe(1); expect(result.status).toBe('unreachable');
});


test('HTML block pages are incomplete coverage, not empty RSS search results', async () => {
  for (const source of ['news', 'reddit'] as const) {
    const result = await searchPublicSources({ source, query: 'AI', days: 30 }, { fetch: async () => new Response('<html><body>Access restricted</body></html>') });
    expect(result.status).toBe('unreachable');
    expect(result.items).toEqual([]);
  }
});


test('valid empty feeds remain clean empty results', async () => {
  for (const source of ['news', 'reddit'] as const) {
    const result = await searchPublicSources({ source, query: 'AI', days: 30 }, { fetch: async () => new Response(source === 'news' ? '<rss><channel/></rss>' : '<feed/>') });
    expect(result.status).toBe('no-results');
  }
});
