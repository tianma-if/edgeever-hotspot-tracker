## 中文

EdgeEver 热点追踪 0.3 预览版：

- 接入 EdgeEver 原生「插件设置」，可设默认时间范围、研究深度和四个来源开关。
- 重新打开研究面板时读取最新设置，本次临时调整不写回默认值；已有研究与追踪配置保持独立。
- 兼容无设置接口的宿主，设置读取失败有超时与回退提示；全部关闭来源时提示选择，不自动开启。
- 无需额外 API Key，不会自动开启定时任务。

仍需要支持 `ai:generate` / `research:search` 的 EdgeEver 宿主；适配代码在本仓库。用户无需部署 Last30Days。已保存笔记是快照。

## English

EdgeEver Hotspot Tracker 0.3 preview:

- Integrates EdgeEver's native plugin settings for default time range, research depth, and four source switches.
- Reopening the panel loads current settings. Temporary panel choices never write defaults; existing research and watches retain their original configuration.
- Supports hosts without a settings API. Failed reads have a deadline and fallback notice; disabling every source requires a choice before research instead of silently enabling sources.
- Requires no extra API key and does not enable schedules.

Requires an EdgeEver host with `ai:generate` / `research:search`; host integration is included in this repository. No Last30Days deployment is required. Saved notes remain snapshots.
