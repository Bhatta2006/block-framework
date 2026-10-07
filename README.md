# Block Framework — M0

The deterministic core of Block Framework: a **project graph** (JSON) compiles
into a complete, runnable **Expo app** with **zero AI involved**.

```
examples/subscription-app/graph.json
        │  blockc compile
        ▼
/tmp/bf-app/  →  npm install → npx expo start  →  runs on a phone via Expo Go
```

M0 proves the two load-bearing claims the whole product rests on:

1. **JSON → working app, no LLM.** The wiring engine resolves every block
   connection by rule (explicit wires win; otherwise events route to the next
   screen by convention). Moving a screen or editing a config is pure JSON
   surgery — there is no model call anywhere in the path.
2. **Byte-identical rebuilds.** Compiling the same graph twice produces
   identical output (SHA-256 verified). Same diagram, same code, every time.

## Packages

| Package              | What it is                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `@blockfw/manifest`  | JSON Schemas (v0) + validators for block manifests and project graphs                                |
| `@blockfw/blocks`    | The 3 hand-written M0 blocks + template renderer + block registry                                    |
| `@blockfw/wiring`    | The deterministic wiring engine (config validation, requires/provides, event routing, wiring report) |
| `@blockfw/compiler`  | Graph → Expo project compiler + `blockc` CLI                                                         |
| `@blockfw/benchmark` | 20-task benchmark harness + `bf-bench` CLI                                                           |

## The M0 block library

- `onboarding.quiz@1.0.0` — question flow (variants: `quiz-cards`, `quiz-list`)
- `paywall.basic@1.0.0` — subscription paywall (variants: `cards`, `compact`);
  checkout is a **labeled mock** (`src/services/billing.mock.ts`) until M1
- `home.list@1.0.0` — item list home screen (variants: `list`, `grid`)

## Quick start

```bash
npm install
npm run build      # tsc -b (project references, topological)
npm test           # vitest, 53 tests
npm run lint
npm run typecheck  # build + test-file typecheck
```

```bash
# Validate a graph and print its wiring report
node packages/compiler/dist/cli.js validate examples/subscription-app/graph.json

# Compile to an Expo project
node packages/compiler/dist/cli.js compile examples/subscription-app/graph.json --out /tmp/bf-app

# Run it (needs the Expo Go app on a phone)
cd /tmp/bf-app && npm install && npx expo start

# Benchmark: 20 tasks, mock agent, zero tokens
node packages/benchmark/dist/cli.js run --agent mock --out results.json
```

## What M0 deliberately does not include

- **No LLM integration.** There is intentionally no model code path; that is
  the experiment. The Agent Gateway arrives in M3.
- **No real backend.** Supabase and RevenueCat are declared interfaces with
  mock implementations, flagged in the wiring report on every build.
- **No canvas UI, no Block SDK CLI, no Entity Spine, no preview server.**
  Those are Milestones 1–3.

## Benchmark baseline (for later)

`bf-bench run --agent mock` runs the 20 tasks mechanically and records
`tokens: 0`. Replaying the same tasks against a baseline coding agent is how
the "70% fewer tokens" claim gets proven instead of asserted — it needs an
LLM API key, which is documented here rather than faked:

1. For each task in `bf-bench list`, prompt the baseline agent with the task
   description against the compiled `/tmp/bf-app` project.
2. Record wall time, input/output tokens, and whether the result still
   typechecks and behaves the same.
3. Compare against `results.json` from the mock run.

## Repo conventions

- TypeScript strict, `NodeNext` modules, project references (`tsc -b`).
- Tests run against **source** (vitest alias); typechecks validate the
  **built** public API.
- Generated code must be deterministic: sorted keys, no timestamps.
- `npm run format` (prettier) before committing.

### Why `@blockfw/manifest` pins `fast-uri` and `require-from-string`

These are ajv's transitive dependencies, not ours — but npm's arborist
(verified on npm 10.9.4 and 11.21.0) silently drops them from the install
tree when ajv@8 is nested under a workspace while eslint pulls ajv@6 at the
root. The result is a `Cannot find module 'fast-uri'` crash at runtime, with
a clean-looking `npm install` exit code. Pinning them as direct dependencies
forces them into the tree and makes fresh installs hermetic. If ajv is ever
replaced, these pins go with it.
