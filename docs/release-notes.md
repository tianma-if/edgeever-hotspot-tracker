## 中文

v0.5.0-preview.1：只需关注领域与日报／周报。

- 原生设置缩减为关注领域、生成频率。去掉手动研究、来源／深度选择和逐话题追踪流程。
- 每日 09:00 或每周一 09:00，按领域汇总过去一天／七天的资料，自动生成一篇笔记。
- 支持立即生成、暂停／恢复、最近结果、保存重试和同一期去重；无资料或无 AI 时如实标注。
- 保留旧研究与追踪记录，停用旧逐话题计划，避免与新统一计划重复执行。
- 设置保存后约 30 秒内应用；仅桌面端运行时执行，错过不补跑。
- 设置说明适配 EdgeEver 统一双栏布局，插件面板同步采用原生页面层级；配置表单仍由宿主统一渲染。

仍为预览版，需要兼容宿主的通用 `ai:generate` 和 `network:public` 能力。不修改 EdgeEver，不部署其他研究服务，不增加密钥或 Cookie。宿主正式发布与生产调度验证仍是稳定可用的前提。

## English

v0.5.0-preview.1: just interests and a daily/weekly cadence.

- Reduce native settings to interests and frequency. Remove the manual research, source/depth selection, and per-topic watch workflow.
- Automatically save one grouped note daily at 09:00 or Monday at 09:00, covering the preceding day/seven days.
- Support generate now, pause/resume, recent results, save retries, and same-issue deduplication. Label missing evidence or AI honestly.
- Retain legacy research/watch records and retire per-topic schedules before enabling the unified schedule.
- Apply settings within approximately 30 seconds. Execution requires a running desktop app; missed runs are skipped.
- Adapt setting descriptions to EdgeEver's unified two-column layout and align the plugin panel with the native page hierarchy; the host still renders the configuration form.

Still a preview requiring compatible generic host `ai:generate` and `network:public` capabilities. No EdgeEver patches, separate research service, new credentials, or cookies. Official host release and production scheduling verification remain stable-availability gates.
