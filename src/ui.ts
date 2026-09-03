import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { styles } from './styles';
import { SOURCE_NAMES, SOURCES, type PluginHost, type ResearchBridge, type Run, type Watch } from './types';
import { ask, canonicalUrl, exportMarkdown, newRun, research } from './engine';
import { ResearchStore } from './store';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; }
function button(text: string, action: () => unknown, className = 'secondary') { const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', () => { void action(); }); return node; }
function renderMarkdown(text: string) { const node = el('div', 'report'); if (!DOMPurify.isSupported) { node.textContent = text; return node; } node.innerHTML = DOMPurify.sanitize(marked.parse(text, { async: false }), { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'input', 'form', 'style', 'video', 'audio', 'iframe'], FORBID_ATTR: ['style'] }); for (const a of node.querySelectorAll('a')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return node; }
function download(filename: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = el('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const activeStatuses = ['planning', 'searching', 'writing'];
export class TrackerApp {
  readonly store: ResearchStore;
  private bridge: ResearchBridge | null;
  private view: 'home' | 'history' | 'watches' | 'report' = 'home';
  private selected = ''; private topic = ''; private days = 30; private depth: Run['depth'] = 'standard';
  private root?: ShadowRoot; private notice = ''; private running?: { run: Run; controller: AbortController };
  private disposed = false; private pendingAsk = false; private askController?: AbortController;
  private notebooks: { id: string; name: string }[] = []; private notebookId = '';
  private saving = new Set<string>(); private modelName = ''; private configured = false;
  private commandDisposers = new Map<string, () => void>();
  constructor(private host: PluginHost) { this.store = new ResearchStore(host); this.bridge = host.ai && host.research ? { ai: host.ai, research: host.research } : null; }
  async init() {
    await this.store.load();
    try { this.notebooks = await this.host.notebooks.list(); this.notebookId = this.notebooks.find((n) => n.id === 'nb_inbox')?.id ?? this.notebooks[0]?.id ?? ''; } catch { this.notice = '笔记本暂时无法加载，研究结果仍会保存在插件历史中。'; }
    if (this.bridge) { try { const s = await this.bridge.ai.status(); this.configured = s.configured; this.modelName = s.modelName ?? ''; } catch { this.notice = '暂时无法连接 EdgeEver，请检查网络后重试。'; } }
    this.registerWatches();
  }
  mount(container: HTMLElement) { const mount = el('div'); mount.style.height = '100%'; mount.style.minHeight = '0'; container.append(mount); this.root = mount.attachShadow({ mode: 'open' }); this.render(); return () => { mount.remove(); if (this.root?.host === mount) this.root = undefined; }; }
  dispose() { this.disposed = true; this.running?.controller.abort(); this.askController?.abort(); for (const dispose of this.commandDisposers.values()) dispose(); this.root = undefined; }
  private notify(message: string) { this.notice = message; this.render(); }
  private async safely(action: () => Promise<unknown>) { try { await action(); } catch (error) { if (!this.disposed) this.notify(error instanceof Error ? error.message : '操作未完成，请重试。'); } }
  private registerWatches() {
    for (const watch of this.store.state.watches) if (!this.commandDisposers.has(watch.id)) {
      this.commandDisposers.set(watch.id, this.host.commands.register({ id: `watch-${watch.id}`, title: `追踪：${watch.topic}`, run: async () => {
        const run = await this.start(watch.topic, watch.days, watch, true);
        if (!run || run.status !== 'complete' || !run.evidence.length) throw new Error('本次追踪未取得足够资料，请查看研究历史。');
      } }));
    }
  }
  private async start(topic: string, days = this.days, watch?: Watch, background = false): Promise<Run | undefined> {
    if (!this.bridge) throw new Error('请先升级 EdgeEver，当前版本尚未提供插件研究接口。');
    if (this.running) throw new Error('已有研究正在进行，请等待完成或先取消。');
    if (!topic.trim()) { this.notify('先输入你想追踪的话题。'); return; }
    const run = newRun(topic, days, watch ? 'standard' : this.depth); run.watchId = watch?.id;
    const previous = watch?.lastRunId ? this.store.state.runs.find((r) => r.id === watch.lastRunId) : undefined;
    const controller = new AbortController(); this.running = { run, controller };
    try {
      await this.store.addRun(run);
      if (!background) { this.view = 'report'; this.selected = run.id; }
      this.notice = ''; this.render();
      await research(this.bridge, run, controller.signal, async () => { await this.store.save(); if (!this.disposed) this.render(); });
      if (watch && run.status === 'complete' && run.evidence.length) {
        const oldUrls = new Set(previous?.evidence.map((e) => canonicalUrl(e.url)) ?? []);
        run.newEvidence = previous ? run.evidence.filter((e) => !oldUrls.has(canonicalUrl(e.url))).length : undefined;
        watch.lastRunId = run.id; await this.store.save();
        if (watch.notebookId && run.evidence.length) await this.saveNote(run, watch.notebookId);
      }
    } finally { this.running = undefined; if (!this.disposed) this.render(); }
    return run;
  }
  private async saveNote(run: Run, notebookId = this.notebookId) {
    if (run.noteId) { await this.host.ui.openNote(run.noteId); return; }
    if (!notebookId) throw new Error('请先在 EdgeEver 创建一个笔记本。');
    if (this.saving.has(run.id)) return;
    this.saving.add(run.id); this.render();
    try {
      const note = await this.host.notes.create({ notebookId, title: `${run.topic} · ${run.createdAt.slice(0, 10)}`, contentMarkdown: exportMarkdown(run), tags: ['热点追踪'] });
      run.noteId = note.id; await this.store.save(); this.notice = '研究报告已保存到笔记本。';
    } finally { this.saving.delete(run.id); this.render(); }
  }
  private nav(view: typeof this.view) { this.view = view; this.notice = ''; this.render(); }
  private render() {
    if (!this.root || this.disposed) return;
    const focused = this.root.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
    const focusKey = focused?.dataset.focus; const cursor = focused?.selectionStart;
    const style = el('style'); style.textContent = styles;
    const shell = el('div', 'shell'); const rail = el('aside', 'rail');
    const brand = el('div', 'brand'); brand.append(el('span', 'brand-icon', '↗')); const word = el('span', '', '热点追踪'); word.append(el('small', '', 'EDGEEVER')); brand.append(word); rail.append(brand);
    for (const [key, title, count] of [['home', '开始研究', ''], ['watches', '我的追踪', this.store.state.watches.length], ['history', '研究历史', this.store.state.runs.length]] as const) {
      const item = button(title, () => this.nav(key), `nav ${this.view === key ? 'active' : ''}`); if (count !== '') item.append(el('span', 'nav-count', String(count))); rail.append(item);
    }
    const foot = el('div', 'rail-footer'); foot.append(el('div', '', '让信息成为你的知识。'), el('div', '', '无需额外部署 · 保存在当前设备')); rail.append(foot);
    const main = el('main', 'main'); const top = el('header', 'topbar'); top.append(el('strong', '', 'EdgeEver / 热点追踪'), el('span', '', this.running ? '● 研究进行中' : '你的信息观察站')); main.append(top);
    const content = el('div', 'content'); if (this.notice) { const notice = el('div', 'notice', this.notice); notice.setAttribute('role', 'status'); content.append(notice); }
    if (!this.bridge) content.append(el('div', 'note warning', '当前 EdgeEver 尚未提供研究接口。请更新至支持「热点追踪」的版本；无需安装 Last30Days 或部署其他服务。'));
    if (this.view === 'home') this.renderHome(content);
    else if (this.view === 'history') this.renderHistory(content);
    else if (this.view === 'watches') this.renderWatches(content);
    else { const run = this.store.state.runs.find((r) => r.id === this.selected); if (run) this.renderReport(content, run); else this.renderHistory(content); }
    main.append(content); shell.append(rail, main); this.root.replaceChildren(style, shell);
    if (focusKey) { const next = this.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-focus="${focusKey}"]`); next?.focus(); if (cursor != null) try { next?.setSelectionRange(cursor, cursor); } catch {} }
  }
  private select<T extends string>(values: [T, string][], current: string, label: string, change: (value: T) => void) {
    const select = el('select', 'select'); select.setAttribute('aria-label', label);
    for (const [value, text] of values) { const option = el('option', '', text); option.value = value; option.selected = value === current; select.append(option); }
    select.addEventListener('change', () => change(select.value as T)); return select;
  }
  private renderHome(content: HTMLElement) {
    content.append(el('div', 'eyebrow', 'FOLLOW WHAT MATTERS'), el('h1', '', '你关心的，正在发生什么？'), el('p', 'sub', '从最新资讯到社区讨论，找到值得关注的变化。\n输入一个话题，让零散的信息成为有据可查的研究笔记。'));
    const composer = el('div', 'composer'); const input = el('textarea'); input.dataset.focus = 'topic'; input.setAttribute('aria-label', '研究主题'); input.placeholder = '例如：最近一个月，AI 编程工具有哪些新变化？'; input.value = this.topic; input.maxLength = 240; input.addEventListener('input', () => { this.topic = input.value; });
    input.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void this.safely(() => this.start(this.topic)); }); composer.append(input);
    const footer = el('div', 'composer-footer'); const controls = el('div', 'controls'); controls.append(this.select([['7', '最近 7 天'], ['30', '最近 30 天'], ['90', '最近 90 天']], String(this.days), '研究时间范围', (v) => { this.days = Number(v); }), this.select([['quick', '快速浏览'], ['standard', '标准研究'], ['deep', '深入研究']], this.depth, '研究深度', (v) => { this.depth = v; }));
    const start = button(this.running ? '查看当前研究 ↗' : '开始研究 ↗', () => this.safely(async () => { if (this.running) { this.selected = this.running.run.id; this.nav('report'); } else await this.start(this.topic); }), 'primary'); start.disabled = !this.bridge; footer.append(controls, start); composer.append(footer); content.append(composer);
    const chips = el('div', 'chips'); for (const query of ['AI 编程工具', '开源笔记软件', '新能源出行', 'Claude 与 ChatGPT 对比']) chips.append(button(query, () => { this.topic = query; this.render(); }, 'chip')); content.append(chips);
    if (this.bridge && !this.configured) content.append(el('div', 'note warning', '可先浏览公开资料。生成 AI 研究报告前，请到 EdgeEver「个人中心 → AI 设置」选择默认模型；已配置用户无需重复填写密钥。'));
    else if (this.configured) content.append(el('div', 'tiny', `● 沿用 EdgeEver AI 配置${this.modelName ? ` · ${this.modelName}` : ''}`));
    const heading = el('div', 'section-top'); heading.append(el('h2', '', '从不同视角，看清同一个话题'), el('span', 'tiny', '无需新增来源密钥')); content.append(heading);
    const grid = el('div', 'source-grid'); const descriptions = ['新闻标题与摘要', '技术讨论与部分评论', '公开 Issue 与 PR 讨论', '公开帖子 · 可用性受限'];
    SOURCES.forEach((source, i) => { const tile = el('div', 'source-tile'); tile.append(el('span', 'source-symbol', ['N', 'Y', '<>', 'r/'][i]), el('strong', '', SOURCE_NAMES[source]), el('span', 'tiny', descriptions[i])); grid.append(tile); }); content.append(grid);
    content.append(el('div', 'note', '每份报告保留实际来源与时间。来源无法访问时会明确说明；新闻摘要不代表已读取全文。'));
    if (this.store.state.runs.length) { const row = el('div', 'section-top'); row.append(el('h2', '', '最近研究'), button('查看全部 →', () => this.nav('history'), 'text-btn')); content.append(row); this.store.state.runs.slice(0, 2).forEach((run) => content.append(this.runCard(run))); }
  }
  private runCard(run: Run) { const card = el('div', 'card'); const row = el('div', 'row'); row.append(button(run.topic, () => { this.selected = run.id; this.nav('report'); }, 'card-title'), el('span', 'badge', run.status === 'complete' ? '已完成' : run.status === 'interrupted' ? '已中断' : run.status === 'cancelled' ? '已取消' : activeStatuses.includes(run.status) ? '进行中' : '未完成')); card.append(row); const meta = el('div', 'meta'); meta.append(el('span', '', run.createdAt.slice(0, 16).replace('T', ' ')), el('span', '', `最近 ${run.days} 天`), el('span', '', `${run.evidence.length} 条证据`)); card.append(meta); return card; }
  private renderHistory(content: HTMLElement) { content.append(el('div', 'eyebrow', 'RESEARCH LIBRARY'), el('h1', '', '每次探索，都有迹可循'), el('p', 'sub', '最近 30 次研究保存在当前设备。重要报告可另存为 EdgeEver 笔记，随工作区同步。')); if (!this.store.state.runs.length) content.append(el('div', 'empty', '还没有研究记录。开始研究你关心的第一个话题吧。')); else this.store.state.runs.forEach((run) => content.append(this.runCard(run))); }
  private renderWatches(content: HTMLElement) {
    content.append(el('div', 'eyebrow', 'YOUR WATCHLIST'), el('h1', '', '持续关注，才看得见变化'), el('p', 'sub', '把研究主题加入追踪，随时更新资料。每日计划在桌面端保持运行时执行，关闭应用后不会继续。'));
    if (!this.store.state.watches.length) content.append(el('div', 'empty', '完成一次研究后，点击「追踪这个话题」，它就会出现在这里。'));
    for (const watch of this.store.state.watches) {
      const card = el('div', 'card'); card.append(el('h3', '', watch.topic), el('p', 'tiny', `最近 ${watch.days} 天 · ${watch.scheduled ? '每日 09:00 更新（设备时区）' : '手动更新'}`));
      const actions = el('div', 'actions'); const refresh = button('更新研究 ↗', () => this.safely(() => this.start(watch.topic, watch.days, watch)), 'primary'); refresh.disabled = Boolean(this.running); actions.append(refresh);
      actions.append(button(watch.scheduled ? '关闭每日追踪' : '开启每日追踪', () => this.safely(async () => {
        if (!this.host.schedules) throw new Error('每日追踪需要支持定时任务的 EdgeEver 桌面端。');
        if (watch.scheduled) await this.host.schedules.remove(`watch-${watch.id}`);
        else await this.host.schedules.upsert({ key: `watch-${watch.id}`, name: `热点追踪：${watch.topic}`, commandId: `watch-${watch.id}`, cronExpression: '0 9 * * *', missedRunPolicy: 'skip', isEnabled: true });
        watch.scheduled = !watch.scheduled; await this.store.save(); this.render();
      })));
      actions.append(button('移除追踪', () => this.safely(async () => { if (watch.scheduled) await this.host.schedules?.remove(`watch-${watch.id}`); this.commandDisposers.get(watch.id)?.(); this.commandDisposers.delete(watch.id); this.store.state.watches = this.store.state.watches.filter((w) => w.id !== watch.id); await this.store.save(); this.render(); })));
      card.append(actions);
      if (watch.lastRunId) { const run = this.store.state.runs.find((r) => r.id === watch.lastRunId); if (run) { card.append(button(`最近研究：${run.createdAt.slice(0, 10)}${run.newEvidence !== undefined ? ` · ${run.newEvidence} 条本次新取得的证据` : ''}`, () => { this.selected = run.id; this.nav('report'); }, 'text-btn')); } }
      const archive = this.select([['', '不自动归档'], ...this.notebooks.map((n) => [n.id, `自动归档至 ${n.name}`] as [string, string])], watch.notebookId ?? '', '追踪报告归档笔记本', (value) => { watch.notebookId = value || undefined; void this.safely(() => this.store.save()); }); card.append(archive); content.append(card);
    }
  }
  private renderReport(content: HTMLElement, run: Run) {
    content.append(el('div', 'eyebrow', 'RESEARCH BRIEF'), el('h1', '', run.topic), el('p', 'sub', `${run.createdAt.slice(0, 10)} · 最近 ${run.days} 天 · ${run.evidence.length} 条证据`));
    if (activeStatuses.includes(run.status)) { const progress = el('div', 'progress'); progress.setAttribute('role', 'status'); progress.append(el('strong', 'pulse', run.progress)); const steps = el('div', 'steps'); const current = ['planning', 'searching', 'writing'].indexOf(run.status); for (let i = 0; i < 3; i++) steps.append(el('span', `step ${i <= current ? 'done' : ''}`)); progress.append(steps); progress.append(button('取消研究', () => { this.running?.controller.abort(); }, 'text-btn')); content.append(progress); }
    else {
      const actions = el('div', 'actions'); const save = button(run.noteId ? '打开已保存笔记 ↗' : '保存为笔记', () => this.safely(() => this.saveNote(run)), 'primary'); save.disabled = this.saving.has(run.id) || !run.evidence.length; actions.append(save);
      if (!run.noteId) actions.append(this.select(this.notebooks.map((n) => [n.id, n.name]), this.notebookId, '保存到笔记本', (v) => { this.notebookId = v; }));
      actions.append(button('追踪这个话题', () => this.safely(async () => { const watch = await this.store.addWatch(run.topic, run.days); if (!watch.lastRunId && run.evidence.length) { watch.lastRunId = run.id; await this.store.save(); } this.registerWatches(); this.notify('已加入「我的追踪」，可在那里开启每日更新。'); })));
      actions.append(button('导出 Markdown', () => download(`${run.topic.replace(/[\\/:*?"<>|]/g, '-')}.md`, exportMarkdown(run), 'text/markdown;charset=utf-8')));
      actions.append(button('导出 HTML', () => { if (!DOMPurify.isSupported) { this.notify('当前环境无法安全导出 HTML，请使用 Markdown 导出。'); return; } const html = DOMPurify.sanitize(marked.parse(exportMarkdown(run), { async: false }), { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'style', 'iframe'] }); download('edgeever-research.html', `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EdgeEver 热点追踪</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:16px/1.9 system-ui;color:#192c26}a{color:#16835c}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}pre{white-space:pre-wrap}</style><body>${html}</body></html>`, 'text/html;charset=utf-8'); }));
      actions.append(button('重新研究', () => this.safely(() => this.start(run.topic, run.days)))); content.append(actions);
    }
    for (const warning of run.warnings) content.append(el('div', 'note warning', warning));
    if (run.newEvidence !== undefined) content.append(el('div', 'note', `相较上次，本轮新取得 ${run.newEvidence} 条不同链接的证据。该数量受检索覆盖影响，不等同于新增事件数。`));
    if (run.report) content.append(renderMarkdown(run.report));
    if (run.coverage.length) { const heading = el('div', 'section-top'); heading.append(el('h2', '', '来源覆盖')); content.append(heading); const controls = el('div', 'chips'); for (const source of SOURCES) { const outcomes = run.coverage.filter((s) => s.source === source); if (!outcomes.length) continue; const count = run.evidence.filter((e) => e.source === source).length; const failed = outcomes.some((s) => !['ok', 'no-results'].includes(s.status)); controls.append(el('span', 'chip', `${SOURCE_NAMES[source]} · ${count} 条${failed ? ' · 部分请求未完成' : ''}`)); } content.append(controls); }
    if (run.evidence.length) { const card = el('section', 'card'); card.append(el('h2', '', '可追溯的证据')); for (const item of run.evidence) { const evidence = el('article', 'evidence'); const link = el('a', '', `${item.id} · ${item.title}`); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; evidence.append(link, el('div', 'meta', `${SOURCE_NAMES[item.source]} · ${item.publishedAt?.slice(0, 10) ?? '日期未知'} · ${item.coverage === 'headline' ? '标题摘要' : '讨论内容'}`), el('p', '', item.summary.slice(0, 400))); if (item.comments?.length) { const detail = el('details'); detail.append(el('summary', 'tiny', `${item.comments.length} 条已取得的评论`)); item.comments.forEach((text) => detail.append(el('p', '', text))); evidence.append(detail); } card.append(evidence); } content.append(card); }
    if (run.status === 'complete' && run.evidence.length && this.bridge) {
      const heading = el('div', 'section-top'); heading.append(el('h2', '', '接着问，让研究更进一步')); content.append(heading);
      for (const entry of run.followUps) { content.append(el('h3', '', entry.question), renderMarkdown(entry.answer)); }
      const form = el('form', 'follow'); const question = el('input'); question.placeholder = '基于这些资料，继续问一个问题…'; question.setAttribute('aria-label', '追问'); question.maxLength = 1200;
      const submit = el('button', 'primary', this.pendingAsk ? '正在分析…' : '追问 ↗'); submit.type = 'submit'; submit.disabled = this.pendingAsk; form.append(question, submit); form.addEventListener('submit', (event) => { event.preventDefault(); const q = question.value.trim(); if (!q || this.pendingAsk) return; this.pendingAsk = true; this.askController = new AbortController(); this.render(); void this.safely(async () => { try { const answer = await ask(this.bridge!, run, q, this.askController!.signal); run.followUps.push({ question: q, answer }); await this.store.save(); } finally { this.pendingAsk = false; this.render(); } }); }); content.append(form, el('p', 'tiny', '追问基于本次已取得的证据；需要最新资料时请重新研究。'));
    }
  }
}
