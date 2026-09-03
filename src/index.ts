import { TrackerApp } from './ui';
import type { PluginHost } from './types';
export default {
  async activate(context: PluginHost) {
    const app = new TrackerApp(context);
    await app.init();
    const panel = context.ui.panels.register({ id: 'tracker', title: '热点追踪', presentation: 'fullscreen', mount: (container) => app.mount(container) });
    const command = context.commands.register({ id: 'open', title: '热点追踪：开始研究', run: () => context.ui.panels.open('tracker') });
    return () => { app.dispose(); command(); panel(); };
  },
};
