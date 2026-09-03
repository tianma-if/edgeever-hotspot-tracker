import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const result = await Bun.build({ entrypoints: ['src/index.ts'], outdir: 'dist', naming: 'main.js', target: 'browser', format: 'esm', minify: true, metafile: true });
if (!result.success) throw new Error(result.logs.join('\n'));
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('LICENSE', 'dist/LICENSE');
console.log(`Built plugin: ${Math.round((await Bun.file('dist/main.js').size) / 1024)} KiB`);

const notices: string[] = [];
const metadata = typeof result.metafile === 'string' ? JSON.parse(result.metafile) : result.metafile;
if (!metadata) throw new Error('Build metadata is required to collect bundled dependency licenses.');
const packageRoots = new Set<string>();
for (const input of Object.keys(metadata.inputs)) {
  const marker = input.lastIndexOf('node_modules/'); if (marker < 0) continue;
  const parts = input.slice(marker + 'node_modules/'.length).split('/');
  packageRoots.add(input.slice(0, marker) + 'node_modules/' + parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/'));
}
for (const root of [...packageRoots].sort()) {
  const pkg = await Bun.file(`${root}/package.json`).json();
  let license = '';
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']) {
    const file = Bun.file(`${root}/${filename}`); if (await file.exists()) { license = await file.text(); break; }
  }
  // This published package omits LICENSE; keep the upstream text pinned and offline.
  if (!license && pkg.name === '@nodable/entities' && pkg.version === '3.0.0') license = await Bun.file('licenses/nodable-entities-3.0.0.txt').text();
  if (!license) throw new Error(`Missing bundled dependency license: ${pkg.name}`);
  notices.push(`=== ${pkg.name} ${pkg.version} (${pkg.license}) ===\n\n${license}`);
}
await Bun.write('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
