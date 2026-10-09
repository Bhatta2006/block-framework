# Puck in Studio Design: isolated evaluation

Three real v2 components are rendered in an editing surface with the current generated application CSS. This evaluates Puck as a possible Design renderer; it is not integrated into Studio, its output is not canonical app storage, and it does not enable Puck AI/cloud services.

From the repository, build the framework first. In this directory run `npm ci`, `npm run build`, `npm test`, then `npm run dev`. While port 5201 is running, `npm run browser` uses the workspace Playwright installation to verify all three components, selection/config editing, and typed graph-operation proposals in Chromium and Firefox. `predev/prebuild` reads the real compiler's stylesheet into ignored `.generated/`.

The adapter allows existing reference IDs/types and a deliberately small editable text surface. It translates config changes and ordering into the real graph-operations API; its test applies them, round-trips the result and rejects locked-field/type changes. Insertion, duplication and deletion are disabled in this evaluation. A product adapter must derive all fields/permissions from block contracts, handle slots/page identity/wiring, and use the shared operation log rather than Puck history.

Auth is an explicit disabled Design preview; Collection records are transient. Neither claims to prove cloud auth or production storage. The application styling is reused rather than replicated. Puck fields can appear in responsive sidebar/overlay presentations with repeated input IDs; the browser check selects the visible field. This and keyboard/drag behavior require deeper accessibility review before adoption.

The source package is MIT; its isolated lockfile keeps it outside the Studio dependency graph. The build reports a large editor chunk; lazy load it if adopted. Findings are recorded in docs/adr/0002-web-native-ui-stack.md.
