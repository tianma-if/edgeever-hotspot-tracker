# How it works

[简体中文](architecture.zh-CN.md)

## Two settings, one note

Native settings declare only `digest.interests` (text) and `digest.frequency` (daily/weekly). Empty interests do not start work. Sources and depth are internal: all four sources, standard research.

`src/settings.ts` reads both fields with a five-second deadline, parses Chinese/English separators, deduplicates, and limits input to five interests of 60 characters each. Invalid/unreadable settings stop automatic generation instead of guessing interests or cadence. Missing settings capability is explained as requiring a compatible host.

`src/digest.ts` registers the unified `generate-digest` command at activation, without waiting for a panel to open. Settings are read at activation, panel mount, manual refresh, before execution, and every 30 seconds. The host has no settings-change notification, so no unimplemented event API is assumed. Reads and schedule reconciliation are serialized; unchanged schedules are not rewritten. Deactivation clears timers, commands, and requests.

## Scheduling and saving

Existing `schedules.upsert/remove` APIs manage the stable `hotspot-digest` key. Daily uses `0 9 * * *`; weekly uses `0 9 * * 1`, in the device timezone, skipping missed runs. Frequency changes update that same schedule. Pause state is stored locally; blank interests or invalid settings remove the schedule. Sync failures are shown and retried, never presented as successfully enabled. Execution requires a running desktop app, not a separate background research service.

Windows are the preceding 24 hours or 7×24 hours as of generation start, not complete calendar-day/week archives. Issue deduplication uses the local calendar date or Monday-starting week. Manual and scheduled generation share a mutual-exclusion path and reuse saved issues. Manual generation can occupy the current issue early; the scheduled time does not create another note. Interest edits do not regenerate an already saved issue.

All interests belong to one Run and one note. After completion, `notebooks.list` selects `nb_inbox` or the first notebook, and `notes.create` saves the result. Empty coverage still saves an explanatory note. Failed saves retain completed drafts; the next attempt retries saving only. Note IDs are retained in the Run and a separate index of up to four issues, so eviction from the 30-run history does not create duplicate issues. Deduplication is device-local.

Closing the panel does not cancel work. Cancellation/deactivation aborts requests. Pausing or clearing settings cancels active automatic generation, not manual generation. Already dispatched `notes.create` calls have no generic cancellation contract and can still complete; a returned ID must be persisted. **The host does not provide idempotent note creation or an atomic note-create/plugin-state transaction**: a lost success response or process crash after creation can lead to duplicates on retry. Idempotent writes and settings subscriptions are future generic capability proposals, not assumed shipped APIs.

## Search and reports

`src/engine.ts` retains the generic research engine. Digests plan independently per interest, always retaining the original interest query and optionally adding one accurate English query. Each source/query returns at most ten hits, with at most two requests in flight; HN enrichment adds up to two comment requests. All transport is injected through `src/runtime.ts`; source query syntax and XML/JSON parsing in `src/sources.ts` ship with the plugin.

Each interest is date- and lexically filtered, including English query expansions. Round-robin selection across interests caps evidence at 40 so a busy domain cannot crowd out others. Canonical URLs are deduplicated while retaining all matching interest labels. Digests exclude unknown, invalid, old, and future dates; legacy research retains its explicit undated labels. Ranking uses source position and keyword overlap, not incomparable cross-platform likes or claims of global trends.

AI applies a semantic relevance pass, then produces one report grouped by every interest. It selects up to five changes per domain, explains what happened and why it matters, labels inferences, and never pads missing coverage. Source text is untrusted data, not instructions; headline excerpts must not be represented as full articles. Evidence IDs are globally unique within a Run; citations can only link to retrieved URLs. This verifies provenance, not factual correctness or entailment.

Missing/failed AI produces grouped evidence explicitly labeled as not AI synthesis; empty evidence explains coverage limitations. Regeneration uses only original evidence, window, and interests without new searches. Failure/cancellation preserves the previous report. Saved notes are never overwritten; updated reports can be exported as Markdown.

Deadlines: AI status ten seconds, planning thirty, relevance forty-five, sources thirty, and report generation ninety. Evidence sent to the model is capped at 40 IDs and roughly 56,000 characters, shortening long comments/excerpts. Provider-side billing cancellation remains provider-dependent.

## UI, migration, and verification

`src/ui.ts` presents the subscription summary, generate now, pause/resume, refresh settings, and recent results, following EdgeEver's native page hierarchy for the title, setting summary, actions, and list. Ordinary configuration remains host-rendered from the manifest; the panel does not duplicate the settings form. There is no research composer, depth/source selection, or per-topic schedule management. Evidence and coverage are collapsed details. DOMPurify and marked safely render reports; excerpts are plain text. Shadow DOM isolates styles.

`src/store.ts` serializes device-local snapshots. Storage remains version 1 with optional additions: `Run.digest`, `Evidence.interests`, `digestPaused`, and `digestNotes`. No destructive migration is performed. Startup removes legacy watch schedules individually and marks each unscheduled only after success. Failures preserve the marker, block the new schedule, and retry later. Old research, watch records, comparison URLs, and follow-ups remain intact; they are not silently subscribed. Abandoned active runs still become interrupted.

Deterministic tests cover settings, cadence changes, deduplication, pause, save retry, migration, failed sources, dates, fair domain coverage, and UI safety. Browser checks use an explicit synthetic host for interaction/layout verification, with no real model calls or note writes. They do not establish desktop clock execution or production host integration.

## Host boundary

Only generic network, AI, settings, storage, notes, and scheduling capabilities are used. `ResearchBridge`, source types, interest structures, prompts, and report orchestration remain plugin-internal. No host research routes, source-specific SDK types, or second service are introduced. Generic network/AI capabilities must still ship officially before stable installation; see the [capability contract](host-capabilities.md). This working tree is an unreleased preview and does not modify the EdgeEver checkout.
