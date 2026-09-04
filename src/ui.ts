import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { styles } from './styles';
import { SOURCE_NAMES, type PluginHost, type Run } from './types';
import { exportMarkdown } from './engine';
import { DigestService } from './digest';
import { frequencyName, scheduleLabel } from './settings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node;
}
function button(text: string, action: () => unknown, className = 'secondary') {
  const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', () => { void action(); }); return node;
}
function renderMarkdown(text: string) {
  const node = el('div', 'report');
  if (!DOMPurify.isSupported) { node.textContent = text; return node; }
  node.innerHTML = DOMPurify.sanitize(marked.parse(text, { async: false }), { USE_PROFILES: { html: true }, FORBID_TAGS: ['img', 'input', 'form', 'style', 'video', 'audio', 'iframe'], FORBID_ATTR: ['style'] });
  for (const a of node.querySelectorAll('a')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  return node;
}
export class TrackerApp {
  readonly service: DigestService;
  get store() { return this.service.store; }
  private root?: ShadowRoot;
  private selected = '';
  private notice = '';
  private busy = false;
  constructor(private host: PluginHost) { this.service = new DigestService(host, () => this.render()); }
  async init() { await this.service.init(); }
  mount(container: HTMLElement) {
    const mount = el('div'); mount.style.height = '100%'; container.append(mount);
    const root = mount.attachShadow({ mode: 'open' }); this.root = root; this.render();
    void this.service.refresh().catch(() => {});
    return () => { mount.remove(); if (this.root === root) this.root = undefined; };
  }
  dispose() { this.service.dispose(); this.root = undefined; }
  private async safely(action: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true; this.notice = ''; this.render();
    try { await action(); } catch (error) { this.notice = error instanceof Error ? error.message : '操作未完成，请重试。'; }
    finally { this.busy = false; this.render(); }
  }
  private show(run: Run) { this.selected = run.id; this.notice = ''; this.render(); this.resetScroll(); }
  private resetScroll() { const shell = this.root?.querySelector('.shell'); if (shell) shell.scrollTop = 0; }
  private render() {
    if (!this.root) return;
    // Background settings checks must not collapse expanded evidence/history.
    const openDetails = new Set([...this.root.querySelectorAll<HTMLDetailsElement>('details[open][data-key]')].map(n => n.dataset.key));
    const focusedText = this.root.activeElement?.tagName === 'BUTTON' ? this.root.activeElement.textContent : undefined;
    const scroll = this.root.querySelector('.shell')?.scrollTop ?? 0;
    const style = el('style'); style.textContent = styles;
    const shell = el('main', 'shell'); const content = el('div', 'content');
    const header = el('header', 'page-header');
    header.append(el('h1', '', '热点追踪'), el('p', 'sub', '按关注领域定期整理公开资料，并保存为带来源的笔记。'));
    content.append(header);
    for (const text of [this.notice, this.service.notice, this.service.settings.warning, this.service.scheduleWarning]) {
      if (text) { const notice = el('div', 'notice', text); notice.setAttribute('role', 'status'); content.append(notice); }
    }
    const run = this.store.state.runs.find(r => r.id === this.selected);
    if (run) this.renderReport(content, run); else this.renderHome(content);
    shell.append(content); this.root.replaceChildren(style, shell);
    for (const detail of this.root.querySelectorAll<HTMLDetailsElement>('details[data-key]')) detail.open = openDetails.has(detail.dataset.key);
    if (focusedText) [...this.root.querySelectorAll('button')].find(b => b.textContent === focusedText)?.focus({ preventScroll: true });
    shell.scrollTop = scroll;
  }
  private renderHome(content: HTMLElement) {
    const service = this.service; const settings = service.settings;
    const card = el('section', 'card preferences'); card.setAttribute('aria-label', '当前订阅设置');
    const heading = el('div', 'section-heading'); const headingCopy = el('div');
    headingCopy.append(el('h2', '', '自动热点笔记'), el('p', 'section-description', '配置由 EdgeEver 插件设置统一管理。'));
    heading.append(headingCopy, el('span', 'badge', service.loading ? '读取设置中' : this.store.state.digestPaused ? '已暂停' : service.scheduleActive ? '自动生成已开启' : '自动生成未开启')); card.append(heading);
    if (settings.interests.length) {
      const summary = el('dl', 'setting-summary');
      const interestsRow = el('div', 'setting-row'); interestsRow.append(el('dt', '', '关注领域'));
      const interests = el('dd'); const chips = el('div', 'chips'); settings.interests.forEach(interest => chips.append(el('span', 'chip', interest))); interests.append(chips); interestsRow.append(interests);
      const frequencyRow = el('div', 'setting-row'); frequencyRow.append(el('dt', '', '生成频率'), el('dd', '', `${frequencyName(settings.frequency)} · ${scheduleLabel(settings.frequency)}`));
      summary.append(interestsRow, frequencyRow); card.append(summary);
    } else {
      const emptySetup = el('div', 'setup'); emptySetup.append(el('strong', '', '尚未设置关注领域'), el('p', '', '前往「插件市场 → 热点追踪 → 插件设置」填写领域并选择生成频率。')); card.append(emptySetup);
    }
    const actions = el('div', 'actions');
    const generate = button(service.running ? '查看生成进度' : '立即生成', () => this.safely(async () => {
      if (service.running?.run) { this.show(service.running.run); return; }
      const pending = service.generate();
      // Updates may create the draft after refreshing settings.
      const run = await pending; if (run) this.show(run);
    }), 'primary');
    generate.disabled = this.busy || service.loading || (!service.running && (!settings.valid || !settings.interests.length || !this.host.network));
    actions.append(generate);
    if (settings.interests.length || this.store.state.digestPaused) {
      const pause = button(this.store.state.digestPaused ? '恢复自动生成' : '暂停自动生成', () => this.safely(() => service.setPaused(!this.store.state.digestPaused)));
      pause.disabled = this.busy; actions.append(pause);
    }
    const refresh = button('刷新设置', () => this.safely(() => service.refresh()), 'text-btn'); refresh.disabled = this.busy; actions.append(refresh);
    card.append(actions, el('p', 'card-footnote', '设置保存后约 30 秒内应用；也可以手动刷新。默认保存到收件箱，无收件箱时使用第一个笔记本。')); content.append(card);
    if (!this.host.network) content.append(el('p', 'notice', '当前 EdgeEver 未提供插件网络访问能力，请升级兼容版本。'));
    if (!this.host.ai) content.append(el('p', 'notice', '当前宿主未提供通用 AI 能力，只能生成明确标注的资料汇总。'));
    content.append(el('p', 'footnote', '自动生成仅在 EdgeEver 桌面端运行时执行，错过不补跑。沿用 EdgeEver 默认 AI 模型，调用按供应商计费。'));
    if (service.running) {
      const progress = el('div', 'progress'); progress.setAttribute('role', 'status');
      progress.append(el('strong', '', service.running.run?.progress ?? '正在准备本期笔记…'), button('取消生成', () => service.cancel(), 'text-btn')); content.append(progress);
    }
    const recentHeader = el('div', 'list-header'); recentHeader.append(el('h2', '', '最近生成'), el('span', 'tiny', `保留 ${Math.min(this.store.state.runs.length, 30)} 条`)); content.append(recentHeader);
    if (!this.store.state.runs.length) content.append(el('div', 'empty', '还没有热点笔记。设置好后，可以先点「立即生成」看看。'));
    this.store.state.runs.slice(0, 5).forEach(run => content.append(this.runCard(run)));
    if (this.store.state.runs.length > 5) {
      const history = el('details'); history.dataset.key = 'history'; history.append(el('summary', '', '更早的结果'));
      this.store.state.runs.slice(5).forEach(run => history.append(this.runCard(run))); content.append(history);
    }
    if (this.store.state.watches.length) content.append(el('p', 'tiny', '旧版研究记录已保留，逐话题计划已退出新流程。请在插件设置统一选择关注领域；若计划迁移失败，会在上方提示。'));
  }
  private runCard(run: Run) {
    const card = el('article', 'card result'); const row = el('div', 'row');
    const status = run.noteId ? '已保存为笔记' : run.status === 'complete' ? '待保存' : ['planning', 'searching', 'writing'].includes(run.status) ? '生成中' : '未完成';
    row.append(button(run.topic, () => this.show(run), 'card-title'), el('span', 'badge', status)); card.append(row);
    card.append(el('p', 'tiny', `${run.digest?.interests.join(' · ') ?? '旧版研究记录'} · ${run.evidence.length} 条来源资料`)); return card;
  }
  private renderReport(content: HTMLElement, run: Run) {
    content.append(button('← 返回热点笔记', () => { this.selected = ''; this.render(); this.resetScroll(); }, 'text-btn'), el('h1', '', run.topic), el('p', 'sub', `${run.digest?.interests.join(' · ') ?? '旧版研究'} · 最近 ${run.days} 天`));
    if (this.service.running?.run === run) {
      const progress = el('div', 'progress'); progress.setAttribute('role', 'status'); progress.append(el('strong', '', run.progress), button('取消生成', () => this.service.cancel(), 'text-btn')); content.append(progress);
    } else {
      const actions = el('div', 'actions');
      const save = button(run.noteId ? '打开笔记 ↗' : '重试保存', () => this.safely(async () => { if (run.noteId) await this.host.ui.openNote(run.noteId); else await this.service.saveNote(run); }), 'primary');
      save.disabled = this.busy || (!run.noteId && run.status !== 'complete'); actions.append(save);
      actions.append(button('导出 Markdown', () => {
        const url = URL.createObjectURL(new Blob([exportMarkdown(run)], { type: 'text/markdown;charset=utf-8' }));
        const a = el('a'); a.href = url; a.download = `hotspot-${run.createdAt.slice(0, 10)}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
      const retry = button('用已有资料重新生成', () => this.safely(() => this.service.regenerate(run)));
      retry.disabled = this.busy || !this.host.ai || !run.evidence.length || Boolean(this.service.running);
      actions.append(retry); content.append(actions);
    }
    if (['cancelled', 'interrupted', 'error'].includes(run.status)) content.append(el('p', 'notice', run.progress));
    if (run.reportKind === 'evidence') content.append(el('p', 'notice', '当前为资料汇总，不是 AI 综合报告。请检查 EdgeEver 默认 AI 配置，可用已有资料重新生成。'));
    for (const warning of run.warnings) content.append(el('p', 'notice', warning));
    if (run.report) content.append(renderMarkdown(run.report));
    if (run.noteId) content.append(el('p', 'tiny', '已保存笔记是生成当时的快照。重新生成不会覆盖原笔记，可导出更新后的报告。'));
    const detail = el('details', 'evidence-details'); detail.dataset.key = `evidence-${run.id}`;
    detail.append(el('summary', '', `来源与覆盖说明（${run.evidence.length} 条）`));
    detail.append(el('p', 'tiny', '标题摘要不代表已读全文，来源引用不等于事实已独立核实。日报／周报只纳入日期明确且落在本期窗口内的资料。'));
    for (const item of run.evidence) {
      const evidence = el('article', 'evidence'); const link = el('a', '', `${item.id} · ${item.title}`);
      if (/^https?:\/\//i.test(item.url)) link.href = item.url;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      evidence.append(link, el('p', 'tiny', `${SOURCE_NAMES[item.source]} · ${item.publishedAt?.slice(0, 10) ?? '日期未知'} · ${item.coverage === 'headline' ? '标题摘要' : '讨论内容'}`), el('p', '', item.summary.slice(0, 400)));
      detail.append(evidence);
    }
    for (const source of run.coverage.filter(s => !['ok', 'no-results'].includes(s.status))) detail.append(el('p', 'tiny', `${source.interest ? source.interest + ' · ' : ''}${SOURCE_NAMES[source.source]}：请求未完成，覆盖可能不足。`));
    for (const entry of run.followUps) detail.append(el('h3', '', entry.question), renderMarkdown(entry.answer));
    content.append(detail);
  }
}
