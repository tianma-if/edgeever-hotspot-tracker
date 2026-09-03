import { expect, test } from 'bun:test';
import { readResearchDefaults } from '../src/settings';
import type { PluginHost } from '../src/types';

function host(values: Record<string, unknown>): PluginHost {
  return { settings: { get: async key => values[key] ?? null } } as PluginHost;
}
test('missing settings API and unset fields retain the original defaults', async () => {
  for (const context of [{} as PluginHost, host({})]) {
    expect(await readResearchDefaults(context, new AbortController().signal)).toEqual({ days: 30, depth: 'standard', sources: ['news', 'hackernews', 'github', 'reddit'], warning: '' });
  }
});
test('native settings select research defaults and never re-enable explicitly disabled sources', async () => {
  const context = host({ 'default.days': '7', 'default.depth': 'quick', 'source.news': false, 'source.hackernews': false, 'source.github': true, 'source.reddit': false });
  expect(await readResearchDefaults(context, new AbortController().signal)).toEqual({ days: 7, depth: 'quick', sources: ['github'], warning: '' });
  context.settings = host({ 'source.news': false, 'source.hackernews': false, 'source.github': false, 'source.reddit': false }).settings;
  const empty = await readResearchDefaults(context, new AbortController().signal);
  expect(empty.sources).toEqual([]); expect(empty.warning).toContain('至少一个来源');
});
test('invalid or unreadable fields fall back without losing valid preferences', async () => {
  const context = host({ 'default.days': '365', 'default.depth': 'quick', 'source.news': 'false', 'source.reddit': false });
  const get = context.settings!.get;
  context.settings!.get = async key => { if (key === 'source.github') throw new Error('Unreadable setting'); return get(key); };
  const defaults = await readResearchDefaults(context, new AbortController().signal);
  expect(defaults.days).toBe(30); expect(defaults.depth).toBe('quick');
  expect(defaults.sources).toEqual(['news', 'hackernews', 'github']); expect(defaults.warning).toContain('默认值');
});
test('deactivation interrupts an unresponsive settings API', async () => {
  const context = host({}); context.settings!.get = () => new Promise(() => {});
  const controller = new AbortController(); const pending = readResearchDefaults(context, controller.signal); controller.abort();
  await expect(pending).rejects.toThrow();
});
