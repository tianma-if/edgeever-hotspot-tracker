import { exportMarkdown, newRun, regenerateReport, research } from './engine';
import { boundedRequest } from './requests';
import { createResearchRuntime } from './runtime';
import { frequencyName, readDigestSettings, SETTINGS_POLL_MS, type DigestSettings, type Frequency } from './settings';
import { ResearchStore } from './store';
import type { PluginHost, Run } from './types';

export const DIGEST_COMMAND = 'generate-digest';
export const DIGEST_SCHEDULE = 'hotspot-digest';
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function periodKey(frequency: Frequency, date: Date): string {
  const start = new Date(date);
  if (frequency === 'weekly') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return `${frequency}:${localDate(start)}`;
}

/** Owns the workflow even when its panel has never been opened. */
export class DigestService {
  readonly store: ResearchStore;
  settings: DigestSettings = { interests: [], frequency: 'weekly', valid: false, warning: '' };
  notice = ''; scheduleWarning = ''; scheduleActive = false; loading = true;
  running?: { run?: Run; controller: AbortController; scheduled: boolean };
  private lifetime = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private unregister?: () => void;
  private refreshQueue: Promise<void> = Promise.resolve();
  private appliedSchedule = '';
  private saving = new Set<string>();
  private disposed = false;

  constructor(private host: PluginHost, private changed: () => void = () => {}, private now = () => new Date()) {
    this.store = new ResearchStore(host);
  }
  async init() {
    await this.store.load();
    this.unregister = this.host.commands.register({ id: DIGEST_COMMAND, title: '热点追踪：按计划生成本期笔记', run: async () => { await this.generate(true); } });
    await this.refresh();
    this.timer = setInterval(() => { void this.refresh().catch(error => this.fail(error)); }, SETTINGS_POLL_MS);
  }
  dispose() {
    this.disposed = true; clearInterval(this.timer); this.lifetime.abort(); this.running?.controller.abort(); this.unregister?.();
  }
  private update() { if (!this.disposed) this.changed(); }
  private fail(error: unknown) { if (!this.disposed) { this.notice = error instanceof Error ? error.message : '操作未完成，请重试。'; this.update(); } }
  refresh(): Promise<void> {
    this.refreshQueue = this.refreshQueue.catch(() => {}).then(async () => {
      this.lifetime.signal.throwIfAborted();
      const before = JSON.stringify([this.settings, this.scheduleWarning, this.scheduleActive, this.loading]);
      this.settings = await readDigestSettings(this.host, this.lifetime.signal);
      this.scheduleWarning = ''; this.scheduleActive = false;
      try {
        // Retain legacy data, but retire its schedules before enabling the digest.
        for (const watch of this.store.state.watches.filter(w => w.scheduled)) {
          if (!this.host.schedules) throw new Error('旧追踪计划尚未停用，请在支持定时任务的桌面端打开插件完成迁移。');
          await this.host.schedules.remove(`watch-${watch.id}`);
          this.lifetime.signal.throwIfAborted();
          watch.scheduled = false; await this.store.save();
        }
        const enabled = this.settings.valid && this.settings.interests.length > 0 && !this.store.state.digestPaused;
        if (!enabled && this.running?.scheduled && this.running.run) this.running.controller.abort();
        if (!this.host.schedules) {
          this.scheduleWarning = '自动生成需要支持定时任务的 EdgeEver 桌面端；当前仍可立即生成。';
        } else {
          const key = enabled ? this.settings.frequency : 'off';
          if (key !== this.appliedSchedule) {
            if (!enabled) await this.host.schedules.remove(DIGEST_SCHEDULE);
            else await this.host.schedules.upsert({ key: DIGEST_SCHEDULE, name: `热点${frequencyName(this.settings.frequency)}`, commandId: DIGEST_COMMAND, cronExpression: this.settings.frequency === 'daily' ? '0 9 * * *' : '0 9 * * 1', missedRunPolicy: 'skip', isEnabled: true });
            this.lifetime.signal.throwIfAborted(); this.appliedSchedule = key;
          }
          this.scheduleActive = enabled;
        }
      } catch (error) {
        this.lifetime.signal.throwIfAborted();
        this.appliedSchedule = '';
        this.scheduleWarning = `定时计划未能同步，将自动重试。${error instanceof Error ? error.message : ''}`;
      }
      this.loading = false;
      if (before !== JSON.stringify([this.settings, this.scheduleWarning, this.scheduleActive, this.loading])) this.update();
    });
    return this.refreshQueue;
  }
  async setPaused(paused: boolean) {
    this.store.state.digestPaused = paused;
    if (paused && this.running?.scheduled) this.running.controller.abort();
    await this.store.save(); this.update(); await this.refresh();
  }
  cancel() { this.running?.controller.abort(); }

  async generate(scheduled = false): Promise<Run | undefined> {
    if (this.running) { if (scheduled) throw new Error('已有热点笔记正在生成，请等待完成。'); return this.running.run; }
    const task = { controller: new AbortController(), scheduled, run: undefined as Run | undefined };
    this.running = task; const signal = AbortSignal.any([task.controller.signal, this.lifetime.signal]);
    this.notice = ''; this.update();
    try {
      await this.refresh(); signal.throwIfAborted();
      if (!this.settings.valid) throw new Error(this.settings.warning);
      if (!this.settings.interests.length) { if (scheduled) return; throw new Error('请先到插件设置填写关注领域，并选择日报或周报。'); }
      if (scheduled && this.store.state.digestPaused) return;
      if (scheduled && !this.scheduleActive) throw new Error(this.scheduleWarning || '定时计划尚未开启。');
      const date = this.now(); const { frequency, interests } = this.settings;
      // A stale daily callback must not produce a new weekly issue mid-week.
      if (scheduled && frequency === 'weekly' && date.getDay() !== 1) return;
      const key = periodKey(frequency, date);
      const previous = this.store.state.runs.find(r => r.digest?.periodKey === key && r.noteId);
      if (previous) { task.run = previous; this.notice = '本期笔记已生成，不会重复创建。'; return previous; }
      const saved = this.store.state.digestNotes?.find(n => n.periodKey === key);
      if (saved) { this.notice = '本期笔记已生成，不会重复创建。'; if (!scheduled) await this.host.ui.openNote(saved.noteId); return; }
      // A completed draft may have failed only at note creation. Retry that save,
      // not all network/model work, even if settings have since changed.
      const draft = this.store.state.runs.find(r => r.digest?.periodKey === key && r.status === 'complete' && !r.noteId);
      if (draft) { task.run = draft; await this.saveNote(draft, signal); return draft; }
      const bridge = createResearchRuntime(this.host);
      if (!bridge) throw new Error('当前 EdgeEver 未提供插件网络访问能力，请升级兼容版本。');
      const run = newRun(`热点${frequencyName(frequency)} · ${localDate(date)}`, frequency === 'daily' ? 1 : 7, 'standard');
      run.createdAt = date.toISOString(); run.digest = { frequency, interests: [...interests], periodKey: key }; task.run = run;
      await this.store.addRun(run); this.update();
      await research(bridge, run, signal, async () => { await this.store.save(); this.update(); });
      signal.throwIfAborted();
      if (run.status !== 'complete') throw new Error('热点汇总未完成，已取得的资料保留在最近结果中。');
      await this.saveNote(run, signal);
      return run;
    } catch (error) {
      this.fail(signal.aborted ? new Error('生成已取消，已有资料已保留。') : error);
      if (scheduled) throw error;
      return task.run;
    } finally { this.running = undefined; this.update(); }
  }
  async saveNote(run: Run, signal = this.lifetime.signal) {
    if (run.noteId || this.saving.has(run.id)) return;
    if (run.status !== 'complete') throw new Error('请先完成生成，再保存笔记。');
    this.saving.add(run.id); this.update();
    try {
      const notebooks = await boundedRequest(() => this.host.notebooks.list(), signal, 10000);
      signal.throwIfAborted();
      const notebook = notebooks.find(n => n.id === 'nb_inbox') ?? notebooks[0];
      if (!notebook) throw new Error('请先在 EdgeEver 创建一个笔记本；本期结果已保留，可重试保存。');
      const note = await this.host.notes.create({ notebookId: notebook.id, title: run.topic, contentMarkdown: exportMarkdown(run), tags: ['热点追踪', ...(run.digest ? [frequencyName(run.digest.frequency)] : [])] });
      // Persist a returned note ID even if cancellation arrived during creation.
      // notes.create has no generic cancellation/idempotency contract.
      run.noteId = note.id;
      if (run.digest) {
        const notes = [{ periodKey: run.digest.periodKey, noteId: note.id }, ...(this.store.state.digestNotes ?? []).filter(n => n.periodKey !== run.digest!.periodKey)];
        this.store.state.digestNotes = ['daily', 'weekly'].flatMap(f => notes.filter(n => n.periodKey.startsWith(`${f}:`)).slice(0, 2));
      }
      await this.store.save();
      this.notice = `已保存到「${notebook.name}」。${run.reportKind === 'ai' ? '' : run.reportKind === 'empty' ? '本期资料不足，已在笔记中说明。' : '当前为资料汇总，不是 AI 综合报告。'}`;
    } finally { this.saving.delete(run.id); this.update(); }
  }
  async regenerate(run: Run) {
    if (this.running) throw new Error('请等待当前生成完成。');
    const bridge = createResearchRuntime(this.host); if (!bridge) throw new Error('当前 EdgeEver 未提供插件网络访问能力。');
    const controller = new AbortController(); this.running = { run, controller, scheduled: false };
    try {
      await regenerateReport(bridge, run, AbortSignal.any([controller.signal, this.lifetime.signal]), async () => { await this.store.save(); this.update(); });
      this.notice = run.noteId ? '报告已更新。已保存笔记仍为原始快照；可导出更新后的报告。' : '报告已更新，可重试保存。';
    } finally { this.running = undefined; this.update(); }
  }
}
