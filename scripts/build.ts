import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const result = await Bun.build({ entrypoints: ['src/index.ts'], outdir: 'dist', naming: 'main.js', target: 'browser', format: 'esm', minify: true });
if (!result.success) throw new Error(result.logs.join('\n'));
await copyFile('manifest.json', 'dist/manifest.json');
await copyFile('LICENSE', 'dist/LICENSE');
console.log(`Built plugin: ${Math.round((await Bun.file('dist/main.js').size) / 1024)} KiB`);

const notices: string[] = [];
for (const name of ['marked', 'dompurify', 'fast-xml-parser', 'entities']) {
  const pkg = await Bun.file(`node_modules/${name}/package.json`).json();
  notices.push(`=== ${name} ${pkg.version} (${pkg.license}) ===\n\n${await Bun.file(`node_modules/${name}/LICENSE`).text()}`);
}
await Bun.write('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
