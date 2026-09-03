# EdgeEver 维护者适配

[English](README.md)

本目录提供独立插件所需的宿主能力。普通用户应通过 EdgeEver 更新获得这些能力，无需手动适配。

已在本地 EdgeEver 1.54.0 源码结构上验证。从插件仓库运行：

```sh
bun install --frozen-lockfile
bun scripts/integrate-host.ts /path/to/edgeever
```

然后在 EdgeEver 源码目录运行：

```sh
bun install --ignore-scripts
bun run build:plugin-api
bun test apps/api/src/plugin-research-routes.test.mjs
bun test apps/web/src/lib/plugins/plugin-research-permissions.test.mjs
bun test apps/web/src/lib/plugins/plugin-research-lifecycle.test.mjs
bun test apps/web/src/lib/plugin-research-note-mapping.test.mjs
bun run typecheck
bun run typecheck:mobile
bun run build:web
```

审阅 SDK 权限／类型、客户端桥接、Web 插件上下文与 WorkspaceApp 接线、共享 API 注册、固定来源适配、依赖及锁文件，以及 PluginPanelDialog 响应式挂载、异步启动／清理串行处理、已同步临时笔记 ID 查询修复。将新增 API 同步到中英文插件开发文档，并按 EdgeEver 原有 main 分支及发版流程交付。

脚本在验证过的结构上可重复执行；锚点变化时会报错而非猜测，但后续步骤失败前可能已写入部分变更。所属生成文件会用本仓库内容覆盖。提交前审阅差异，避免包含源码目录里的其他进行中工作。无需迁移数据库或已保存密钥。

两个新权限是 API 版本 1 的增量能力，旧宿主会拒绝它们。在对应 EdgeEver 版本发布前，不虚构最低版本号。本适配不增加 Android／iOS 插件执行能力。
