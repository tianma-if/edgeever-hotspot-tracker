import { searchPublicSources } from './sources';
import type { PluginHost, ResearchBridge } from './types';

/** Compose plugin business logic exclusively from general-purpose host capabilities. */
export function createResearchRuntime(host: Pick<PluginHost, 'ai' | 'network'>): ResearchBridge | null {
  if (!host.network) return null;
  return {
    ai: host.ai ?? {
      status: async () => ({ configured: false }),
      generate: async () => { throw new Error('当前 EdgeEver 尚未开放通用 AI 调用能力，已检索资料仍可浏览和保存。'); },
    },
    research: {
      search: (input, options) => searchPublicSources(input, {
        fetch: (url, init) => host.network!.fetch(url, { ...init, transport: 'public' }),
        signal: options?.signal,
      }),
    },
  };
}
