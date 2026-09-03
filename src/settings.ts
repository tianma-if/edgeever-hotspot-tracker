import manifest from '../manifest.json';
import { boundedRequest } from './requests';
import { SOURCES, type PluginHost, type Run, type Source } from './types';

export interface ResearchDefaults {
  days: number;
  depth: Run['depth'];
  sources: Source[];
  warning: string;
}

// The manifest owns both the host's form and the fallback defaults.
export async function readResearchDefaults(host: PluginHost, signal: AbortSignal): Promise<ResearchDefaults> {
  const fields = manifest.settings.fields;
  const values = new Map<string, unknown>(fields.map(field => [field.key, field.default]));
  let failed = false;
  if (host.settings) {
    try {
      const stored = await boundedRequest(() => Promise.allSettled(fields.map(async field => [field.key, await host.settings!.get(field.key)] as const)), signal, 5000);
      for (const result of stored) {
        if (result.status === 'rejected') { failed = true; continue; }
        const [key, value] = result.value;
        if (value !== null) values.set(key, value);
      }
    } catch (error) {
      if (signal.aborted) throw error;
      failed = true;
    }
  }
  for (const field of fields) {
    const value = values.get(field.key);
    const valid = field.type === 'boolean' ? typeof value === 'boolean' : field.options?.some(option => option.value === value);
    if (!valid) { values.set(field.key, field.default); failed = true; }
  }
  const sources = SOURCES.filter(source => values.get(`source.${source}`) === true);
  return {
    days: Number(values.get('default.days')),
    depth: values.get('default.depth') as Run['depth'],
    sources,
    warning: !sources.length ? '默认来源全部关闭，请为本次研究选择至少一个来源，或到插件设置中开启来源。'
      : failed ? '部分插件设置暂时无法读取或无效，已使用默认值。可检查本次选项后开始研究。' : '',
  };
}
