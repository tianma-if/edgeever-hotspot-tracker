import { afterEach, expect, test } from 'bun:test';
import { DigestService, DIGEST_COMMAND, DIGEST_SCHEDULE, periodKey } from '../src/digest';
import { newRun } from '../src/engine';
import { fixture } from './fixture';
const active: DigestService[] = [];
afterEach(() => { active.splice(0).forEach(s => s.dispose()); });
async function setup(f = fixture(), now?: () => Date) { const service = new DigestService(f.host, undefined, now); active.push(service); await service.init(); return { f, service }; }

test('initializes one weekly schedule without opening a panel; refresh is idempotent', async () => {
  const { f, service } = await setup();
  expect(f.commands.has(DIGEST_COMMAND)).toBe(true); expect(f.schedules.get(DIGEST_SCHEDULE)?.cronExpression).toBe('0 9 * * 1');
  expect(f.calls.searches).toBe(0); await service.refresh(); expect(f.calls.upserts).toBe(1);
  f.settings['digest.frequency'] = 'daily'; await service.refresh(); expect(f.schedules.size).toBe(1);
  expect(f.schedules.get(DIGEST_SCHEDULE)?.cronExpression).toBe('0 9 * * *');
  expect(f.schedules.get(DIGEST_SCHEDULE)?.missedRunPolicy).toBe('skip');
});
test('pause, resume and empty interests reconcile schedules and survive restart', async () => {
  const { f, service } = await setup(); await service.setPaused(true); expect(f.schedules.size).toBe(0);
  service.dispose(); const { service: restored } = await setup(f); expect(restored.store.state.digestPaused).toBe(true); expect(f.schedules.size).toBe(0);
  await restored.setPaused(false); expect(f.schedules.size).toBe(1);
  f.settings['digest.interests'] = ''; await restored.refresh(); expect(f.schedules.size).toBe(0);
  await f.commands.get(DIGEST_COMMAND)!(); expect(f.notes).toHaveLength(0);
});
test('multiple domains produce one daily note and scheduled/manual/restarted runs do not duplicate it', async () => {
  const f = fixture(); f.settings['digest.frequency'] = 'daily'; const { service } = await setup(f);
  await f.commands.get(DIGEST_COMMAND)!(); expect(f.notes).toHaveLength(1);
  const run = service.store.state.runs[0]; expect(run.days).toBe(1); expect(run.digest?.interests).toEqual(['AI', '独立开发']);
  expect(run.evidence).toHaveLength(2); expect(f.notes[0].notebookId).toBe('nb_inbox'); expect(f.notes[0].contentMarkdown).toContain('## 独立开发');
  const searches = f.calls.searches; await service.generate(); await f.commands.get(DIGEST_COMMAND)!();
  expect(f.notes).toHaveLength(1); expect(f.calls.searches).toBe(searches);
  service.dispose(); const { service: restored } = await setup(f); await restored.generate(); expect(f.notes).toHaveLength(1);
  restored.store.state.runs = []; await restored.store.save(); await restored.generate(); expect(f.notes).toHaveLength(1); expect(f.calls.opened).toBe(run.noteId!);
});
test('manual generation works while automatic generation is paused', async () => {
  const { f, service } = await setup(); await service.setPaused(true); await f.commands.get(DIGEST_COMMAND)!(); expect(f.notes).toHaveLength(0);
  await service.generate(); expect(f.notes).toHaveLength(1);
});
test('missing scheduler still allows manual notes, missing network is explained', async () => {
  const f = fixture(); delete f.host.schedules; const { service } = await setup(f);
  expect(service.scheduleWarning).toContain('桌面端'); await service.generate(); expect(f.notes).toHaveLength(1);
  const g = fixture(); delete g.host.network; const { service: unavailable } = await setup(g);
  await unavailable.generate(); expect(unavailable.notice).toContain('网络访问能力'); expect(g.notes).toHaveLength(0);
});
test('settings failure fails closed and cannot generate with stale settings', async () => {
  const { f, service } = await setup(); f.host.settings!.get = async () => { throw new Error('unreadable'); };
  await service.refresh(); expect(f.schedules.size).toBe(0); expect(service.settings.valid).toBe(false);
  await expect(f.commands.get(DIGEST_COMMAND)!()).rejects.toThrow(); expect(f.notes).toHaveLength(0);
});
test('legacy watch schedules are retired without deleting watches or research', async () => {
  const f = fixture(); const run = newRun('Legacy topic', 30, 'quick'); run.status = 'complete';
  f.values.set('research-state-v1', { version: 1, runs: [run], watches: [{ id: 'old', topic: 'Legacy topic', days: 30, scheduled: true }] });
  const { service } = await setup(f); expect(f.calls.removals).toContain('watch-old'); expect(service.store.state.watches[0].scheduled).toBe(false);
  expect(service.store.state.runs[0].id).toBe(run.id); expect(service.store.state.watches).toHaveLength(1);
});
test('failed legacy cleanup blocks the new schedule and is retried', async () => {
  const f = fixture(); f.values.set('research-state-v1', { version: 1, runs: [], watches: [{ id: 'old', topic: 'AI', days: 30, scheduled: true }] });
  const remove = f.host.schedules!.remove; f.host.schedules!.remove = async () => { throw new Error('offline'); };
  const { service } = await setup(f); expect(f.schedules.size).toBe(0); expect(service.store.state.watches[0].scheduled).toBe(true); expect(service.scheduleWarning).toContain('offline');
  f.host.schedules!.remove = remove; await service.refresh(); expect(f.schedules.size).toBe(1); expect(service.store.state.watches[0].scheduled).toBe(false);
});
test('save failure retains a complete draft and retry does not re-search', async () => {
  const f = fixture(); const create = f.host.notes.create; f.host.notes.create = async () => { throw new Error('save failed'); };
  const { service } = await setup(f); const run = await service.generate(); expect(run?.status).toBe('complete'); expect(run?.noteId).toBeUndefined();
  const searches = f.calls.searches; f.host.notes.create = create; await service.generate(); expect(f.notes).toHaveLength(1); expect(f.calls.searches).toBe(searches);
});
test('notebooks are resolved for each save; no notebook keeps a recoverable draft', async () => {
  const f = fixture(); f.host.notebooks.list = async () => []; const { service } = await setup(f); await service.generate();
  expect(service.notice).toContain('创建一个笔记本'); expect(service.store.state.runs[0].status).toBe('complete');
  f.host.notebooks.list = async () => [{ id: 'new', name: 'New' }]; await service.generate(); expect(f.notes[0].notebookId).toBe('new');
});
test('no AI and empty evidence create honest, grouped notes instead of fabricated reports', async () => {
  const f = fixture(); delete f.host.ai; const { service } = await setup(f); await service.generate();
  expect(service.store.state.runs[0].reportKind).toBe('evidence'); expect(f.notes[0].contentMarkdown).toContain('不是 AI 综合报告');
  const g = fixture(); g.host.network!.fetch = async input => new Response(new URL(input).hostname === 'news.google.com' ? '<rss><channel/></rss>' : new URL(input).hostname === 'hn.algolia.com' ? '{"hits":[]}' : new URL(input).hostname === 'api.github.com' ? '{"items":[]}' : '<feed/>');
  const { service: empty } = await setup(g); await empty.generate(); expect(g.notes).toHaveLength(1); expect(g.notes[0].contentMarkdown).toContain('## 独立开发'); expect(empty.store.state.runs[0].reportKind).toBe('empty');
});
test('concurrent requests share one run; cancelling prevents note creation', async () => {
  const f = fixture(); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  f.host.network!.fetch = async () => { await gate; return new Response('<feed/>'); };
  const { service } = await setup(f); const pending = service.generate(); await service.generate(); service.cancel(); release(); await pending;
  expect(f.notes).toHaveLength(0); expect(service.running).toBeUndefined();
});
test('weekly period uses local Monday and stale daily callbacks do not run mid-week', async () => {
  expect(periodKey('weekly', new Date(2026, 8, 6, 23, 59))).toBe('weekly:2026-08-31');
  expect(periodKey('weekly', new Date(2026, 8, 7, 0, 1))).toBe('weekly:2026-09-07');
  expect(periodKey('daily', new Date(2026, 8, 7, 0, 1))).toBe('daily:2026-09-07');
  const { f } = await setup(fixture(), () => new Date(2026, 8, 8, 9)); await f.commands.get(DIGEST_COMMAND)!(); expect(f.calls.searches).toBe(0);
});
test('failed scheduler sync is not shown as enabled, and subsequent refresh retries', async () => {
  const f = fixture(); const upsert = f.host.schedules!.upsert; f.host.schedules!.upsert = async () => { throw new Error('offline'); };
  const { service } = await setup(f); expect(service.scheduleActive).toBe(false); expect(service.scheduleWarning).toContain('offline');
  f.host.schedules!.upsert = upsert; await service.refresh(); expect(service.scheduleActive).toBe(true);
});
test('deactivation cancels pending settings and unregisters commands', async () => {
  const { f, service } = await setup(); f.host.settings!.get = () => new Promise(() => {});
  const refresh = service.refresh(); service.dispose(); await expect(refresh).rejects.toThrow(); expect(f.commands.size).toBe(0);
});
test('pausing an in-flight scheduled run aborts its source request and never saves a note', async () => {
  const f = fixture(); f.settings['digest.frequency'] = 'daily';
  let started!: () => void; const requested = new Promise<void>(resolve => { started = resolve; });
  f.host.network!.fetch = async () => { started(); return new Promise(() => {}); };
  const { service } = await setup(f);
  const pending = Promise.resolve(f.commands.get(DIGEST_COMMAND)!()).then(() => false, () => true);
  await requested; await service.setPaused(true); expect(await pending).toBe(true);
  expect(service.store.state.runs[0].status).toBe('cancelled'); expect(f.notes).toHaveLength(0); expect(f.schedules.size).toBe(0);
});
test('scheduled reconciliation failures are reported as failures rather than successful no-ops', async () => {
  const { f } = await setup(); f.host.schedules!.upsert = async () => { throw new Error('schedule unavailable'); };
  f.settings['digest.frequency'] = 'daily';
  await expect(f.commands.get(DIGEST_COMMAND)!()).rejects.toThrow('schedule unavailable'); expect(f.calls.searches).toBe(0);
});
test('each cadence keeps its own saved-issue index when history is evicted', async () => {
  const { f, service } = await setup(); await service.generate();
  const weekly = service.store.state.digestNotes![0];
  for (let i = 0; i < 5; i++) {
    const draft = newRun('Fixture daily', 1, 'quick'); draft.status = 'complete'; draft.digest = { frequency: 'daily', interests: ['AI'], periodKey: `daily:fixture-${i}` };
    await service.saveNote(draft);
  }
  service.store.state.runs = []; await service.generate();
  expect(f.calls.opened).toBe(weekly.noteId); expect(service.store.state.digestNotes).toContainEqual(weekly); expect(service.store.state.digestNotes!.length).toBeLessThanOrEqual(4);
});
