import manifest from '../manifest.json';
import { boundedRequest } from './requests';
import type { PluginHost } from './types';

export type Frequency = 'daily' | 'weekly';
export interface DigestSettings { interests: string[]; frequency: Frequency; valid: boolean; warning: string }
export const SETTINGS_POLL_MS = 30_000;
export const frequencyName = (frequency: Frequency) => frequency === 'daily' ? '日报' : '周报';
export const scheduleLabel = (frequency: Frequency) => frequency === 'daily' ? '每日 09:00' : '每周一 09:00';

export function parseInterests(value: string): string[] {
  const interests = [...new Map(value.split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean).map(s => [s.toLocaleLowerCase(), s])).values()];
  if (interests.length > 5 || interests.some(s => s.length > 60)) throw new Error('最多填写 5 个关注领域，每个不超过 60 字；请用逗号分隔。');
  return interests;
}

export async function readDigestSettings(host: PluginHost, signal: AbortSignal): Promise<DigestSettings> {
  const fallback: DigestSettings = { interests: [], frequency: 'weekly', valid: false, warning: '' };
  if (!host.settings) return { ...fallback, warning: '当前 EdgeEver 不支持插件设置，请升级兼容版本后配置关注领域。' };
  try {
    const values = await boundedRequest(() => Promise.all(manifest.settings.fields.map(async field => [field.key, await host.settings!.get(field.key) ?? field.default] as const)), signal, 5000);
    const fields = new Map<string, unknown>(values);
    const interests = fields.get('digest.interests'); const frequency = fields.get('digest.frequency');
    if (typeof interests !== 'string' || !['daily', 'weekly'].includes(String(frequency))) throw new Error('插件设置无效，请重新保存关注领域和生成频率。');
    return { interests: parseInterests(interests), frequency: frequency as Frequency, valid: true, warning: '' };
  } catch (error) {
    signal.throwIfAborted();
    return { ...fallback, warning: `暂未应用设置，自动生成已暂停。${error instanceof Error ? error.message : '请检查插件设置后重试。'}` };
  }
}
