# Milestone 3 Report — Agent Gateway

**Date:** October 8, 2026
**Branch:** `milestone-3` (to be created)
**Status:** Complete, all exit criteria met except live-model verification (no key available)

## What M3 built

The Agent Gateway (`@blockfw/agent`): plain-language instructions become scoped,
reviewable, reversible edits to the project.

### Architecture

```
User instruction
    ↓
AgentGateway.plan()
    ├─→ Prompt planner (compact block cards, never source code)
    ├─→ LlmProvider (recorded | OpenAI-compatible live)
    ├─→ Scoping validator (6 checks per op)
    ├─→ Bounded retry (max 3) with rejection feedback
    └─→ Returns: plan + field-level diff + token usage (NOT applied)
    ↓
Human reviews diff in UI
    ↓
AgentGateway.apply() → validates → clones → applies → marks touched → snapshots
    ↓
Undo restores snapshot
```

### Safety invariants (all tested)

1. **Path shape:** Must be `block:<id>.config.<key>` — anything else rejected.
2. **Block exists:** Unknown instance IDs rejected.
3. **editSurface:** Field must be in the block's manifest `editSurface`.
4. **Locked:** Fields in `locked` (e.g., `ports`, `variants`) rejected.
5. **Touched:** User hand-edited paths are never overwritten by the agent.
6. **Schema:** Every value validated against the property's JSON Schema (Ajv).

### Adversarial tests (all pass)

| Attack                                         | Result                           |
| ---------------------------------------------- | -------------------------------- |
| Edit locked field (`config.ports`)             | Rejected, retried 3x, plan fails |
| Schema violation (empty headline, minLength 1) | Rejected                         |
| Screen deletion (`block:s1.delete`)            | Rejected (bad path shape)        |
| Scope escape (`app.slug`, `graph.screens`)     | Rejected                         |
| Touched-path overwrite                         | Rejected                         |
| Malformed JSON from model                      | Parsed/rejected, retried         |
| Provider throws                                | Clear error, no partial state    |

## Verification

### Tests

- **121 unit/render tests** pass (12 files), including 16 new agent tests.
- **8/8 Playwright E2E** (Firefox) pass, including the full agent flow:
  plan → diff review → apply → preview update → undo → state restored.
- **42/42 benchmark tasks**: 36 mechanical (zero tokens) + 6 agent safety tasks.

### Determinism

- Compile hash stable across 3 separate processes: `5f06c3ba...`
- Recorded provider: byte-identical plans for same instruction.
- E2E agent test asserts exact diff (5 ops for "make it playful").

### CI

- `scripts/ci.sh`: clean install → build → 121 tests → E2E → lint → typecheck →
  prettier → benchmark → Metro export. All green.
- Fixed CI bug: E2E exit code is now checked (was reporting "green" on failure).

### Demo dry run

1. "make it playful" → 5-op plan, diff shown, `◌ recorded demo` badge.
2. Apply → project updated, 5 paths marked touched.
3. Preview iframes reload automatically with new copy.
4. Undo → headlines restored, touched paths cleared.
5. Usage: 1 call, 530 tokens (420 in + 110 out).

## Token / cost honesty

| Source                            | Tokens       | Cost                                |
| --------------------------------- | ------------ | ----------------------------------- |
| Recorded demo ("make it playful") | 530          | $0 (no model call)                  |
| Benchmark agent tasks (6)         | ~8,000 total | $0 (recorded)                       |
| Live model                        | —            | **NOT RUN** — no key in environment |

The UI labels every response as `◌ recorded demo` or `● live model`.
No model outputs were faked or presented as real.

## Changes from M0–M2 (per "tell me before changing")

1. **Three block manifests** (`home.list`, `onboarding.quiz`, `paywall.basic`):
   `editSurface` changed from file globs (`src/blocks/<instance>.tsx`) to config
   paths (`config.title`, etc.). File globs don't work with the scoped edit
   engine. `locked` normalized to `['ports', 'variants']`.
2. **Manifest schema**: `editSurface` `minItems: 1` removed (empty = nothing
   agent-editable, legitimate for `onboarding.quiz`).
3. **CI script**: E2E exit code now checked (was silently passing on failure).

## Reuse log

See `docs/m3-reuse-log.md`. Key decisions:

- Reused Ajv (MIT) for schema validation — already a dependency.
- Rejected `openai` SDK and Vercel `ai` SDK — thin `fetch` client is sufficient.
- Custom diff/undo — field-level JSON diff, not text diff.
- `tokenx` vetted but deferred — heuristic is honestly labeled.

## Limitations & M4 implications

1. **No live-model verification.** The gateway is built and tested against the
   recorded provider, but real-model behavior (prompt adherence, op quality,
   actual token counts, success rate on varied instructions) is unverified.
   T43 in the benchmark will run automatically when `BLOCKFW_LLM_*` is set.
2. **Recorded responses are fixed.** The demo only handles the 3 canned
   instructions in `demo.json`. A live model would handle arbitrary input.
3. **Text-only edits.** The agent can only edit string/config fields, not
   restructure blocks or add new screens. This is intentional (safety), but
   limits the "wow" factor for complex requests.
4. **Preview latency.** Full re-render on each edit (~1-2s for 8 blocks).
   Acceptable for demo; esbuild incremental API could optimize in M4.

## Files changed

- New: `packages/agent/` (gateway, providers, planner, scoping, tests, recorded demo)
- New: `packages/builder/ui/src/AgentView.tsx` (agent tab UI)
- New: `docs/m3-reuse-log.md`
- Modified: `packages/builder/src/server.ts` (agent API endpoints)
- Modified: 3 block manifests (editSurface fix)
- Modified: `packages/manifest/src/schema/block-manifest-v0.json` (allow empty editSurface)
- Modified: `packages/benchmark/` (6 agent tasks, live-model spot check)
- Modified: `scripts/ci.sh` (E2E exit code check)
- Modified: `README.md`, `~/AGENTS.md`
