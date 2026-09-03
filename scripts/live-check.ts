import { searchPublicSources } from '../src/sources';
import { SOURCES } from '../src/types';
for (const source of SOURCES) {
  const result = await searchPublicSources({ query: 'OpenAI', days: 30, source, limit: 3 }, { fetch: (url, init) => fetch(url, init) });
  console.log(JSON.stringify({ source, status: result.status, count: result.items.length, first: result.items[0]?.title, publishedAt: result.items[0]?.publishedAt }));
}
