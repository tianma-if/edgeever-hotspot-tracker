# Generic host API contract

[简体中文](host-capabilities.zh-CN.md)

Status: implemented in the local EdgeEver development tree on 2026-09-03; not yet shipped. The v0.4.0 plugin preview requires an EdgeEver version that recognizes `ai:generate` and `network:public`. Ordinary users will upgrade EdgeEver normally and install the plugin; no source patch or extra research service is required.

## Responsibilities

| Plugin owns | Host provides |
| --- | --- |
| Source URLs, search syntax, RSS/JSON parsing, comment extraction | Permission-controlled generic network transport |
| Query planning, relevance filtering, prompts, citation checks | Generic AI generation and existing model credentials |
| Research state, watch comparisons, default-setting declarations | Existing storage, settings, notes and scheduling APIs |

Adding or fixing a source changes only the plugin package, never host SDK types, source enums, routes or parsing dependencies. `ResearchBridge`, `SearchInput` and `Evidence` are plugin-internal types.

## Public network transport

```ts
const response = await context.network.fetch(url, {
  transport: 'public',
  headers: { Accept: 'application/rss+xml' },
  redirect: 'manual',
  signal: controller.signal,
});
const text = await response.text();
```

Declare both `network` and `network:public`, plus destination `networkHosts`. Without explicit public transport, the existing API keeps browser fetch semantics, including CORS. Public mode uses EdgeEver's authenticated backend, which transports bytes and knows nothing about research.

- HTTPS GET/HEAD, port 443, no body, URL credentials, cookies, or authorization headers.
- 20-second deadline and 2,000,000 decoded response bytes. Responses are buffered within the limit.
- Never follows redirects; `redirect: 'error'` rejects them. Upstream 403/429 remain upstream status codes.
- Request headers: Accept, Accept-Language, If-None-Match, If-Modified-Since, Range. Response headers expose content/cache metadata, Location and Retry-After, excluding Set-Cookie.
- Rejects IP literals and local names. Self-hosted Bun validates DNS answers and passes the validated addresses directly to TLS; private, special-use and mixed answers fail. Cloudflare uses workerd's default public-only egress. Custom workerd deployments must preserve that restriction.
- VPN fake-IP DNS in reserved address ranges is rejected. This restriction is not disabled to make a source work.

The trusted client host enforces plugin permissions and declared hosts. The backend independently enforces interactive-user authentication and public-only egress; it does not accept arbitrary client-supplied plugin IDs or allowlists as authorization. This is not server-attested per-plugin isolation or a hard JavaScript sandbox. Both capabilities are disabled in public demo mode. Each workspace has up to four concurrent requests per AI/network group per app instance, not a distributed quota.

RSS readers, calendars and public-data import plugins can reuse this transport. It addresses browser response-reading restrictions, not platform access blocks or rate limits.

## Generic AI

```ts
const status = await context.ai.status(); // { configured, modelName? }
const result = await context.ai.generate({
  system: 'Summarize the supplied text.',
  prompt: text,
  maxOutputTokens: 3000,
  signal: controller.signal,
}); // { text }
```

Permission: `ai:generate`. The host uses the existing default model and retains provider credentials. Limits: system 8,000 characters, prompt 90,000 characters, output 5,000 tokens, generation deadline 120 seconds. Provider errors are redacted. Plugin deactivation aborts pending generation/network calls; actual provider billing cancellation depends on the provider. Model usage is charged by the configured provider.

No topic, source, date window, evidence schema or report fields enter the host API. Translation, rewriting and classification can use exactly the same contract. Streaming and model selection are outside this initial API.

## Verification and release boundary

Deterministic tests cover all four source adapters, AI delegation, denied permissions, declared-host enforcement, upstream errors, size limits, cancellation, DNS address validation, native settings and UI behavior. The browser integration run retrieved 11 real items from news/HN, generated a cited AI report, successfully retried generation from retained evidence, and saved the report as a note. GitHub/Reddit contributed zero items to that run; this is not evidence of successful live content retrieval from those two sources. Self-hosted DNS policy tests passed, but a positive TLS smoke test on this machine was blocked by its reserved fake-IP DNS response. Cloudflare development transport was used for the browser run.

Official host release and production Web/desktop verification remain gates for stable availability. The v0.4.0 package is published as a prerelease for compatible development hosts and does not promise compatibility with older production versions.

## Retired integration

The source-injection script and dedicated host route/client/SDK templates are removed. Earlier local research-specific routes, types and parsing dependencies were withdrawn. Independent generic plugin lifecycle and note-opening fixes remain separate host capabilities. The v0.1–v0.3 preview packages use the superseded architecture and should not be used as the installation path for 0.4.
