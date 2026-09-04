// Isolated UI verification only. No credentials, real AI, network sources, or notes.
export {};
const build = await Bun.build({ entrypoints: ['tests/browser-preview.ts'], target: 'browser', format: 'esm' });
if (!build.success) throw new Error(build.logs.join('\n'));
const script = await build.outputs[0].text();
const server = Bun.serve({ hostname: '127.0.0.1', port: 4179, fetch(request) {
  if (new URL(request.url).pathname === '/preview.js') return new Response(script, { headers: { 'Content-Type': 'text/javascript' } });
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>热点追踪 · 模拟宿主验证</title><style>body{margin:0;background:#e8ede9;font:13px/1.6 system-ui;color:#192c26}header,form{padding:10px 20px}header{background:#fff4dc}form{display:flex;align-items:center;gap:12px;flex-wrap:wrap}input,select,button{font:inherit;padding:6px 10px}input{width:280px}iframe{display:block;width:100%;height:calc(100vh - 155px);margin:auto;border:0;background:#fff}#status{padding:0 20px 10px}</style><header>模拟宿主验证：来源、AI、笔记和调度均为测试替身，不是真实热点，不调用外部服务。</header><form id="settings"></form><div id="status" role="status">尚未保存模拟笔记</div><iframe id="panel" title="热点追踪面板"></iframe><script type="module" src="/preview.js"></script></html>`, { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } });
} });
console.log(`Synthetic UI preview: http://127.0.0.1:${server.port}`);
