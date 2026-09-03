import { selectedSources } from './engine';
import type { PluginHost, Run, SavedState, Watch, Source } from './types';
const KEY = 'research-state-v1';
export class ResearchStore {
  state: SavedState = { version: 1, runs: [], watches: [] };
  private pending: Promise<void> = Promise.resolve();
  constructor(private host: Pick<PluginHost, 'storage'>) {}
  async load() {
    const saved = await this.host.storage.get<SavedState>(KEY);
    if (saved?.version === 1 && Array.isArray(saved.runs) && Array.isArray(saved.watches)) {
      this.state = saved;
      for (const run of this.state.runs) if (['planning', 'searching', 'writing'].includes(run.status)) { run.status = 'interrupted'; run.progress = '上次研究被中断，已有资料已保留，可重新运行'; }
    }
    await this.save();
  }
  save() {
    const snapshot = structuredClone(this.state);
    this.pending = this.pending.catch(() => {}).then(() => this.host.storage.set(KEY, snapshot));
    return this.pending;
  }
  async addRun(run: Run) { this.state.runs.unshift(run); this.state.runs = this.state.runs.slice(0, 30); await this.save(); }
  async addWatch(topic: string, days: number, sources?: Source[], depth: Run['depth'] = 'standard') {
    const selected = selectedSources(sources);
    if (!selected.length) throw new Error('请至少选择一个检索来源。');
    const existing = this.state.watches.find((item) => item.topic.toLocaleLowerCase() === topic.trim().toLocaleLowerCase() && item.days === days && (item.depth ?? 'standard') === depth && selectedSources(item.sources).join() === selected.join());
    if (existing) return existing;
    if (this.state.watches.length >= 30) throw new Error('最多追踪 30 个主题，请先移除不再关注的主题。');
    const watch: Watch = { id: crypto.randomUUID(), topic: topic.trim(), days, sources: selected, depth, scheduled: false };
    this.state.watches.push(watch); await this.save(); return watch;
  }
}
