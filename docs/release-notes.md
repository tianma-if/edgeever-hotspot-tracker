## 中文

v0.4.0 预览版：研究能力由插件独立实现。

- 新闻、Hacker News、GitHub、Reddit 的搜索与解析随插件打包，不再依赖 Last30Days 或专用宿主研究接口。
- 通过通用 AI 与公开 HTTPS 传输运行，沿用 EdgeEver 的模型设置，无需部署额外研究服务。
- 保留原生插件设置、带引用的报告、失败后重新生成、研究历史、话题追踪、笔记保存与导出。
- 公开订阅源返回异常页面时明确标记来源不可用，避免误报为没有结果。

**兼容性：本版为预发布，需要宿主支持 `ai:generate`、`network:public` 通用能力。缺少这些权限的旧版 EdgeEver 无法安装。需等待宿主正式发布通用能力后再供普通用户安装；请勿使用旧版源码注入脚本。**

安装时使用本 Release 的 `manifest.json` 地址。公开来源仍可能受到网络与平台限流影响。

## English

v0.4.0 preview: research runs inside the plugin.

- Bundle news, Hacker News, GitHub, and Reddit search/parsing in the plugin, removing Last30Days and dedicated host research API dependencies.
- Use generic AI and public HTTPS transport with existing EdgeEver model settings; no separate research service is required.
- Retain native settings, cited reports, report retries, history, topic watches, note saving, and exports.
- Mark unexpected public-feed pages as unavailable instead of reporting an empty search.

**Compatibility: this prerelease requires the host's generic `ai:generate` and `network:public` capabilities. Older EdgeEver versions without these permissions reject installation. Ordinary installation must wait for the host release containing these APIs; do not use the retired source-injection scripts.**

Install using this release's `manifest.json` URL. Public sources remain subject to network availability and platform rate limits.
