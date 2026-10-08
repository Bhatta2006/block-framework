# M3 Reuse Log

Decisions on reusing existing libraries vs. building custom, per the M3 brief's
requirement to research and vet before significant custom work.

## Provider SDKs

### Evaluated: `openai` npm SDK (MIT)

- **What:** Official OpenAI client, supports OpenAI-compatible endpoints via `baseURL`.
- **Health:** Very active, 9k+ stars, maintained by OpenAI.
- **Decision:** REJECTED. The M3 provider only needs a single `POST /chat/completions`
  with a JSON body — ~30 lines with `fetch`. The SDK would add version lock-in
  and a larger API surface for no benefit at this stage. If we later need
  streaming, retries with backoff, or Azure-specific auth, re-evaluate.

### Evaluated: Vercel `ai` SDK (Apache-2.0)

- **What:** Unified LLM client with structured-output helpers (`generateObject`).
- **Health:** Very active, industry standard.
- **Decision:** REJECTED for M3. `generateObject` with Zod would be nice for the
  ops schema, but it pulls in the full AI SDK + Zod. Our output contract is a
  single small JSON shape validated by Ajv (already a dependency). Re-evaluate
  when we need tool calling or multi-provider fallbacks.

### Chosen: thin `fetch` client (`OpenAICompatibleProvider`)

- **Why:** 30 lines, zero new dependencies, works with any OpenAI-compatible
  endpoint (OpenAI, OpenRouter, Groq, DeepSeek, Ollama, local models).
- **License impact:** None (our code).

## Structured Output / Validation

### Reused: Ajv 8.20.0 (MIT) — already a dependency via `@blockfw/manifest`

- **What:** JSON Schema validator.
- **Why reuse:** Already in the tree (used for manifest and config validation).
  The agent validates every model-proposed value against the block's property
  schema with the same Ajv instance semantics.
- **Dependency cost:** Zero new (already nested under `packages/agent`).

### Rejected: Zod (MIT)

- **Why:** Would duplicate Ajv's role. Our schemas are JSON Schema (from block
  manifests); Ajv validates them natively. Zod would require converting
  schemas or maintaining parallel definitions.

## Diff / Undo

### Custom-built

- **Why:** The diff is field-level (path, before, after) over the project JSON,
  not text diff. Undo is a snapshot stack of immutable project clones.
- **Evaluated:** `diff` npm package (BSD-3-Clause) — text-oriented, wrong
  abstraction for JSON field diffs. No suitable JSON-field-diff library found
  that integrates with our touched-path semantics.
- **Decision:** Custom, ~40 lines. This is the project's differentiating safety
  model; a generic library would not understand editSurface/locked/touched.

## Preview / Hot Reload

### Reused: esbuild 0.28.2 (MIT) — already a dependency via `@blockfw/builder`

- **What:** Bundles block components for static HTML previews.
- **Why reuse:** Already used in M2 for preview bundling. M3 keeps the same
  pipeline; "hot update" is achieved by hash-keyed cache invalidation
  (project hash changes → cache miss → re-render) plus a client-side
  `previewBust` counter that reloads iframes after agent edits.
- **Evaluated:** Vite HMR, esbuild incremental API — overkill for 8 static
  previews; the full re-render is ~1-2s, acceptable for the demo.

### Reused: React 19 / react-dom/server — already dependencies

- **What:** SSR for static previews.
- **Decision:** No change from M2.

## Token Counting

### Chosen: character/4 heuristic (documented as conservative estimate)

- **Evaluated:** `tokenx` npm (MIT, v2.1.1, 95%+ BPE accuracy) — vetted in M2,
  better estimator. **Not yet swapped in** — the heuristic is honestly labeled
  and sufficient for the demo. Swap in M4 when real cost tracking matters.

## Summary

| Need                         | Decision                            | License            |
| ---------------------------- | ----------------------------------- | ------------------ |
| LLM provider client          | Custom thin `fetch`                 | — (our code)       |
| Structured output validation | Reuse Ajv 8                         | MIT                |
| Diff/undo                    | Custom                              | — (our code)       |
| Preview bundling             | Reuse esbuild                       | MIT                |
| Token estimation             | Heuristic (tokenx vetted, deferred) | MIT (when adopted) |

No GPL/AGPL/unclear licenses introduced. All new code is the project's own.
