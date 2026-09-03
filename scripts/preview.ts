import { resolve } from 'node:path';
const root = resolve(import.meta.dir, '../dist');
const port = Number(process.env.PORT ?? 4178);
Bun.serve({ hostname: '127.0.0.1', port, async fetch(request) {
  const url = new URL(request.url);
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (!['/manifest.json', '/main.js', '/LICENSE'].includes(url.pathname)) return new Response('EdgeEver 热点追踪开发包。请在 EdgeEver 插件市场使用本服务的 /manifest.json 地址安装。', { headers: { ...headers, 'Content-Type': 'text/plain;charset=utf-8' } });
  const file = Bun.file(root + url.pathname); if (!await file.exists()) return new Response('Run bun run build first.', { status: 404, headers });
  return new Response(file, { headers: { ...headers, 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.json') ? 'application/json' : 'text/plain' } });
} });
console.log(`Development manifest: http://127.0.0.1:${port}/manifest.json`);
