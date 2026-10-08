# Block Framework — M3

The deterministic core of Block Framework: a **project graph** (JSON) compiles
into a complete, runnable **Expo app** with **zero AI involved**.

```
examples/full-app/graph.json  (+ optional spine.json)
        │  blockc compile --spine spine.json
        ▼
out/  →  npm install → npx expo start  →  runs on a phone via Expo Go
```

M3 adds the **Agent Gateway**: plain-language instructions become scoped,
reviewable, reversible edits — the agent only touches fields inside each
block's `editSurface`, never locked fields or hand-edited paths.

M3 extends M2 (visual builder, Profile Cascade, 8-block library) with:

1. **Agent Gateway** (`@blockfw/agent`) — provider abstraction (`LlmProvider`),
   deterministic recorded provider for offline tests, OpenAI-compatible live
   provider via `BLOCKFW_LLM_*` env vars (no keys in code).
2. **Scoped edit engine** — the model sees only compact block cards (never
   source code); every proposed op is validated against path shape, block
   existence, `editSurface`, `locked`, touched paths, and JSON Schema.
3. **Plan → review → apply** — the UI shows a field-level diff (before/after)
   with rationale; nothing applies without human approval. Stale plans
   (project changed since planning) are rejected.
4. **Undo** — every apply pushes a snapshot; one click restores.
5. **Token logging** — per-call and session totals, honestly labeled as
   recorded-demo vs. live-model.
6. **Live previews** — agent edits invalidate the hash-keyed preview cache;
   iframes reload automatically (no full rebuild).
7. **42-task benchmark** — 36 mechanical (zero tokens) + 6 agent safety tasks
   (recorded, deterministic); T43 live-model spot check runs only with a key.
8. **Adversarial tests** — locked-field edits, schema violations, screen
   deletion, scope escape, prompt-injection-shaped outputs: all rejected.
9. **Block Cards** — deterministic ≤300-token summaries of every block.

## Packages

| Package              | What it is                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `@blockfw/manifest`  | JSON Schemas (v0) + validators for block manifests and project graphs                            |
| `@blockfw/spine`     | Entity Spine: schema → PostgreSQL migration + TypeScript `Database` type                         |
| `@blockfw/blocks`    | The 8 hand-written blocks + template renderer + block registry + Block SDK                       |
| `@blockfw/wiring`    | The deterministic wiring engine (config validation, semantic routing, flow lanes, wiring report) |
| `@blockfw/compiler`  | Graph → Expo project compiler + `blockc` CLI                                                     |
| `@blockfw/benchmark` | 36-task benchmark harness + `bf-bench` CLI                                                       |
| `@blockfw/builder`   | Visual builder: Profile Cascade, block cards, `block-canvas` server + SPA                        |

## The M1 block library

| Block                   | Variants                  | Notes                                                      |
| ----------------------- | ------------------------- | ---------------------------------------------------------- |
| `auth.email@1.0.0`      | `signin`, `signup`        | Email auth; **mock service** (`src/services/auth.mock.ts`) |
| `onboarding.quiz@1.0.0` | `quiz-cards`, `quiz-list` | Question flow                                              |
| `paywall.basic@1.0.0`   | `cards`, `compact`        | Subscription paywall; **mock billing** (`billing.mock.ts`) |
| `home.list@1.0.0`       | `list`, `grid`            | Item list; emits typed `home.itemSelected`                 |
| `content.detail@1.0.0`  | `article`, `product`      | Consumes `home.itemSelected`; renders the routed item      |
| `stats.overview@1.0.0`  | `row`, `grid`             | Stat cards                                                 |
| `profile.card@1.0.0`    | `card`, `compact`         | Profile header                                             |
| `settings.list@1.0.0`   | `list`, `grouped`         | Settings with toggles                                      |

## Quick start

```bash
npm install
npm run build      # tsc -b (project references, topological)
npm test           # vitest, 84 tests (unit + headless render)
npm run lint
npm run typecheck  # build + test-file typecheck
bash scripts/ci.sh # full clean-install CI: build, tests, benchmark, emitted-app typecheck + Metro export
```

```bash
# Validate a graph and print its wiring report
node packages/compiler/dist/cli.js validate examples/full-app/graph.json

# Compile the full 8-block example to an Expo project (with Entity Spine)
node packages/compiler/dist/cli.js compile examples/full-app/graph.json \
  --out /tmp/bf-app --spine examples/full-app/spine.json

# Run it (needs the Expo Go app on a phone)
cd /tmp/bf-app && npm install && npx expo start
# Scan the QR code with Expo Go on your phone.

# Benchmark: 32 tasks, mock agent, zero tokens
node packages/benchmark/dist/cli.js run --agent mock --out results.json
```

## Block SDK

```bash
# Scaffold a new block (manifest + template + sample config + test stub)
node packages/compiler/dist/cli.js sdk scaffold my.block --category mycat

# Validate one block (or all): manifest, sample config, render, determinism
node packages/compiler/dist/cli.js sdk validate
node packages/compiler/dist/cli.js sdk validate my.block@1.0.0

# Test-render every variant headlessly
node packages/compiler/dist/cli.js sdk test
```

## Entity Spine

`spine.json` declares entities; the compiler generates everything else:

```bash
# Print the PostgreSQL migration
node packages/compiler/dist/cli.js spine sql examples/full-app/spine.json

# Print the TypeScript Database type
node packages/compiler/dist/cli.js spine types examples/full-app/spine.json

# Compile an app with the spine: emits supabase/migrations/0001_spine.sql,
# src/spine-types.ts, src/supabase.ts, and adds @supabase/supabase-js
node packages/compiler/dist/cli.js compile graph.json --out out --spine spine.json
```

Apply the migration with `psql $DATABASE_URL -f supabase/migrations/0001_spine.sql`
or paste it into the Supabase dashboard SQL editor. The generated app reads
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` at runtime.

## Semantic routing

Blocks declare typed ports:

```json
"ports": {
  "emits": [
    {
      "event": "home.itemSelected",
      "payload": {
        "type": "object",
        "properties": { "item": { "type": "object", "properties": { "id": { "type": "string" } } } },
        "required": ["item"]
      }
    }
  ],
  "consumes": ["app.launched"]
}
```

Routing precedence: **explicit wire** → **unique semantic consumer** (payload
schemas must be compatible) → **next-screen convention** → terminal note.
Ambiguous consumers and payload mismatches fail loudly at compile time.
Routed payloads become typed navigation params (`route.params.input`) on the
receiving screen.

## Flow Lanes

Screens may declare a `lane`. The `main` lane follows event wires; other
lanes (e.g. `tabs`) are reachable outside the event flow (tab bar, drawer,
deep link) and are excluded from reachability warnings:

```json
{ "id": "s6", "block": "b6", "title": "Progress", "lane": "tabs" }
```

## What M2 deliberately does not include

- **No LLM integration.** There is intentionally no model code path; that is
  the experiment. The Agent Gateway arrives in M3.
- **No real backend calls.** Supabase is now a real generated client + real
  migration SQL, but the anon key is yours to provide; auth and billing
  remain **labeled mocks**, flagged in the wiring report on every build.
- **No canvas UI, no preview server.** Those are Milestones 2–3.

## Benchmark baseline (for later)

`bf-bench run --agent mock` runs the 32 tasks mechanically and records
`tokens: 0`. Replaying the same tasks against a baseline coding agent is how
token-reduction claims get proven instead of asserted — it needs an LLM API
key, which is documented here rather than faked:

1. For each task in `bf-bench list`, prompt the baseline agent with the task
   description against a compiled example project.
2. Record wall time, input/output tokens, and whether the result still
   typechecks and behaves the same.
3. Compare against `results.json` from the mock run.

## Repo conventions

- TypeScript strict, `NodeNext` modules, project references (`tsc -b`).
- Tests run against **source** (vitest alias); typechecks validate the
  **built** public API.
- Generated code must be deterministic: sorted keys, no timestamps.
- `npm run format` (prettier) before committing.
- Scratch dirs (`.ci-work/`, `.audit-work/`, `__render_out__/`) are gitignored;
  big installs go there, never `/tmp` (512M tmpfs).

### Why `@blockfw/manifest` pins `fast-uri` and `require-from-string`

These are ajv's transitive dependencies, not ours — but npm's arborist
(verified on npm 10.9.4 and 11.21.0) silently drops them from the install
tree when ajv@8 is nested under a workspace while eslint pulls ajv@6 at the
root. The result is a `Cannot find module 'fast-uri'` crash at runtime, with
a clean-looking `npm install` exit code. Pinning them as direct dependencies
forces them into the tree and makes fresh installs hermetic. If ajv is ever
upgraded or replaced, re-verify with a clean install + `scripts/ci.sh`.
