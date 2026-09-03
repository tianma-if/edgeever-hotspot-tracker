# EdgeEver Hotspot Tracker · 热点追踪

[简体中文](README.zh-CN.md) · [Architecture](docs/architecture.md)

Research a topic, compare recent developments, and keep a cited report in EdgeEver. No Last30Days installation, Python environment, Docker sidecar, or separate research service.

**Status: v0.2.0 preview.** This plugin requires the new `ai:generate` and `research:search` host capabilities. They are included as reproducible EdgeEver source integration in this repository and tested locally; they are **not yet shipped in a public EdgeEver release**. An older host rejects the unsupported permissions. Installing this plugin alone does not upgrade EdgeEver.

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

## Install after your EdgeEver host supports research

1. In EdgeEver, configure a default model in **Personal Center → AI settings** if you want AI reports. Existing users do not enter the same key again.
2. Open **Plugin Marketplace**, paste the repository URL below, install, and enable the plugin.
3. Open **Hotspot Tracker: Start research** in the command palette, then enter a topic.

```text
https://github.com/tianma-if/edgeever-hotspot-tracker
```

Without an AI model, the plugin still retrieves public evidence and clearly labels the result as evidence-only. Model usage is billed by your configured provider. The plugin adds no source API keys, but public source availability depends on the instance's network and source rate limits.

The plugin runs in EdgeEver's trusted client plugin environment, not a hard JavaScript sandbox. This plugin uses permission-checked host methods; it does not request cookies or receive the AI provider key. Search keywords go to selected public sources through your existing EdgeEver backend. Your question and collected excerpts go to your configured AI provider. Research history and watchlists stay in device-local plugin storage; notes you explicitly save use normal workspace synchronization.

## Develop

Use Bun 1.3.14 or later. End users do not run these commands.

```sh
bun install --frozen-lockfile
bun run check
bun run test:live  # optional: four real public-source requests, no AI calls
bun run dev        # static development package server on 127.0.0.1:4178
```

Install `http://127.0.0.1:4178/manifest.json` into a compatible local EdgeEver development instance. `bun run dev` serves the compiled plugin only; it is not a research backend. Rebuild, reinstall the development manifest to refresh the cached package, and reload EdgeEver after changing the bundle.

The build produces a single browser module plus `manifest.json`, `LICENSE`, and `THIRD_PARTY_NOTICES.txt` in `dist/`. GitHub Releases distribute these files; the repository-root manifest must match the release manifest exactly. Tag builds are published as previews by the release workflow. CI runs deterministic tests and builds the bundle; it does not contact public sources or AI providers.

## EdgeEver maintainer integration

See [the integration guide](integration/README.md). It adds fixed-source search and existing-model generation to EdgeEver's shared backend, SDK, client, and plugin host. It also fixes delayed plugin panel mounting. This work belongs in a normal EdgeEver release; it is not another setup step for plugin users.

The integration script updates only named anchors and owned integration files, but is not transactional. Apply it to a checkout where you can review the resulting diff. It does not commit, deploy, migrate databases, or modify stored credentials.

## License

AGPL-3.0-or-later, consistent with EdgeEver. This is an independent TypeScript implementation inspired by Last30Days' multi-source research workflow; it does not bundle or invoke Last30Days. See [third-party notices](THIRD_PARTY_NOTICES.md) for dependencies.
