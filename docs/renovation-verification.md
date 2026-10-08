# Block Studio renovation verification

Verified on Windows with Node 24.21.0 and npm 11.19.0.

## ChatGPT connection — 2026-10-08

- Studio production build, strict source/UI/test typechecks, and lint pass.
- All 187 unit tests pass in 18 files, including 13 connection and four encrypted-storage regressions.
- All 30 Firefox browser workflows pass, including ChatGPT sign-in controls, model selection, usage confirmation, sign-out, cancellation and storage-error feedback.
- A temporary Windows Credential Manager entry passed write/read/delete verification. Encryption tests cover persistence, ciphertext tampering, lost keys and competing runtimes.
- OAuth and inference tests use generated signed identities and mocked OpenAI transport. No user credentials or paid model calls were used. Actual account authorization and inference remain a user-completed live check.
- ChatGPT endpoints and local AI actions enforce host/origin checks, JSON requests and no-store responses. OAuth callbacks use state/nonce/PKCE validation and a restrictive CSP.
- Dependency audit reports three pre-existing development-tool findings (esbuild, Rollup and Vite); the newly added jose/keyring dependencies are not listed as vulnerable. This is a local runtime integration, not a remote production deployment.

See [ChatGPT connection setup and security](chatgpt-connection.md).

## Notes app reality check — 2026-10-08

| Check                                                    | Result                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Studio production build, lint, strict root/UI typechecks | Passed                                                                                         |
| Vitest regression suite                                  | 170 tests passed in 16 files                                                                   |
| Firefox browser checks                                   | All 28 passed in the final full run                                                            |
| SDK validation                                           | All 14 registered blocks passed                                                                |
| Standalone Paper web export                              | Strict TypeScript and Vite production build passed                                             |
| Standalone Paper mobile export                           | Installed and strict TypeScript check passed                                                   |
| Android Metro/Hermes export                              | Passed, 841 modules bundled                                                                    |
| Web and mobile source ZIP audits                         | Passed                                                                                         |
| Manual in-app browser check                              | Created Paper through Studio; note content, metadata, and selected editor URL survived refresh |

The final full Vitest and browser runs are green. Testing reproduced a Windows `EPERM` during atomic catalog-file replacement. Catalog saves now retry transient file locks for a bounded interval and roll back in-memory app changes on failure; regression tests cover retry limits, permanent failures, and rollback. The corrected browser assertion compares the saved graph against the server's normalized baseline, including its stable data ID, so invalid edits still have to leave every saved field unchanged.

Notes coverage adds real record persistence, Markdown/checklist editing, search/filtering, folders, favorites, pinning, archive/trash/restore/delete, backup merging and rejection, storage errors and corruption recovery, app isolation, temporary previews, asynchronous field discovery and live customization, hidden navigation pages, responsive layout, deep links, same-page collection/editor composition, and feedback for disconnected actions. See [the detailed reality check](notes-reality-check.md).

Physical-device/emulator interaction testing and signed native binaries were not performed. Chromium's browser executable remains unavailable; browser automation uses Firefox and manual inspection uses the in-app browser. Offline benchmarks below are the earlier renovation baseline and were not rerun for this feature addition.

## Previous renovation baseline

| Check                                             | Result                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| Workspace and editor production builds            | Passed                                                 |
| Root lint                                         | Passed                                                 |
| Root typecheck, including strict browser UI check | Passed                                                 |
| Vitest regression suite                           | 155 tests passed in 15 files                           |
| Firefox browser suite                             | 19 tests passed                                        |
| SDK validation                                    | All 11 registered blocks passed                        |
| Offline benchmark                                 | 36 mechanical and 8 recorded-agent/export tasks passed |
| Formatting of changed/new source files            | Passed                                                 |
| Standalone generated web project                  | Installed, strict typechecked, and production-built    |
| Generated Expo project                            | Installed and typechecked                              |
| Generated Android bundle                          | Metro/Hermes export passed, 844 modules bundled        |

The standalone web and native checks used a graph containing every registered block type, a composed home page, and a composed destination receiving instance-addressed payloads. Browser checks run against the real built editor and the shared generated web runtime.

Browser coverage includes page flow and live previews, composition/configuration, undo/redo, dragging nodes, dragging event connections, sign-in/onboarding/demo checkout, selected-item navigation, browser back, same-page semantic payloads, phone-width preview, settings toggles, both ZIP downloads, rejection of invalid project edits, small-screen navigation, and beginner starter-app creation.

Follow-up coverage includes independent app creation/switching/deletion/restoration, persisted sign-in/sign-up variants and route/layout dropdowns, content-validation feedback, successful developer JSON application, profile cascade, element offsets and drag placement, common styles across blocks, resetting elements, and selected-block versus whole-app AI scope. App-library persistence and stale-app write rejection have regression tests. Generated web/native checks include custom typography, colors, dimensions, and placement, including native Pressable style callbacks. AI design tests use controlled recorded responses; no live provider was configured for this verification.

Additional regression coverage includes duplicate placement rejection, invalid event sources, same-page consumer precedence, native screen name collisions, separate purchase/restore destinations, repeatable ZIP bytes, edited-parent/child protection, no-op agent plans, stale AI plans, persistent AI undo depth, and protection of newer manual edits.

The element-library follow-up verifies actual rendered center/right alignment, live dimensions/font/opacity/text alignment, hide/reset behavior, saved offsets and drag placement without iframe reloads, independently routed buttons inside one block, default no-action buttons, placement before existing content, text/divider insertion and removal, built-in button overrides, message/link/back actions, persistent automatic/manual wire cuts, Delete-key cuts, undo, and reconnecting layout guides. Generated web/native projects containing all eleven block types also include inserted buttons/text/dividers and optional per-button navigation/message actions. The Android export bundles those additions successfully. Chromium's Playwright executable was unavailable on this host; browser regression evidence is from Firefox and manual inspection in the in-app browser.

Screenshots are saved under `.builder-cache/proof/`. Historical M0–M4 reports describe earlier versions; the current architecture is documented in [project-map.md](project-map.md).

Not exercised in this renovation: a physical device/emulator session, signed APK/IPA production builds, live AI-provider requests, or production authentication, billing, and database services. The phone preview is responsive web rendering. Authentication and purchases remain clearly labelled local demonstrations.
