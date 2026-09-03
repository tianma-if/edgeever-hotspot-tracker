# EdgeEver Hotspot Tracker · 热点追踪

[简体中文](README.zh-CN.md) · [Architecture](docs/architecture.md)

Research a topic, compare recent developments, and keep a cited report in EdgeEver. No Last30Days installation, Python environment, Docker sidecar, or separate research service.

**Status: v0.4.0 preview release.** Source requests, parsing, ranking, and report orchestration live in the plugin bundle. EdgeEver's local development implementation now provides generic AI generation and public HTTPS transport, with no research-specific host routes or installation patches. Browser integration retrieved real evidence, generated a cited report, and recovered a failed generation using retained evidence. These generic APIs still need to ship in an official EdgeEver version before ordinary installation is supported.

See the [generic host API contract](docs/host-capabilities.md). Earlier v0.1–v0.3 previews used a dedicated host integration; that architecture is superseded. Do not apply those integration patches.

## Changed in 0.4

- Bundle all four public-source adapters and parsers with the plugin, using generic `context.network.fetch` and four declared destination hosts.
- Remove the `research:search` permission, host source contracts, research routes, client adapter, and source-injection script.
- Keep prompts, query planning, relevance filtering, and reports entirely in the plugin. Only general-purpose model invocation belongs in the host.
- If a source cannot be read, report incomplete coverage. There is no fallback through hidden host routes, browser cookies, or third-party proxies.

## New in 0.3: native plugin settings

Open **Plugin Marketplace → Hotspot Tracker → Plugin settings**, or use the plugin tools menu. Set the default time range (7/30/90 days), research depth, and four source switches there. Defaults are 30 days, standard depth, and all four sources.

Settings stay on the current device. Close and reopen the research panel to apply them; temporary choices in the panel last until it closes. Saved runs and existing watches keep their original choices. If all default sources are disabled, choose at least one source before starting. Settings do not enable schedules or require another API key.

Hosts without the settings API retain the previous controls and defaults. Failed/invalid settings reads fall back with an explanation; hosts still need the research capabilities described above.

## New in 0.2

- Choose the sources for each research run. Watchlists remember the original sources and depth; existing watchlists keep all sources and standard depth.
- Generate or regenerate the AI report from existing evidence without another search. A failed or cancelled retry preserves the previous report.
- Filter history by topic and evidence by source. Reports show headline-only and unknown-date counts; evidence-only runs are labeled separately.
- Bounded requests prevent endless waiting. If AI configuration is temporarily unavailable, public evidence is still collected.
- Watchlists retain their comparison links after older research leaves the 30-run history. Different source/depth combinations can be tracked separately.


## What it does

- Research the last 7, 30, or 90 days, with quick, standard, and deep modes.
- Search news, Hacker News, public GitHub issues/PRs, and Reddit public feeds.
- Plan short queries, deduplicate links, filter relevance, and generate a report with traceable citations using your existing EdgeEver default AI model.
- Ask follow-up questions against the collected evidence, save the report as a note, or export Markdown/HTML.
- Keep up to 30 research runs and 30 watched topics on this device. Compare newly retrieved links with the previous run.
- Optionally run daily at 09:00 in the device timezone on desktop while EdgeEver is running, and archive results to a selected notebook. Scheduling is off by default; missed runs are skipped.

News and Reddit supply headline/body excerpts, not full articles or complete comment trees. Hacker News adds up to three comments for each of the first two hits per query. GitHub provides issue/PR bodies and comment counts, not comment transcripts. A missing or limited source is visible in the report.

The first version does not include X, YouTube, TikTok, Instagram, automatic topicless discovery, an always-on crawler, or verified population-wide trend measurements. A citation confirms a retrieved source URL, not the truth of every generated claim. Statements and numbers still need judgment.

## Installation status

The preview package is available from [v0.4.0 Releases](https://github.com/tianma-if/edgeever-hotspot-tracker/releases/tag/v0.4.0). In a compatible development host, install its [manifest](https://github.com/tianma-if/edgeever-hotspot-tracker/releases/download/v0.4.0/manifest.json) through Plugin Marketplace. Current production hosts without the new permissions cannot install this version. After an EdgeEver release ships the generic capabilities, users will upgrade normally and reuse their existing AI settings, without source patches or another service.

Without an AI model, the plugin still retrieves public evidence and clearly labels the result as evidence-only. Model usage is billed by your configured provider. The plugin adds no source API keys, but public source availability depends on the instance's network and source rate limits.

The plugin runs in EdgeEver's trusted client plugin environment, not a hard JavaScript sandbox. This plugin uses permission-checked host methods; it does not request cookies or receive the AI provider key. Search keywords go to selected public sources through the generic host network transport; parsing and source-specific logic execute in the plugin. Your question and collected excerpts go to your configured AI provider. Research history and watchlists stay in device-local plugin storage; notes you explicitly save use normal workspace synchronization.

## Develop

Use Bun 1.3.14 or later. End users do not run these commands.

```sh
bun install --frozen-lockfile
bun run check
bun run test:live  # Bun transport smoke test only; does not verify browser CORS or host APIs
bun run dev        # static development package server on 127.0.0.1:4178
```

Only install `http://127.0.0.1:4178/manifest.json` into a development host implementing the generic contracts. Older SDKs without `ai:generate` or `network:public` reject this manifest. `bun run dev` serves the compiled plugin only; it is not a research backend. Rebuild, reinstall the development manifest to refresh the cached package, and reload EdgeEver after changing the bundle.

The build produces a single browser module plus `manifest.json`, `LICENSE`, and `THIRD_PARTY_NOTICES.txt` in `dist/`. GitHub Releases distribute these files; the repository-root manifest must match the release manifest exactly. Tag builds are published as previews by the release workflow. CI runs deterministic tests and builds the bundle; it does not contact public sources or AI providers.

## Host boundary

Only generic network, AI, settings, notes, storage, and scheduling APIs are used. `src/runtime.ts` connects these capabilities to plugin-owned adapters; `src/sources.ts` is bundled, never copied to EdgeEver. See [the capability contract](docs/host-capabilities.md) for limits and verification status. No script in this repository writes into a host checkout.

## License

AGPL-3.0-or-later, consistent with EdgeEver. This is an independent TypeScript implementation inspired by Last30Days' multi-source research workflow; it does not bundle or invoke Last30Days. See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies.
