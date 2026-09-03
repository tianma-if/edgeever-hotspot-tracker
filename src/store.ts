import type { PluginHost, Run, SavedState, Watch } from './types';
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
  async addWatch(topic: string, days: number) {
    const existing = this.state.watches.find((item) => item.topic.toLocaleLowerCase() === topic.trim().toLocaleLowerCase() && item.days === days);
    if (existing) return existing;
    if (this.state.watches.length >= 30) throw new Error('最多追踪 30 个主题，请先移除不再关注的主题。');
    const watch: Watch = { id: crypto.randomUUID(), topic: topic.trim(), days, scheduled: false };
    this.state.watches.push(watch); await this.save(); return watch;
  }
}
