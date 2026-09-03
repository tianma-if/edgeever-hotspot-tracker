# EdgeEver maintainer integration

[简体中文](README.zh-CN.md)

This directory supplies the host additions needed by the standalone plugin. End users must receive these in an EdgeEver update, not apply them manually.

Tested against the local EdgeEver 1.54.0 source layout. Run from this plugin repository:

```sh
bun install --frozen-lockfile
bun scripts/integrate-host.ts /path/to/edgeever
```

Then in the EdgeEver checkout:

```sh
bun install --ignore-scripts
bun run build:plugin-api
bun test apps/api/src/plugin-research-routes.test.mjs
bun test apps/web/src/lib/plugins/plugin-research-permissions.test.mjs
bun test apps/web/src/lib/plugins/plugin-research-lifecycle.test.mjs
bun run typecheck
bun run typecheck:mobile
bun run build:web
```

Review the SDK permissions/types, client bridge, web plugin context/WorkspaceApp wiring, shared API registration, fixed source adapters, dependency/lockfile changes, and the reactive mount fix in PluginPanelDialog. Add the documented APIs to the bilingual plugin-development guide. Follow EdgeEver's normal main-branch and release procedures when shipping.

The script is idempotent on the tested layout. It refuses changed anchors rather than guessing, but earlier changes can already be written when a later anchor fails. Generated files are overwritten from this repository. Review a diff before committing; do not sweep in other work in the checkout. No database or stored-key migration is needed.

The two new permissions are additive to API version 1. Older hosts reject them, so no misleading numeric minimum version is claimed before the corresponding EdgeEver release exists. Android/iOS plugin execution is not added by this integration.
