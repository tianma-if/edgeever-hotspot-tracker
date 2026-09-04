# 通用宿主 API 契约

[English](host-capabilities.md)

状态：2026-09-03 已在 EdgeEver 本地开发代码实现，尚未发布。v0.4.0 插件预览版需要支持 `ai:generate` 和 `network:public` 的 EdgeEver 版本。普通用户通过正常升级 EdgeEver、安装插件即可使用，不需要源码补丁或额外研究服务。

## 职责划分

| 插件负责 | 宿主提供 |
| --- | --- |
| 来源地址、搜索语法、RSS／JSON 解析、评论提取 | 带权限检查的通用网络传输 |
| 查询规划、相关性筛选、提示词、引用检查 | 通用 AI 生成和已有模型凭据 |
| 领域订阅、报告状态、期次去重与设置声明 | 已有存储、设置、笔记与调度 API |

新增或修复来源只更新插件包，不改宿主 SDK 类型、来源枚举、路由或解析依赖。`ResearchBridge`、`SearchInput`、`Evidence` 均属于插件内部类型。

## 公开网络传输

```ts
const response = await context.network.fetch(url, {
  transport: 'public',
  headers: { Accept: 'application/rss+xml' },
  redirect: 'manual',
  signal: controller.signal,
});
const text = await response.text();
```

同时声明 `network`、`network:public` 和目的域名 `networkHosts`。没有显式选择公开传输时，原 API 保留浏览器 fetch 行为及 CORS 限制。公开模式通过 EdgeEver 已认证后端传输字节，后端不理解研究业务。

- 仅 HTTPS GET／HEAD、443 端口，不允许请求体、URL 凭据、Cookie 或授权头。
- 20 秒超时，最多 2,000,000 字节的解码后响应，响应在限额内缓冲。
- 不跟随重定向，`redirect: 'error'` 拒绝重定向；上游 403／429 保留原状态码。
- 请求头限 Accept、Accept-Language、If-None-Match、If-Modified-Since、Range。响应仅提供内容／缓存元数据、Location、Retry-After，不提供 Set-Cookie。
- 拒绝 IP 地址形式 URL 和本地域名。自托管 Bun 校验 DNS 结果，并把已校验地址直接交给 TLS 连接；私有、特殊用途及混合地址均拒绝。Cloudflare 使用 workerd 默认的仅公网出口；自定义 workerd 部署必须保留该限制。
- VPN 的保留地址段 fake-IP DNS 会被拒绝，不为来源可用性关闭这项校验。

可信客户端宿主检查插件权限及声明域名。后端独立要求交互用户认证、限制公网出口，不把客户端任意提交的插件 ID 或域名清单当成授权。这不等于服务端认证的逐插件隔离，也不是强 JavaScript 沙箱。公开演示模式禁用两项能力。每个应用实例内，每个工作区的 AI／网络组分别最多四个并发请求，不是分布式配额。

RSS 阅读、日历订阅、公开数据导入插件均可复用。该能力解决浏览器响应读取限制，不绕过平台访问限制或限流。

## 通用 AI

```ts
const status = await context.ai.status(); // { configured, modelName? }
const result = await context.ai.generate({
  system: '概括用户提供的文本。',
  prompt: text,
  maxOutputTokens: 3000,
  signal: controller.signal,
}); // { text }
```

权限为 `ai:generate`。宿主使用已有默认模型并保管供应商凭据。限制：system 8,000 字符、prompt 90,000 字符、输出 5,000 token、生成超时 120 秒。供应商错误经过脱敏。停用插件会中止未完成的生成／网络请求；供应商实际停止计费的时机取决于其实现。模型调用由已配置供应商计费。

宿主 API 不接收主题、来源、日期窗口、证据结构或报告字段。翻译、改写、分类可复用同一个契约。此首版 API 不包含流式输出和模型选择。

## 验证与发布边界

v0.5.0-preview.1 版本沿用相同通用能力，增加日报／周报编排，不新增宿主接口。设置只有领域文本与频率，插件每 30 秒读取；宿主没有设置变更事件。调度使用既有 cron API，笔记使用既有创建 API。设置订阅、幂等笔记创建和跨设备调度协调只是未来通用能力建议，当前不提供。此次 UI 与调度逻辑由模拟宿主测试验证，不等于真实桌面时钟验证；下述真实来源证据属于此前 v0.4 联调。

确定性测试覆盖四个来源适配器、AI 委托、权限拒绝、域名检查、上游错误、大小限制、取消、DNS 地址校验、原生设置及 UI 行为。浏览器联调取得新闻／HN 的 11 条真实资料，生成带引用的 AI 报告，成功用保留资料重试生成，并保存为笔记。GitHub／Reddit 在该轮贡献零条，因此不能把本轮作为这两个来源实际内容读取成功的证明。自托管 DNS 策略测试通过，但本机正向 TLS 冒烟验证被保留地址段 fake-IP DNS 阻止。浏览器联调使用 Cloudflare 开发传输。

宿主正式发布和生产 Web／桌面验证仍是稳定可用的条件。v0.5.0-preview.1 以预发布形式提供给兼容的开发宿主，不承诺兼容旧生产版本。

## 已废弃的集成

已移除源码注入脚本及宿主专用路由／客户端／SDK 模板，撤回此前本地研究专用路由、类型和解析依赖。独立的通用插件生命周期与打开笔记修复作为宿主通用能力保留。v0.1–v0.3 预览包采用旧架构，不应作为 0.4 的安装方式。
