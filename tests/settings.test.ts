import { expect, test } from 'bun:test';
import manifest from '../manifest.json';
import { parseInterests, readDigestSettings } from '../src/settings';
import { fixture } from './fixture';

test('manifest exposes only interests and daily/weekly frequency', () => {
  expect(manifest.settings.fields.map(f => f.key)).toEqual(['digest.interests', 'digest.frequency']);
  expect(manifest.settings.fields[1].options?.map(o => o.value)).toEqual(['daily', 'weekly']);
});
test('interests accept Chinese/English separators and deduplicate without truncation', () => {
  expect(parseInterests(' AI，独立开发、AI; 科技产品\nai ')).toEqual(['ai', '独立开发', '科技产品']);
  expect(parseInterests(' ,；')).toEqual([]);
  expect(() => parseInterests('a,b,c,d,e,f')).toThrow('最多'); expect(() => parseInterests('a'.repeat(61))).toThrow('60');
});
test('unset fields are an empty subscription, not an implicit source/topic choice', async () => {
  const f = fixture(); f.host.settings!.get = async () => null;
  expect(await readDigestSettings(f.host, new AbortController().signal)).toEqual({ interests: [], frequency: 'weekly', valid: true, warning: '' });
});
test('missing settings API, invalid values and read failure fail closed', async () => {
  const f = fixture(); delete f.host.settings;
  expect((await readDigestSettings(f.host, new AbortController().signal)).valid).toBe(false);
  for (const value of [false, 7, 'a,b,c,d,e,f']) {
    f.host.settings = { get: async key => key === 'digest.interests' ? value : 'daily' };
    expect((await readDigestSettings(f.host, new AbortController().signal)).valid).toBe(false);
  }
  f.host.settings = { get: async () => { throw new Error('unreadable'); } };
  expect((await readDigestSettings(f.host, new AbortController().signal)).warning).toContain('暂停');
});
test('deactivation interrupts an unresponsive settings API', async () => {
  const f = fixture(); f.host.settings!.get = () => new Promise(() => {});
  const controller = new AbortController(); const pending = readDigestSettings(f.host, controller.signal); controller.abort();
  await expect(pending).rejects.toThrow();
});
