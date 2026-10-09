# Phase 0 deliberate export rebaseline

The original `compiler/test/fixtures/phase0-original.json` remains unchanged. Schema migration, operations and the IR split matched it byte-for-byte at commit 49dbfae. The sole Phase 0 rebaseline is the v2 source-vendoring commit, recorded in `phase0-v2.json` with per-file, aggregate and deterministic audited ZIP SHA-256 values. The golden suite compares v0 and migrated v1 results and checks all nine supported ZIPs. The unsupported Paper Cloud native fixture remains a rejection.

Changes have explicit causes:

| Target                | Changed/added paths                                          | Reason                                                                                                                |
| --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| All web               | src/runtime.tsx                                              | Replace Hero/Collection/Account dispatch with typed vendored composition                                              |
| All web               | src/blocks/content.hero/Hero.tsx, src/blocks/composition.tsx | Real Hero source and ts-morph/Prettier assembly                                                                       |
| All web, notes native | src/data-core.ts                                             | Move portable store out of a source string; normalize LF/format only                                                  |
| All web               | src/data-runtime.tsx                                         | Real authored Collection/provider/editor/summary with rewritten declared import; unchecked regex capture access fixed |
| Cloud web             | src/cloud-runtime.tsx                                        | Move authored auth runtime to its package, normalize LF; unchecked tuple access fixed                                 |
| All supported exports | blockfw.lock.json                                            | New deterministic dependency/source contract lock                                                                     |
| All supported exports | src/wiring-report.json                                       | Existing embedded aggregate hash reflects the intentional source changes                                              |

Every other path still matches the original per-file digest. Source semantics, CSS, event names, configs, provider behavior, dependency pins and native screen output stay unchanged. Benchmark file-change checks now explicitly allow the lock alongside the files already expected to change when block references change.

The original and new Notes and Paper Cloud exports were built independently with their pinned React 19.2.3/TypeScript 5.9.3/Vite 6.4.4 dependencies. Notes JS: 236.11 → 236.60 kB, gzip 73.60 → 73.76 kB. Cloud JS: 282.07 → 282.67 kB, gzip 88.87 → 89.16 kB. CSS bytes are unchanged (17.06/21.56 kB). These modest increases include the explicit composition function; there is no Studio runtime dependency. Local captured files/ZIPs are retained under ignored `.audit-work/phase0/` for inspection.
