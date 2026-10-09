# ADR-0011: Readable exports and executable quality checks

Date: 2026-10-09. Status: accepted; quality commands and initial feature decomposition implemented.

## Decision and reuse

Use the plan §17.2 ESLint + Prettier option, reusing the repository's installed tools and configuration conventions. Generated configuration is editable source. Biome was evaluated through its official configuration/formatter documentation; adding a second formatter would add dependency and output differences without improving this migration. TypeScript remains strict. Lint must fail on warnings as well as errors; do not hide generated source from checks.

Checked npm metadata, GitHub license files and the awesome-typescript index before implementation. ESLint 10.12.0 (October 2), typescript-eslint 8.71.1 (October 5), and Prettier 3.9.9 (September 23) are MIT and have recent releases. Their APIs support TypeScript/React syntax and do not depend on a React/native runtime version. The repository already uses these versions. The @eslint/js 10.0.1 configuration release is older than six months; its actively maintained parent ESLint repository released this month. Reuse the existing configuration package rather than inventing lint rules. Existing ts-morph 28 and synckit 0.12.1 remain compiler-only dependencies under ADR-0007.

Use ts-morph to compose readable modules from existing runtime declarations, preserving behavior and error handling. Do not hand-parse TypeScript with regex. Final source formatting runs through the existing synchronous Prettier worker. Graph JSON and reports retain canonical JSON; formatting checks explicitly distinguish canonical machine contracts from editable source. Recompute nested hashes after all source transformations. Preserve standalone compatibility exports and their Phase 0 fixtures; professional workspace changes receive explicit new fixture revisions.

The user selected extending the existing Design editor on October 9. Keep its graph-operation/history path and add nested layers and slots; do not integrate Puck or create a second persisted editor model. ADR-0002's evaluation is retained as evidence for that decision.

## Scope and verification

Changes must reach workspace composition, the formatting worker, emitted package scripts/configuration/CI/docs, source and ZIP fixtures, and compiler tests. Verify generated SaaS and Notes typecheck/lint/format/tests/build independently, including deliberate failure probes. Verify unchanged standalone bytes and all repository gates before each commit. File-size/dead-code checks and block/source decomposition must be measured, not inferred from file count. No source-only refactor may discard persistence, permissions, error handling, labels or existing event semantics.

Sources: [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files), [ESLint MIT license](https://github.com/eslint/eslint/blob/main/LICENSE), [typescript-eslint MIT license](https://github.com/typescript-eslint/typescript-eslint/blob/main/LICENSE), [Prettier API](https://prettier.io/docs/api), [Prettier MIT license](https://github.com/prettier/prettier/blob/main/LICENSE), [Biome configuration](https://biomejs.dev/reference/configuration/), [TypeScript index](https://github.com/dzharii/awesome-typescript).

## Quality command results

For the stylesheet decomposition, reuse PostCSS 8.5.29 (already installed transitively) as an explicit compiler dependency. Its MIT license meets the allowlist; the official [AST API](https://postcss.org/api/) and [license](https://github.com/postcss/postcss/blob/main/LICENSE) were checked before adoption. Split only at explicit feature boundaries and retain original rule order, including media queries, so the cascade stays unchanged. PostCSS parses the CSS; no custom parser is introduced.

SaaS and Notes workspaces independently passed both app typechecks, strict lint, format checks and 5/9 DOM tests respectively. SaaS production web and Android/iOS Hermes bundles passed. The generated CI runs the same lint and format commands. Canonical graph/report JSON and the pnpm-owned lockfile are intentionally outside Prettier's scope; editable source, CSS, HTML, documentation and workflow YAML are included.

Unused imports/parameters are removed through TypeScript code fixes. Legacy empty event object types become `object`, retaining support for populated record events while excluding primitives. The bounded formatting cache returns copies. The worker starts only for professional workspace exports. Two cold export integration tests now allow 20 seconds because concurrent worker startup exceeded their previous five-second budget; no global test timeout changed.

Repository verification: typecheck, lint, 262 unit tests, Studio build and 68 browser tests passed. `phase1-saas-quality.json` is the deliberate workspace revision for added quality files and formatted source; the earlier SaaS fixture and both Phase 0 fixtures remain in Git. Sample closed issue/PR activity was checked October 9: ESLint #21399 (October 8), typescript-eslint #12997 and Prettier #20258 (October 9). These are maintenance signals, not a guarantee of future support.

## Feature decomposition results

Web runtime declarations and web/native data components now emit as named modules with public compatibility barrels. The web preview hook retains its origin/source checks. CSS is partitioned at explicit feature boundaries in original order, including media queries and terminated imports. PostCSS released October 5; closed issue #2164 on that date was checked as a maintenance signal.

`phase1-saas-modules.json` deliberately records the new module paths and source hashes; prior fixtures remain untouched. Every generated SaaS TS/TSX/CSS file is at most 300 lines. SaaS and Notes passed typecheck, lint, format, DOM tests, web and Android/iOS bundle builds. The final CSS correction was rebuilt for both web apps without warnings and yielded the same production CSS asset hash as before decomposition. SaaS editing/persistence acceptance passed in Chromium and Firefox.

All repository gates passed again: typecheck, lint, 262 unit tests, Studio build and 68 browser tests. Vitest concurrency is bounded at four workers to avoid concurrent compiler-worker startup contention on this machine. Workspace integration tests have a 20-second budget; their assertions remain intact. This decomposition does not yet remove unused block implementations or replace the legacy renderers with the planned v2 catalog.
