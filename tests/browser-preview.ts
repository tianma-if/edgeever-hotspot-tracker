import manifest from '../manifest.json';
import { TrackerApp } from '../src/ui';
import { fixture } from './fixture';

const f = fixture(); f.settings['digest.interests'] = '';
const form = document.querySelector<HTMLFormElement>('#settings')!;
const status = document.querySelector<HTMLElement>('#status')!;
const panel = document.querySelector<HTMLIFrameElement>('#panel')!;
const fields: (HTMLInputElement | HTMLSelectElement)[] = [];
for (const field of manifest.settings.fields) {
  const label = document.createElement('label'); label.textContent = field.label + ' ';
  const input = document.createElement(field.type === 'select' ? 'select' : 'input'); input.name = field.key; input.setAttribute('aria-label', field.label);
  if (input instanceof HTMLSelectElement) for (const choice of field.options ?? []) {
    const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; input.append(option);
  }
  input.value = String(f.settings[field.key] ?? field.default); label.append(input); form.append(label); fields.push(input);
}
const save = document.createElement('button'); save.type = 'submit'; save.textContent = '保存模拟设置'; form.append(save);
const narrow = document.createElement('button'); narrow.type = 'button'; narrow.textContent = '窄屏预览';
narrow.onclick = () => { const isNarrow = panel.style.width === '390px'; panel.style.width = isNarrow ? '100%' : '390px'; narrow.textContent = isNarrow ? '窄屏预览' : '宽屏预览'; };
const dark = document.createElement('button'); dark.type = 'button'; dark.textContent = '深色预览'; dark.onclick = () => panel.contentDocument?.documentElement.classList.toggle('dark');
const previewActions = document.createElement('div'); previewActions.className = 'preview-actions'; previewActions.append(narrow, dark); form.append(previewActions);
form.onsubmit = event => { event.preventDefault(); for (const field of fields) f.settings[field.name] = field.value; status.textContent = '模拟设置已保存，等待插件轮询应用（约 30 秒），也可点击刷新设置。'; };
const create = f.host.notes.create;
f.host.notes.create = async input => { const note = await create(input); status.textContent = `已生成 ${f.notes.length} 篇模拟笔记，最近标题：${input.title}`; return note; };
f.host.ui.openNote = async id => { status.textContent = `已打开模拟笔记：${id}`; };
const app = new TrackerApp(f.host);
await app.init();
panel.onload = () => { const target = panel.contentDocument!.querySelector<HTMLElement>('#mount')!; app.mount(target); };
panel.srcdoc = '<!doctype html><html><meta charset="utf-8"><style>html,body,#mount{height:100%;margin:0}</style><div id="mount"></div></html>';
window.addEventListener('pagehide', () => app.dispose(), { once: true });
