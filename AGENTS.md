# Working on EdgeEver Hotspot Tracker

- Keep README.md / README.zh-CN.md and architecture/integration language pairs aligned.
- End users must not deploy a second research service. Backend source requests live in EdgeEver's shared API.
- Do not add source credentials, cookie access, fabricated evidence, or unlabeled full-content claims.
- Run `bun run check` for plugin changes. Host changes also require the EdgeEver checkout's AGENTS.md gates.
- `integration/` and `scripts/integrate-host.ts` are maintainer tooling. Review host diffs without committing unrelated changes.
- Never commit keys, cookies, local environment files, research histories, or test notes.
- Browser verification uses Codex's built-in Browser/Chrome, never agent-browser.
- GitHub releases must contain the exact root manifest and a single-file main.js bundle. Preview releases remain marked as such until compatible host capabilities ship.
