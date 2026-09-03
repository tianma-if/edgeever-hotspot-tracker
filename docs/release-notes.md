## 中文

EdgeEver 热点追踪 0.2 预览版：

- 可选择检索来源，追踪任务记住来源与研究深度。
- 支持用已有资料重新生成报告，失败或取消会保留原报告。
- 增加历史搜索、证据来源筛选，以及标题摘要／未知日期提示。
- 增加请求超时恢复，收紧英文关键词匹配，并限制 AI 上下文大小。
- 追踪对比链接独立保存，历史轮换后仍能比较新资料。

仍需要支持 `ai:generate` / `research:search` 的 EdgeEver 宿主；适配代码在本仓库。用户无需部署 Last30Days。已保存笔记是快照，重新生成和追问不会自动覆盖它。

## English

EdgeEver Hotspot Tracker 0.2 preview:

- Select sources; watchlists retain the original sources and research depth.
- Regenerate reports from existing evidence; failure or cancellation preserves the previous report.
- Search history, filter evidence by source, and see headline-only/unknown-date counts.
- Recover from request timeouts, tighten English keyword matching, and bound AI context size.
- Preserve comparison links independently of rotating research history.

Requires an EdgeEver host with `ai:generate` / `research:search`; host integration is included in this repository. No Last30Days deployment is required. Saved notes remain snapshots and are not overwritten by regeneration or follow-up answers.
