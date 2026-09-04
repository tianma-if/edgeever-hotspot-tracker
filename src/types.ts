export type Source = 'news' | 'hackernews' | 'github' | 'reddit';
export const SOURCE_NAMES: Record<Source, string> = { news: '新闻资讯', hackernews: 'Hacker News', github: 'GitHub', reddit: 'Reddit' };
export const SOURCES = Object.keys(SOURCE_NAMES) as Source[];
export interface Evidence {
  id: string; source: Source; title: string; url: string; summary: string;
  publishedAt?: string; author?: string; engagement?: number; comments?: string[];
  coverage: 'headline' | 'discussion'; score?: number;
  interests?: string[];
}
export interface SearchInput { query: string; days: number; source: Source; limit?: number }
export interface SearchResult {
  source: Source; status: 'ok' | 'no-results' | 'rate-limited' | 'unreachable' | 'error';
  items: Evidence[]; message?: string; interest?: string; query?: string;
}
export interface AiInput { system: string; prompt: string; maxOutputTokens?: number; signal?: AbortSignal }
// Generic host AI API; no source names or research contracts belong in the host SDK.
export interface AiCapability {
  status(): Promise<{ configured: boolean; modelName?: string }>;
  generate(input: AiInput): Promise<{ text: string }>;
}
export type PublicFetch = (input: string, init?: RequestInit & { transport?: 'direct' | 'public' }) => Promise<Response>;
// Internal dependency bundle owned by this plugin, never a host API.
export interface ResearchBridge {
  ai: AiCapability;
  research: { search(input: SearchInput, options?: { signal?: AbortSignal }): Promise<SearchResult> };
}
export interface PluginHost {
  ai?: AiCapability;
  network?: { fetch: PublicFetch };
  settings?: { get(key: string): Promise<string | number | boolean | null> };
  commands: { register(command: { id: string; title: string; run(): void | Promise<void> }): () => void };
  ui: {
    panels: { register(panel: { id: string; title: string; presentation?: 'fullscreen'; mount(container: HTMLElement): (() => void) | void }): () => void; open(id: string): Promise<void> };
    showNotice(message: string): void; openNote(id: string): Promise<void>;
  };
  storage: { get<T>(key: string): Promise<T | null>; set<T>(key: string, value: T): Promise<void>; remove(key: string): Promise<void> };
  notebooks: { list(): Promise<{ id: string; name: string }[]> };
  notes: { create(input: { notebookId: string; title: string; contentMarkdown: string; tags: string[] }): Promise<{ id: string }> };
  schedules?: { upsert(input: { key: string; name: string; commandId: string; cronExpression: string; missedRunPolicy: 'skip'; isEnabled?: boolean }): Promise<unknown>; remove(key: string): Promise<void> };
}
export type RunStatus = 'planning' | 'searching' | 'writing' | 'complete' | 'interrupted' | 'cancelled' | 'error';
export interface FollowUp { question: string; answer: string }
export interface Run {
  id: string; topic: string; days: number; depth: 'quick' | 'standard' | 'deep';
  createdAt: string; status: RunStatus; progress: string; queries: string[];
  evidence: Evidence[]; coverage: SearchResult[]; report: string; warnings: string[];
  sources?: Source[]; reportKind?: 'ai' | 'evidence' | 'empty';
  followUps: FollowUp[]; noteId?: string; watchId?: string; newEvidence?: number;
  digest?: { frequency: 'daily' | 'weekly'; interests: string[]; periodKey: string };
}
export interface Watch { id: string; topic: string; days: number; scheduled: boolean; sources?: Source[]; depth?: Run['depth']; baselineUrls?: string[]; notebookId?: string; lastRunId?: string }
export interface SavedState { version: 1; runs: Run[]; watches: Watch[]; digestPaused?: boolean; digestNotes?: { periodKey: string; noteId: string }[] }
