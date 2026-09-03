# Working on EdgeEver Hotspot Tracker

- Keep README.md / README.zh-CN.md and architecture/integration language pairs aligned.
- End users must not deploy a second research service or patch EdgeEver. Source requests, parsing, ranking and research orchestration belong to the plugin. Use only generic host APIs for network, AI, settings, notes and schedules.
- Do not add source credentials, cookie access, fabricated evidence, or unlabeled full-content claims.
- Run `bun run check` for plugin changes. Host changes also require the EdgeEver checkout's AGENTS.md gates.
- Do not add source-specific host routes or SDK types. Missing general-purpose host capabilities must be documented as proposals, not silently treated as shipped APIs. Never modify an EdgeEver checkout as part of plugin installation.
- Never commit keys, cookies, local environment files, research histories, or test notes.
- Browser verification uses Codex's built-in Browser/Chrome, never agent-browser.
- GitHub releases must contain the exact root manifest and a single-file main.js bundle. Preview releases remain marked as such until compatible host capabilities ship.
