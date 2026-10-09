# Block Framework: project map and current product

This document describes the repository after the Block Studio renovation. Historical M0–M4 reports remain in `docs/` as records of earlier milestones.

## Product model

Block Studio builds web applications and native mobile applications from one project graph. It has two canvas levels:

1. **Page flow:** pages are nodes; event ports connect them. The first page is the entry point. Moving a node changes its editor position, not its navigation order.
2. **Page canvas:** block instances are nodes inside a page. Render-order connections describe page composition. Event connections carry behavior and payloads. Moving a block changes its editor position; ordering controls or render-order connections change the finished page.

Beginners can add pages and library blocks, edit content through generated forms, preview their app, and download source. Developers can inspect manifests, edit or import the project JSON, author native block templates through the SDK, and extend either exported codebase.

## Repository architecture

| Package     | Responsibility                                                             | Important entry points                                                             |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `manifest`  | Authoritative JSON schemas, mirrored types, Ajv validation                 | `src/types.ts`, `src/validate.ts`, `src/schema/`                                   |
| `blocks`    | Registry, nineteen built-in blocks, native source templates, authoring SDK | `src/registry.ts`, `src/types.ts`, `src/sdk.ts`, `src/blocks/`                     |
| `wiring`    | Config validation, service requirements, event routing, reachability       | `src/engine.ts`, `src/types.ts`                                                    |
| `compiler`  | Pure compilation to web or Expo source; CLI and audited ZIP export         | `src/compile-web.ts`, `src/web-runtime.ts`, `src/compile.ts`, `src/cli.ts`         |
| `spine`     | Entity definitions to PostgreSQL DDL and typed database contracts          | `src/index.ts`                                                                     |
| `agent`     | Provider-independent edit planning, scope checking, diff, apply, undo      | `src/gateway.ts`, `src/scoping.ts`, `src/planner.ts`, `src/providers.ts`           |
| `builder`   | Local HTTP server, project persistence, visual workspace, profile cascade  | `src/server.ts`, `src/cascade.ts`, `ui/src/Workspace.tsx`, `ui/src/FlowCanvas.tsx` |
| `benchmark` | Mechanical graph/compiler regression tasks and recorded agent/export tasks | `src/tasks.ts`, `src/runner.ts`, `src/cli.ts`                                      |

The root uses npm workspaces and TypeScript project references. The editor uses React, Vite, React Flow, Lucide icons, and RJSF/Ajv schema forms. Native blocks generate React Native TSX strings rather than invoking an AI model.

## Contracts and data flow

The saved builder project contains `version: 1`, `profile`, `touched`, and `graph`. The graph retains `schemaVersion: "0"` for compatibility and has app metadata, screens, block instances, and optional explicit wires.

`screens[].block` remains the required primary block for legacy files. `screens[].blocks`, when present, is the complete ordered composition and must include that primary block. A block instance can appear on only one page; duplication creates a new instance. Page layouts are `stack`, `grid`, and `split`. Both pages and blocks may store `{x, y}` canvas positions.

Block manifests define identifiers, versions, variants, default configuration, a configuration schema, emitted and consumed event ports, provided and required entities, editable AI fields, and locked fields. Configuration is merged with defaults before validation and generation. The palette combines defaults with valid sample content so newly added blocks are immediately usable.

`app.dataId` provides a stable per-app storage namespace. App creation assigns a fresh ID; renaming and project-file imports preserve it. `app.layout: notes` selects the monochrome notes shell. `screens[].navigation: false` hides a page from the app menu without removing its event connections.

The wiring engine resolves each emitted event in this order:

1. An explicit wire supplied by the user.
2. A uniquely matching semantic consumer. Consumers on the emitter's page take precedence over consumers elsewhere.
3. The next page in graph order when no consumer exists.
4. A terminal event when no next page exists.

Explicit wire sources must declare the emitted event. Explicit consumers must belong to the destination page and consume the chosen port. Payload schemas are checked for the supported object-property subset. Multiple equally eligible consumers require an explicit choice and fail validation rather than guessing.

The engine also reports optional service fallbacks, unsatisfied requirements, unreachable main-flow pages, convention-satisfied lifecycle inputs, and unplaced blocks. `tabs` pages are considered reachable through app navigation.

## Compilation and runtime

### Web

`compileWebProject` emits a standalone React/Vite project: package metadata, strict TypeScript configuration, an HTML entry, the runtime, CSS, hydrated project JSON, resolved wires, a main entry, README, and a wiring report. The editor bundles that same runtime through esbuild for `/api/run`; it does not maintain a separate simulated implementation.

The runtime renders ordered blocks, applies responsive page layouts, routes each event by both instance and event name, delivers payloads to consumer inputs, and supports URL-hash navigation plus browser back/forward. Same-page payload updates do not navigate away. Forms, onboarding choices, mock checkout, content selection, detail actions, and local settings toggles work interactively.

The phone preview is the responsive web runtime at phone width. It is explicitly labelled as a responsive preview; it is not an embedded native emulator.

`data.collection`, `data.editor`, and `data.summary` share persistent text records by collection key. The web export includes `data-core.ts` and `data-runtime.tsx`, with localStorage persistence, autosave, search, folders, record lifecycle actions, backups, and Markdown/checklists. Web editor hashes include record IDs so selections survive refresh. Embedded canvas and design previews use temporary stores. The native export conditionally emits the same data core and a React Native runtime with Expo-compatible AsyncStorage. See [the notes reality check](notes-reality-check.md) for the exact feature contract and platform differences.

### Mobile

`compileProject` retains the Expo target and generates React Native block files, screen wrappers, navigation, theme, mock services, dependency pins, and project setup. Composed pages render every block inside a scrollable layout. Local semantic connections use typed React state; cross-page connections use navigation parameters. Purchase and restore events can route to different destinations. Pages in the `tabs` lane have visible native navigation controls.

Optional entity spines still emit a PostgreSQL migration, database types, and Supabase client bootstrap for the mobile target. These files do not automatically implement database-backed block behavior.

Both compiler hashes cover every emitted file except the report containing that hash. ZIP exports audit content and paths and use fixed archive metadata, making repeated exports byte-identical.

## Editor workflow and state

`Workspace.tsx` owns page selection, block selection, platform preview, and dialogs. `FlowCanvas.tsx` implements draggable nodes, port connections, fit/zoom controls, a minimap, preview cards, and separate render-order edges. `Inspector.tsx` handles schema forms, variants, page order, duplication, deletion, and explicit event destinations.

The `useProject` hook serializes writes, preventing rapid gestures from overwriting newer changes. Successful manual edits enter a bounded 50-snapshot undo/redo history. Invalid writes restore the visible saved state and display an error. Refreshing externally changed state clears obsolete manual history. The server validates graph structure and both compiler targets before accepting a project replacement.

The CLI saves the active project to `.builder-cache/project.blockfw.json` by default; `--project` selects another file. The adjacent `.apps.json` catalog stores independent apps and recently deleted apps. Creating a starter adds an app instead of replacing the current graph. The library supports switching, deletion, and restoration, and retains at least one active app. Save/export project JSON and import are available under Developer tools. Canvas changes persist in the same contract as content changes.

App actions and project edits use the same serialized browser queue. Requests carry the active app ID; a stale client cannot save an old graph over another app. Switching apps resets the workspace history and agent gateway, expires pending plans, and preserves each app's saved graph. Catalog files use temporary-file replacement.

## Element customization

`GraphBlock.design.elements` stores portable style overrides. The visual designer enumerates rendered web elements, selects them by click, moves them by pointer drag, and exposes numerical positioning, dimensions, typography, spacing, colors, alignment, opacity, and visibility. Design changes can target one block or matching element IDs across the active app. The preview and exported web app share the same renderer. A TypeScript AST transformation adds corresponding native JSX style overrides, preserves Pressable style callbacks, separates text styles from View styles, and keeps event handlers intact. Main parts share semantic IDs; web-specific decorations and individual repeated rows may differ from native template parts.

The profile cascade derives app branding, copy, and price from six profile fields. Hand-edited paths protect their parents and descendants from later cascade or AI replacement. This fixes the earlier case where editing a products array did not protect a nested derived price.

## Agent behavior

The agent proposes scoped content, variant, and element-design edits, shows a reviewable diff, and applies only accepted operations. Its scope can be one block or the whole app. Previously customized fields are protected by default; an explicit per-request option permits reviewed changes to those fields. It cannot freely alter graph topology, ports, or templates. Local Studio can connect eligible ChatGPT accounts through OAuth and send scoped edits to the public Responses API without an API key. Connections use protected persistent storage, account-specific model discovery, serialized token renewal and sign-out/revocation. See [the connection guide](chatgpt-connection.md). `BLOCKFW_LLM_*` remains an alternative; without a live connection, the default provider uses clearly labelled recorded demo responses and does not provide arbitrary free-form design generation.

Pending plans are bound to a fingerprint of the complete builder project, including positions, profile, and touched fields. Stale plans are rejected. AI undo depth comes from the server, survives closing its dialog, and refuses to overwrite intervening manual changes. An empty plan is a successful no-op. Token counts are reported from provider usage; block-card token counts are character-based estimates.

## HTTP surface

| Endpoint                                                          | Purpose                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `GET/PUT /api/project`                                            | Read or validate and save the project                           |
| `GET/POST /api/apps`                                              | List the app library or create and activate an app              |
| `POST /api/apps/:id/activate`, `/restore`; `DELETE /api/apps/:id` | Switch, restore, or move an app to recently deleted             |
| `PUT /api/profile`, `POST /api/cascade`, `POST /api/touch`        | Profile derivation and protected edit paths                     |
| `GET /api/blocks`, `GET /api/cards`                               | Block schemas, valid starter data, ports, and compact contracts |
| `POST /api/compile?target=web\|mobile`                            | Compile and return file paths, hash, and wiring report          |
| `POST /api/export/zip?target=web\|mobile`                         | Audited source archive                                          |
| `GET /api/run`, `GET /api/run.js`                                 | Interactive application or individual block preview             |
| `GET /api/preview/:id`                                            | Retained static native-to-DOM preview API                       |
| `POST /api/agent/edit`, `/apply`, `/undo`; `GET /usage`           | Scoped AI workflow                                              |

The server binds to loopback by default. It is a local editing service, not a multi-user cloud backend.

## Current limits and next product layers

The visual editor, graph composition, deterministic compilation, source exports, local flows, and durable text-record collections are implemented. The Cloud notes template adds real Supabase identity/storage, saved onboarding, server/database quotas, and manually verified UPI payments for web exports. Its five service blocks are reusable and separate from the older demonstration authentication/checkout blocks. Shared cloud workspaces, deployment orchestration, arbitrary data schemas, merchant payment automation, and general visual business-logic nodes remain integration work. Settings toggles are local component state; link rows require integrations. Web custom blocks need a renderer in the exported runtime; the native SDK registry is not automatically a browser plugin system.

Cloud source lives in `packages/compiler/assets/`: the React service runtime, Node backend, PostgreSQL migration, and styling. `app.cloud` stores only the public backend origin. Provider secrets belong to an ignored server environment. The backend verifies identity through Supabase, keeps encrypted token bundles in protected sessions, serves opaque HttpOnly cookies, and uses authenticated RLS/RPC collection writes. `examples/paper-cloud/graph.json` composes ten pages and twelve explicit event wires. Each independently deployed app needs its own dedicated backend/Supabase project; apps pointing at the same backend deliberately share that backend's accounts, notes, and plans. See [the setup and verification record](paper-cloud-setup.md).

The next substantial product layers are arbitrary data schemas, API and condition/action nodes, cloud application state, reusable components and design tokens, custom web/native renderer registration, backend connectors, and deployment/provider configuration. These should share typed contracts and explain their execution in the same canvas, preserving the beginner workflow and the developer extension path.

## Validation

The regression suite covers graph contracts, legacy compatibility, composition, local payload routing, invalid event ports, distinct native event targets, hashes, repeatable ZIP bytes, protected edits, agent no-ops, and generated native block interactions. Browser tests exercise the actual editor and web runtime: composition/configuration, undo/redo, node movement, connection dragging, authentication/onboarding/checkout flow, payload delivery, browser back, preview devices, toggles, both ZIP targets, invalid imports, and small-screen navigation.

The browser UI has its own strict TypeScript check, now included in the root `typecheck` and editor build. Generated web source is installed and production-built independently. Generated Expo source is installed and typechecked independently. Device/emulator testing and production provider testing remain separate release checks.
