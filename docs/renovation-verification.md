# Block Studio renovation verification

Verified on Windows with Node 24.21.0 and npm 11.19.0.

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
