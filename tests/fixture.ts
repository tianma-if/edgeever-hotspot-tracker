import type { PluginHost } from '../src/types';

/** Deterministic, explicitly synthetic host. Never writes workspace notes or calls a provider. */
export function fixture() {
  const values = new Map<string, unknown>();
  const settings: Record<string, string | boolean> = { 'digest.interests': 'AI, 独立开发', 'digest.frequency': 'weekly' };
  const commands = new Map<string, () => void | Promise<void>>();
  const schedules = new Map<string, Parameters<NonNullable<PluginHost['schedules']>['upsert']>[0]>();
  const notes: Parameters<PluginHost['notes']['create']>[0][] = [];
  const calls = { searches: 0, generated: 0, upserts: 0, removals: [] as string[], opened: '' };
  const host: PluginHost = {
    settings: { get: async key => settings[key] ?? null },
    ai: {
      status: async () => ({ configured: true, modelName: 'Synthetic fixture' }),
      generate: async input => {
        calls.generated++;
        if (input.maxOutputTokens === 500) return { text: JSON.stringify({ queries: [input.prompt] }) };
        if (input.maxOutputTokens === 900) return { text: JSON.stringify({ keep: JSON.parse(input.prompt).evidence.map((e: { id: string }) => e.id) }) };
        return { text: '## AI\n\n测试资料中的更新 [E1]。\n\n## 独立开发\n\n测试资料中的新变化 [E2]。\n\n> 这是合成测试报告，不是真实热点。' };
      },
    },
    network: { fetch: async input => {
      calls.searches++; const url = new URL(input);
      if (url.hostname === 'news.google.com') {
        const query = (url.searchParams.get('q') ?? '').split(' after:')[0];
        return new Response(`<rss><channel><item><title>${query} 测试动态</title><link>https://example.org/fixture/${encodeURIComponent(query)}</link><description>${query} 合成测试资料，不是真实热点</description><pubDate>${new Date(Date.now() - 60_000).toUTCString()}</pubDate></item></channel></rss>`);
      }
      return new Response(url.hostname === 'hn.algolia.com' ? '{"hits":[]}' : url.hostname === 'api.github.com' ? '{"items":[]}' : '<feed/>');
    } },
    commands: { register: command => { commands.set(command.id, command.run); return () => { commands.delete(command.id); }; } },
    schedules: { upsert: async input => { calls.upserts++; schedules.set(input.key, input); }, remove: async key => { calls.removals.push(key); schedules.delete(key); } },
    ui: { panels: { register: () => () => {}, open: async () => {} }, showNotice: () => {}, openNote: async id => { calls.opened = id; } },
    storage: { get: async <T>(key: string) => structuredClone(values.get(key) ?? null) as T | null, set: async (key, value) => { values.set(key, structuredClone(value)); }, remove: async key => { values.delete(key); } },
    notebooks: { list: async () => [{ id: 'first', name: '首个笔记本' }, { id: 'nb_inbox', name: '收件箱' }] },
    notes: { create: async input => { notes.push(input); return { id: `fixture-note-${notes.length}` }; } },
  };
  return { host, values, settings, commands, schedules, notes, calls };
}
