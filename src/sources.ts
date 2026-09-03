/** Fixed public-source requests, intended to run inside EdgeEver's existing backend.
 * No user-supplied URLs, browser cookies, API keys or external proxy. */
import { XMLParser } from 'fast-xml-parser';
import { decodeHTML } from 'entities';
import type { Evidence, SearchInput, SearchResult } from './types';
const parser = new XMLParser({ ignoreAttributes: true, processEntities: false });
const clean = (value: unknown, length = 1600): string => decodeHTML(decodeHTML(String(value ?? ''))).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
const list = (v: unknown): any[] => Array.isArray(v) ? v : v ? [v] : [];
const date = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) return undefined;
  return new Date(v).toISOString();
};
export function safeUrl(value: unknown): string | undefined {
  try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
async function read(response: Response): Promise<string> {
  if (!response.ok) throw new Error(response.status === 429 || response.status === 403 ? 'rate-limited' : `HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 2_000_000) throw new Error('Response too large'); parts.push(value);
    }
  } finally { await reader.cancel(); }
  return new TextDecoder().decode(BufferlessConcat(parts, size));
}
function BufferlessConcat(parts: Uint8Array[], size: number) { const all = new Uint8Array(size); let offset = 0; for (const part of parts) { all.set(part, offset); offset += part.length; } return all; }
export async function searchPublicSources(input: SearchInput, options: { fetch?: typeof fetch; signal?: AbortSignal; now?: number } = {}): Promise<SearchResult> {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now();
  const since = new Date(now - input.days * 86400000);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 15);
  const signal = AbortSignal.any([AbortSignal.timeout(20000), ...(options.signal ? [options.signal] : [])]);
  const get = async (url: URL) => read(await request(url, { signal, redirect: 'manual', headers: { Accept: 'application/json, application/rss+xml, application/atom+xml, text/xml', 'User-Agent': 'EdgeEver-Hotspot-Tracker/0.1 (+https://edgeever.org)' } }));
  try {
    let items: Evidence[] = [];
    if (input.source === 'news') {
      const url = new URL('https://news.google.com/rss/search');
      const isChinese = /[\u3400-\u9fff]/.test(input.query);
      url.search = new URLSearchParams({ q: `${input.query} after:${since.toISOString().slice(0, 10)}`, hl: isChinese ? 'zh-CN' : 'en-US', gl: isChinese ? 'CN' : 'US', ceid: isChinese ? 'CN:zh-Hans' : 'US:en' }).toString();
      const feed = parser.parse(await get(url));
      items = list(feed?.rss?.channel?.item).map((item) => ({ id: '', source: input.source, title: clean(item.title, 400), url: safeUrl(item.link) ?? '', summary: clean(item.description), publishedAt: date(item.pubDate), author: clean(item.source, 120), coverage: 'headline' as const }));
    } else if (input.source === 'hackernews') {
      const url = new URL('https://hn.algolia.com/api/v1/search');
      url.search = new URLSearchParams({ query: input.query, tags: 'story', numericFilters: `created_at_i>=${Math.floor(since.getTime() / 1000)},created_at_i<=${Math.floor(now / 1000)}`, hitsPerPage: String(limit) }).toString();
      const json = JSON.parse(await get(url));
      if (!Array.isArray(json.hits)) throw new Error('Source response changed');
      items = json.hits.map((hit: any) => ({ id: '', source: input.source, title: clean(hit.title, 400), url: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`, summary: clean(hit.story_text) || clean(hit.title), publishedAt: date(hit.created_at), author: clean(hit.author, 120), engagement: Math.max(0, Number(hit.points) || 0), coverage: 'discussion' as const }));
      // Two bounded enrichments per query; a failed comment fetch never discards search results.
      await Promise.all(items.slice(0, 2).map(async (item) => {
        try {
          const id = new URL(item.url).searchParams.get('id');
          if (!/^\d+$/.test(id ?? '')) return;
          const detail = JSON.parse(await get(new URL(`https://hn.algolia.com/api/v1/items/${id}`)));
          item.comments = list(detail.children).filter((child) => !child.deleted && child.text).slice(0, 3).map((child) => `${clean(child.author, 80)}: ${clean(child.text, 700)}`);
        } catch { /* Search coverage survives optional enrichment failure. */ }
      }));
    } else if (input.source === 'github') {
      const url = new URL('https://api.github.com/search/issues');
      url.search = new URLSearchParams({ q: `${input.query} is:public created:${since.toISOString().slice(0, 10)}..${new Date(now).toISOString().slice(0, 10)}`, sort: 'comments', per_page: String(limit) }).toString();
      const json = JSON.parse(await get(url));
      if (!Array.isArray(json.items)) throw new Error('Source response changed');
      items = json.items.map((item: any) => ({ id: '', source: input.source, title: clean(item.title, 400), url: safeUrl(item.html_url) ?? '', summary: clean(item.body), publishedAt: date(item.created_at), author: clean(item.user?.login, 120), engagement: Math.max(0, Number(item.comments) || 0), coverage: 'discussion' as const }));
    } else if (input.source === 'reddit') {
      const url = new URL('https://www.reddit.com/search.rss');
      url.search = new URLSearchParams({ q: input.query, sort: 'new', limit: String(limit), t: input.days <= 7 ? 'week' : input.days <= 30 ? 'month' : 'year' }).toString();
      const xml = await get(url);
      // Atom link attributes must be parsed explicitly; public feed bodies are not full comment trees.
      const atom = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(xml);
      items = list(atom?.feed?.entry).map((entry) => ({ id: '', source: input.source, title: clean(entry.title, 400), url: safeUrl(list(entry.link).find((l) => l['@_href'])?.['@_href']) ?? '', summary: clean(entry.content?.['#text'] ?? entry.content), publishedAt: date(entry.published ?? entry.updated), author: clean(entry.author?.name, 120), coverage: 'headline' as const }));
    } else { throw new Error('Unsupported source'); }
    items = items.filter((item) => item.url && item.title && (!item.publishedAt || (Date.parse(item.publishedAt) >= since.getTime() && Date.parse(item.publishedAt) <= now))).slice(0, limit);
    return { source: input.source, status: items.length ? 'ok' : 'no-results', items };
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    console.warn(`[research:${input.source}]`, error instanceof Error ? error.name : 'Source request failed');
    return { source: input.source, status: error instanceof Error && error.message === 'rate-limited' ? 'rate-limited' : 'unreachable', items: [], message: '来源暂时无法访问，本次报告不包含该来源的完整覆盖。' };
  }
}
