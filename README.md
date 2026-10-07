# Block Framework — M1

The deterministic core of Block Framework: a **project graph** (JSON) compiles
into a complete, runnable **Expo app** with **zero AI involved**.

```
examples/full-app/graph.json  (+ optional spine.json)
        │  blockc compile --spine spine.json
        ▼
out/  →  npm install → npx expo start  →  runs on a phone via Expo Go
```

M1 extends M0's two load-bearing claims (JSON → working app with no LLM;
byte-identical rebuilds) with:

1. **Block SDK** — `blockc sdk scaffold|test|validate` for authoring blocks.
2. **8-block library** — auth, quiz, paywall, home, detail, stats, profile,
   settings, each with 2 variants.
3. **Semantic event routing** — blocks declare typed event ports; the wiring
   engine routes events to the unique consumer by payload type, no manual
   wires needed.
4. **Entity Spine** — one typed data model generates the Supabase migration
   SQL, the TypeScript `Database` type, and the client bootstrap.
5. **Flow Lanes** — screens declare lanes (`main`, `tabs`, …); reachability
   analysis respects them.
6. **32-task benchmark** — all tasks run with zero tokens.

## Packages

| Package              | What it is                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `@blockfw/manifest`  | JSON Schemas (v0) + validators for block manifests and project graphs                           |
| `@blockfw/spine`     | Entity Spine: schema → PostgreSQL migration + TypeScript `Database` type                         |
| `@blockfw/blocks`    | The 8 hand-written blocks + template renderer + block registry + Block SDK                      |
| `@blockfw/wiring`    | The deterministic wiring engine (config validation, semantic routing, flow lanes, wiring report) |
| `@blockfw/compiler`  | Graph → Expo project compiler + `blockc` CLI                                                     |
| `@blockfw/benchmark` | 32-task benchmark harness + `bf-bench` CLI                                                       |

## The M1 block library

| Block                   | Variants                | Notes                                                      |
| ----------------------- | ----------------------- | ---------------------------------------------------------- |
| `auth.email@1.0.0`      | `signin`, `signup`      | Email auth; **mock service** (`src/services/auth.mock.ts`) |
| `onboarding.quiz@1.0.0` | `quiz-cards`, `quiz-list` | Question flow                                            |
| `paywall.basic@1.0.0`   | `cards`, `compact`      | Subscription paywall; **mock billing** (`billing.mock.ts`) |
| `home.list@1.0.0`       | `list`, `grid`          | Item list; emits typed `home.itemSelected`                 |
| `content.detail@1.0.0`  | `article`, `product`    | Consumes `home.itemSelected`; renders the routed item      |
| `stats.overview@1.0.0`  | `row`, `grid`           | Stat cards                                                 |
| `profile.card@1.0.0`    | `card`, `compact`       | Profile header                                             |
| `settings.list@1.0.0`   | `list`, `grouped`       | Settings with toggles                                      |

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

## What M1 deliberately does not include

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
