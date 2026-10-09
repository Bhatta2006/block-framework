# ADR-0008: One typed application write path

Date: 2026-10-09. Status: accepted implementation of plan §4 move 1.

## Decision and reuse

The graph-operation contract and executor are core IP. Reuse Ajv validation, the existing canonical JSON serializer, the serialized `useProject` edit queue, gateway scope checks, and the catalog's atomic replacement. No new dependency. Research considered [Immer](https://github.com/immerjs/immer) (MIT) and [JSON Patch](https://github.com/Starcounter-Jack/JSON-Patch) (MIT); neither supplies application semantics, stable block IDs, manifest permissions, touched protection or compiler gates. A general patch dependency would not replace this contract.

`GraphOperation` describes pages, block insertion/config/design, ordering, wires, themes, app metadata, data/flow definitions and bindings. `ProjectOperation` adds profile and touched metadata. Transactions copy inputs, check finite JSON/prototype safety, apply all operations, then validate the resulting graph. Partial transactions never become saved state. Later-phase declarations can be authored against v1 but existing emitters reject unsupported execution.

Existing UI recipes run on detached drafts and become typed operations via `diffProjectOperations`; they never persist a draft directly. The server executes operations, validates graph/config/wiring through the compiler, and saves before committing a log entry. Developer imports, profile cascade, touch metadata, and reviewed agent apply use the same mechanism. Agent permissions remain narrower than manual editor permissions and are rechecked before translating approved paths to `setBlockField`.

The canonical v1 storage graph is hydrated inside the log; accepted results are projected to the existing editor view. This preserves authored target declarations while retaining current editor callbacks. There is one persisted graph. UI writes and undo/redo carry a revision and app identity; stale requests reject. Per-app logs retain 50 accepted transactions and their forward/inverse operations. No snapshot stacks. The agent's Undo action rejects when a newer manual operation is on top; the workspace Undo handles the shared history.

The CLI adds `blockc ops apply <graph.json> <operations.json> --out <graph.json>`, using the same executor and compiler checks. It writes schema v1 plus an operation-log sidecar only after validation. Test/benchmark fixture constructors may intentionally create invalid input for quality-gate tests; they do not write application state.

## Limits and verification

Studio history remains session-local, matching the prior undo lifecycle; durable collaboration/history storage is a later phase. Switching apps preserves each app's session log. CLI sidecars record a single command's accepted transaction. Failed operations, persistence failures and failed undo do not advance history. Test manual/AI interleaving, inverse replay, redo invalidation, prototype attacks, ordering, stale revisions, failed saves, target preservation and CLI file preservation; run every existing unit/browser suite and export baseline.
