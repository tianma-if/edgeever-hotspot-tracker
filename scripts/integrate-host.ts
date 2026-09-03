/** Maintainer integration: ships required capabilities in EdgeEver itself, never an end-user setup step. */
import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const target = resolve(process.argv[2] ?? '../edgeever');
if (!await Bun.file(join(target, 'packages/plugin-api/src/index.ts')).exists()) throw new Error('Expected an EdgeEver source checkout');
const root = resolve(import.meta.dir, '..');
async function edit(path: string, marker: string, before: string, after: string) {
  const full = join(target, path); const content = await readFile(full, 'utf8');
  if (content.includes(marker)) return;
  if (!content.includes(before)) throw new Error(`Integration anchor changed: ${path}`);
  await writeFile(full, content.replace(before, after));
}
async function copy(from: string, to: string, transform = (s: string) => s) {
  const content = transform(await readFile(join(root, from), 'utf8'));
  const full = join(target, to); await mkdir(resolve(full, '..'), { recursive: true }); await writeFile(full, content);
}
const protocol = (await readFile(join(root, 'src/types.ts'), 'utf8')).split('export interface PluginHost')[0];
await writeFile(join(target, 'packages/plugin-api/src/research.ts'), protocol);
await edit('packages/plugin-api/src/index.ts', '"ai:generate"', '  "network",', '  "network",\n  "ai:generate",\n  "research:search",');
await edit('packages/plugin-api/src/index.ts', 'export * from "./research"', 'export const PLUGIN_API_VERSION', 'import type { ResearchBridge } from "./research";\nexport * from "./research";\n\nexport const PLUGIN_API_VERSION');
await edit('packages/plugin-api/src/index.ts', "ai: ResearchBridge['ai']", '  pluginId: string;\n  notes:', "  pluginId: string;\n  ai: ResearchBridge['ai'];\n  research: ResearchBridge['research'];\n  notes:");
await copy('src/sources.ts', 'apps/api/src/plugin-research-sources.ts', (s) => s.replace("from './types'", "from '@edgeever/plugin-api'"));
await copy('integration/plugin-research-routes.ts', 'apps/api/src/plugin-research-routes.ts');
await copy('integration/plugin-research-client.ts', 'packages/client/src/plugin-research-client.ts');
await edit('apps/api/src/index.ts', 'import { registerPluginResearchRoutes }', 'import { registerAiRoutes }', 'import { registerPluginResearchRoutes } from "./plugin-research-routes";\nimport { registerAiRoutes }');
await edit('apps/api/src/index.ts', 'registerPluginResearchRoutes(app,', 'registerAiRoutes(app, {', 'registerPluginResearchRoutes(app, { isDemoMode: (...args) => isDemoMode(...args) });\nregisterAiRoutes(app, {');
await edit('packages/client/src/index.ts', 'import { createPluginResearchClient }', 'import ', 'import { createPluginResearchClient } from "./plugin-research-client";\nimport ');
await edit('packages/client/src/index.ts', 'pluginResearch: createPluginResearchClient(request)', '    getInstanceHealth:', '    pluginResearch: createPluginResearchClient(request),\n    getInstanceHealth:');
const clientPackagePath = join(target, 'packages/client/package.json');
const clientPackage = JSON.parse(await readFile(clientPackagePath, 'utf8'));
clientPackage.dependencies['@edgeever/plugin-api'] = 'workspace:*'; await writeFile(clientPackagePath, JSON.stringify(clientPackage, null, 2) + '\n');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'type ResearchBridge,', '  type PluginContext,', '  type PluginContext,\n  type ResearchBridge,');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'researchAdapter?: ResearchBridge;', '  scope: string;\n  onWorkspaceChanged', '  scope: string;\n  researchAdapter?: ResearchBridge;\n  onWorkspaceChanged');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'private readonly researchAdapter?', '  private readonly repository:', '  private readonly researchAdapter?: ResearchBridge;\n  private readonly repository:');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'this.researchAdapter = options.researchAdapter;', '    this.repository = options.repository;', '    this.researchAdapter = options.researchAdapter;\n    this.repository = options.repository;');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'const researchLifetime = new AbortController()', '    const secretNamespace = `${this.scope}:${manifest.id}`;', '    const secretNamespace = `${this.scope}:${manifest.id}`;\n    const researchLifetime = new AbortController();\n    disposers.push(() => researchLifetime.abort());');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'this.researchAdapter.ai.generate', '      pluginId: manifest.id,\n      notes:', `      pluginId: manifest.id,
      ai: {
        status: async () => {
          assertPermission(manifest, "ai:generate");
          researchLifetime.signal.throwIfAborted();
          if (!this.researchAdapter) throw new Error("AI research is unavailable in this host.");
          return this.researchAdapter.ai.status();
        },
        generate: async (input) => {
          assertPermission(manifest, "ai:generate");
          researchLifetime.signal.throwIfAborted();
          if (!this.researchAdapter) throw new Error("AI research is unavailable in this host.");
          return this.researchAdapter.ai.generate({ ...input, signal: AbortSignal.any([researchLifetime.signal, ...(input.signal ? [input.signal] : [])]) });
        },
      },
      research: {
        search: async (input, options) => {
          assertPermission(manifest, "research:search");
          researchLifetime.signal.throwIfAborted();
          if (!this.researchAdapter) throw new Error("Research search is unavailable in this host.");
          return this.researchAdapter.research.search(input, { signal: AbortSignal.any([researchLifetime.signal, ...(options?.signal ? [options.signal] : [])]) });
        },
      },
      notes:`);
await edit('apps/web/src/components/WorkspaceApp.tsx', 'researchAdapter: api.pluginResearch,', 'scope: localDataScope,', 'scope: localDataScope,\n    researchAdapter: api.pluginResearch,');
console.log(`Integrated research host APIs into ${target}. Run the EdgeEver checks before release.`);

// Radix portals can attach the container after the parent's effect has fired.
await edit('apps/web/src/components/plugins/PluginPanelDialog.tsx', 'const [container, setContainer]', 'const containerRef = useRef<HTMLDivElement>(null);', 'const [container, setContainer] = useState<HTMLDivElement | null>(null);');
await edit('apps/web/src/components/plugins/PluginPanelDialog.tsx', '    // Container is reactive so delayed portal attachment mounts the plugin.', '    const container = containerRef.current;', '    // Container is reactive so delayed portal attachment mounts the plugin.');
await edit('apps/web/src/components/plugins/PluginPanelDialog.tsx', '[container, host, options, panelId, panelPluginId]', '[host, options, panelId, panelPluginId]', '[container, host, options, panelId, panelPluginId]');
await edit('apps/web/src/components/plugins/PluginPanelDialog.tsx', 'ref={setContainer}', 'ref={containerRef}', 'ref={setContainer}');

await edit('apps/web/src/components/plugins/PluginPanelDialog.tsx', 'import { useEffect, useState }', 'import { useEffect, useRef, useState }', 'import { useEffect, useState }');
await copy('integration/plugin-research-routes.test.mjs', 'apps/api/src/plugin-research-routes.test.mjs');
await copy('integration/plugin-research-permissions.test.mjs', 'apps/web/src/lib/plugins/plugin-research-permissions.test.mjs');

const rootPackagePath = join(target, 'package.json');
const hostPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'));
hostPackage.dependencies.entities ??= '^8.0.0';
await writeFile(rootPackagePath, JSON.stringify(hostPackage, null, 2) + '\n');

// Serialize React effect start/cleanup and deduplicate asynchronous plugin activation.
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'private lifecycleQueue:', '  private started = false;', '  private started = false;\n  private lifecycleQueue: Promise<void> = Promise.resolve();\n  private readonly activatingPlugins = new Map<string, Promise<void>>();\n\n  private enqueueLifecycle(action: () => Promise<void>) {\n    const pending = this.lifecycleQueue.then(action, action);\n    this.lifecycleQueue = pending.catch(() => undefined);\n    return pending;\n  }');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'return this.enqueueLifecycle(async () => {\n    this.start();', '  async activateEnabled() {\n    this.start();', '  activateEnabled() {\n    return this.enqueueLifecycle(async () => {\n    this.start();');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'this.applyActiveTheme();\n    });\n  }\n\n  async installFromSource', 'this.applyActiveTheme();\n  }\n\n  async installFromSource', 'this.applyActiveTheme();\n    });\n  }\n\n  async installFromSource');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'return this.enqueueLifecycle(async () => {\n    this.started = false;', '  async dispose() {\n    this.started = false;', '  dispose() {\n    return this.enqueueLifecycle(async () => {\n    this.started = false;');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'new Set([...this.activePlugins.keys(), ...this.activatingPlugins.keys()])', '    for (const pluginId of [...this.activePlugins.keys()]) await this.deactivatePlugin(pluginId);\n  }', '    for (const pluginId of new Set([...this.activePlugins.keys(), ...this.activatingPlugins.keys()])) await this.deactivatePlugin(pluginId);\n    });\n  }');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'private async activatePluginOnce(', '  private async activatePlugin(pluginId: string) {', '  private activatePlugin(pluginId: string) {\n    const current = this.activatingPlugins.get(pluginId);\n    if (current) return current;\n    const pending = this.activatePluginOnce(pluginId).finally(() => { this.activatingPlugins.delete(pluginId); });\n    this.activatingPlugins.set(pluginId, pending);\n    return pending;\n  }\n\n  private async activatePluginOnce(pluginId: string) {');
await edit('apps/web/src/lib/plugins/plugin-host.ts', 'await this.activatingPlugins.get(pluginId)?.catch', '  private async deactivatePlugin(pluginId: string) {\n    const active', '  private async deactivatePlugin(pluginId: string) {\n    await this.activatingPlugins.get(pluginId)?.catch(() => undefined);\n    const active');
await copy('integration/plugin-research-lifecycle.fixture.mjs', 'apps/web/src/lib/plugins/plugin-research-lifecycle.fixture.mjs');
await copy('integration/plugin-research-lifecycle.test.mjs', 'apps/web/src/lib/plugins/plugin-research-lifecycle.test.mjs');
