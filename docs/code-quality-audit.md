# Code quality audit — 9 October 2026

The cleanup removes duplicated contracts, unused code, and cloud-only payloads from local web exports. It also repairs export error handling and makes server tests independent of the developer's AI settings. No dependencies were added.

## Findings and changes

| Finding                                                                                                                        | Change                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every web export included cloud account/payment components, cloud CSS, and QR dependencies.                                    | Generate cloud imports, renderers, boundaries, assets, and dependencies only for cloud graphs. Keep the full public `WEB_RUNTIME` for existing consumers. |
| The browser duplicated project, wiring, ChatGPT, port, and block-card types. Some copies had drifted from the server contract. | Reuse the authoritative types through type-only imports. The browser now respects optional block config and the actual wire origins.                      |
| Profile questions existed independently in the server and browser.                                                             | Reuse `PROFILE_QUESTIONS` and `BuilderProfile` in the wizard.                                                                                             |
| UI helpers for touching paths and generating legacy preview URLs had no callers.                                               | Remove the unused helpers; the server endpoints remain available.                                                                                         |
| AI scope validation repeated the same touched-field check. Its unknown-type guard came after a throwing registry lookup.       | Keep one protection check and reject unknown types before lookup. Add a regression test.                                                                  |
| Agent undo entries wrapped snapshots with an unused label; cloning used a JSON round trip.                                     | Store snapshots directly and use `structuredClone` in the gateway and initial builder project.                                                            |
| Planner and native compiler contained unreachable fallback branches around registry lookups.                                   | Remove the branches and keep failures visible.                                                                                                            |
| The SDK renderer context accepted a manifest argument that it never used.                                                      | Remove the argument and update all callers.                                                                                                               |
| ZIP output errors had no stream listener, and finalization's promise was ignored.                                              | Propagate write/finalization errors, correct the local archive declaration, and test an invalid output destination.                                       |
| ESLint excluded every `.mjs` file, including the exported cloud backend.                                                       | Include `.mjs` files with their Node globals and document the intentional best-effort provider logout catch.                                              |
| Server API tests inherited provider environment settings and real credential storage.                                          | Use the recorded provider, an empty injected vault, and a network-rejecting ChatGPT fixture. The three baseline failures are resolved.                    |
| TypeScript did not enforce unused locals or parameters.                                                                        | Enable both checks for package code, unit tests, and the Studio UI.                                                                                       |

## Export measurements

Measurements use the same esbuild settings before and after the cleanup, with minification and production React. Bytes are uncompressed. Generated source totals include every emitted file.

| Example     | JS before | JS after | Reduction | Source before | Source after |
| ----------- | --------: | -------: | --------: | ------------: | -----------: |
| Studio      |   308,089 |  264,829 |     14.0% |       134,827 |       98,927 |
| Local Paper |   308,026 |  264,766 |     14.0% |       132,308 |       96,408 |
| Paper Cloud |   309,792 |  309,792 |      0.0% |       187,014 |      187,120 |

Local exports contain 13 files instead of 14 and omit `qrcode` and `@types/qrcode`. Paper Cloud retains its 20-file export and existing cloud functionality. Its small source increase comes from comments and template formatting.

## Verification

- 206 unit/render tests passed across 19 test files, including repeatable ZIP checks and the new regressions.
- All 34 browser tests passed in Firefox and all 34 passed in Chromium. These exercise notes, app isolation, graph editing, profile cascade, designs, actions, preview, exports, and cloud UI fixtures.
- Phase 0 baseline preparation exposed two browser-test races: the shared catalog retained the same app name across browsers, and an iframe evaluation could run during navigation. Browser-specific app names and a retrying locator assertion retain the original behavior checks.
- Root TypeScript checks, unused-code checks, Studio production build, ESLint, changed-file formatting, and Git whitespace checks passed.
- All 19 registered blocks passed SDK validation.
- Fresh local Paper and Paper Cloud exports installed independently and passed TypeScript and Vite production builds. The exported cloud server passed its syntax check.
- Root and both fresh exported applications reported zero known dependency vulnerabilities at audit time.

## Limits and retained architecture

Large workspace and renderer files remain maintainability hotspots. Their existing behavior is covered by regression tests; this audit avoided speculative file splitting and dependency replacement. The data runtime and general block renderers remain shared within each export target.

Live OAuth/email delivery, actual bank payments, public deployment, and native device interactions were not re-tested. Cloud backend tests use controlled upstream services; browser cloud tests use service fixtures. Public release dependencies remain documented in [Paper Cloud setup](paper-cloud-setup.md).
