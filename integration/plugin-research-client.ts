import type { ResearchBridge, SearchInput, SearchResult, AiInput } from '@edgeever/plugin-api';
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
export const createPluginResearchClient = (request: Request): ResearchBridge => ({
  ai: {
    status: () => request('/api/v1/plugins/research/status'),
    generate: ({ signal, ...input }: AiInput) => request('/api/v1/plugins/research/generate', { method: 'POST', body: JSON.stringify(input), signal }),
  },
  research: {
    search: (input: SearchInput, options) => request<SearchResult>('/api/v1/plugins/research/search', { method: 'POST', body: JSON.stringify(input), signal: options?.signal }),
  },
});
