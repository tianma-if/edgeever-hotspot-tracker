# EdgeEver Hotspot Tracker

[简体中文](README.zh-CN.md) · [Architecture](docs/architecture.md)

Choose your interests and a daily or weekly cadence. Receive one sourced hotspot note per issue, without another research service or a new API key.

## Getting started

Open **Plugin Marketplace → Hotspot Tracker → Plugin settings** and configure just two fields:

- **Interests**: for example, `AI, indie development, technology products`. Separate with commas, Chinese punctuation, or newlines. Up to five interests, 60 characters each; leave blank to stop automatic generation.
- **Frequency**: daily at 09:00, covering the previous day; or weekly on Monday at 09:00, covering the previous seven days. Both use the device timezone.

The initial default is weekly with no interests, so nothing starts automatically. Saved settings apply within approximately 30 seconds, even if the plugin panel has never opened. No preliminary research run or watchlist setup is needed. Sources, time window, and research depth are managed internally.

Each issue creates one note grouped by interest, explaining what happened and why it matters, with source links. Notes go to the inbox (`nb_inbox`), or the first available notebook if there is no inbox. If no notebook exists or saving fails, the result remains in the plugin for a save retry.

The panel shows recent results, **Generate now**, and **Pause/resume automatic generation**. Manual generation also saves automatically and remains available while paused. On the current device, an existing note for the same issue is reused without repeating searches or creating duplicates. Daily issues use the local date; weekly issues use the week starting Monday. Interest edits apply to the next issue; switching cadence uses the corresponding daily/weekly issue.

**Automatic generation requires EdgeEver desktop to remain running. Closing the app stops execution; missed runs are skipped.** Settings and run records are device-local, with no global cross-device deduplication. Closing the panel does not cancel an active run; cancellation and plugin deactivation stop requests.

## Notes and evidence boundaries

- Search news, Hacker News, public GitHub issues/PRs, and Reddit public feeds independently for each interest, then filter and deduplicate.
- Digests include only dated evidence inside the issue's rolling time window. Search coverage is limited and is not a global popularity ranking.
- AI uses EdgeEver's default model and the user's provider billing. Missing configuration or generation failure produces an explicitly labeled evidence digest, not a claimed AI synthesis.
- Missing domain coverage and failed sources are disclosed, without padding or assuming nothing happened. An issue with no evidence still saves an explanatory insufficient-evidence note.
- News and Reddit primarily provide headlines/excerpts, not full articles or complete comment trees. HN adds up to three comments for each of the first two results per query. GitHub supplies issue/PR bodies and comment counts, not comment bodies.
- Open the saved note, export Markdown, or regenerate from existing evidence. Saved notes remain original snapshots; regeneration does not overwrite them, and updated results can be exported.
- Citations trace back to retrieved links but do not establish factual correctness. Check important conclusions against originals.

The plugin never reads browser cookies or receives AI provider keys. Search keywords go to public sources through generic host networking; interests and excerpts go to the configured AI provider. The latest 30 results remain on the device; automatically saved notes use normal workspace synchronization. Plugins run in a trusted client environment, not a hard JavaScript sandbox.

## Upgrade and installation status

**Current preview: [v0.5.0-preview.1](https://github.com/tianma-if/edgeever-hotspot-tracker/releases/tag/v0.5.0-preview.1).** This revision replaces the research workbench with a daily/weekly subscription. Upgrades retain old research and watch records, retiring old per-topic schedules before enabling the unified schedule. Cleanup failures are shown and retried. Old source/depth defaults are no longer used; old topics are not silently subscribed. Enter your interests again.

The plugin still requires the host's generic `ai:generate` and `network:public` capabilities; see the [host capability contract](docs/host-capabilities.md). Those capabilities are implemented in the local development host; official release and production verification remain prerequisites for stable installation. Older production hosts may reject the permissions. Keep this a preview, do not patch EdgeEver, and do not use retired v0.1–v0.3 injection workflows.

## Development

Requires Bun 1.3.14 or later. End users do not need these commands.

```sh
bun install --frozen-lockfile
bun run check
bun run test:live  # Bun source requests only, not host/browser integration
bun run dev        # 127.0.0.1:4178, plugin package files only
bun scripts/ui-preview.ts  # 127.0.0.1:4179, explicitly synthetic host UI verification
```

Install the development manifest at `http://127.0.0.1:4178/manifest.json` only in a compatible development host. Rebuild, install the updated package, and refresh the host after changes. The development server performs no research business logic.

Checks include types, deterministic tests, and a single-file build. Browser UI verification uses synthetic sources, AI, and note storage; it is not proof of live source or desktop clock integration. Build output includes `dist/main.js`, the manifest, and licenses. Release manifests must exactly match the root manifest, with a single entry JS bundle. Releases remain prereleases until compatible host capabilities ship.

## Host boundary and license

Source requests, parsing, ranking, query planning, and report orchestration ship inside the plugin. Only generic network, AI, settings, storage, notes, and scheduling APIs are used. No source-specific host routes, SDK types, or research service are added.

Licensed AGPL-3.0-or-later. Inspired by Last30Days' multi-source research approach, without bundling or invoking it. See [third-party notices](THIRD_PARTY_NOTICES.md).
