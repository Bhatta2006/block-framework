# Block Studio: canvas experience plan

**Status:** proposed UI and UX specification, October 8, 2026. This document and the accompanying interactive storyboard describe the redesign; they do not change the running editor. Targets below are acceptance goals, not measured results.

**Design reference:** [generated canvas concept](design/canvas-reference.png). [Open the interactive storyboard](design/studio-experience.html) in a browser to explore the proposed screens.

## 1. Product promise

Build a useful web or mobile app by assembling pages, shaping their contents, and connecting what happens next. Understand every change, test the result, and take ownership of the output.

The experience should feel calm, precise, and dependable. A customer pays for working results, understandable controls, recovery when something fails, and freedom to grow beyond a template. The visual polish must support those outcomes.

The signature detail is a spacious black infinite canvas with subtle dots and live-looking page cards. The canvas communicates the app, its contents, and its behavior at three levels:

| Level             | User's question                                         | What appears                                                                   |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| App flow          | Which pages exist, and how do people move between them? | Page previews and named action connections                                     |
| Page canvas       | What belongs on this page, and in what order?           | Block nodes, composition order, and local behavior                             |
| Edit page / block | How should this interface look and behave?              | A rendered page or isolated block, selectable elements, layers, and properties |

App flow and Page canvas are the two primary canvas modes. Editing the rendered page is a contextual workspace reached through **Edit page**, **Customize**, or an element selection. Its breadcrumb always leads back to the originating page and canvas.

Beginners and professionals use the same product. Start with meaningful names and safe defaults; disclose payloads, contracts, generated source, and integration settings when needed. Avoid a separate beginner product that users eventually have to abandon.

## 2. Findings from the current code

This is a source-based review of `Workspace`, `FlowCanvas`, `Inspector`, `DesignEditor`, `AgentView`, `useProject`, the project map, and the notes reality check. It is not a new timed usability study.

| Current behavior                                                                                                                    | Experience consequence                                        | Proposed treatment                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pale green workspace with a persistent navigation sidebar, a second canvas toolbar, library, inspector, and multiple dialogs        | Canvas competes with interface chrome                         | Black board, compact header, one tool rail, contextual panels                         |
| Page and block nodes exist; page thumbnails are built from the primary block                                                        | A composed page may be underrepresented in the overview       | Whole-page thumbnails with cached rendering and clear page names                      |
| Content forms require Apply; appearance can save immediately; design previews require another Apply; text/actions have another Save | Users cannot predict when a change is saved                   | One explicit property-editing contract and one save indicator                         |
| Element customization is a separate modal with numerical fields and a dropdown of element IDs                                       | Hard to see hierarchy or understand alignment and positioning | Full editing workspace with layers, handles, layout controls, and a focused inspector |
| Added buttons support optional actions; automatic event routing can also select destinations                                        | Button intent can be obscured by implicit routing             | Named action rows and visible Auto / Explicit / None states                           |
| AI assistance is a modal with block or whole-app scope and a technical diff                                                         | Context disappears; broad scope is easy to misunderstand      | Contextual AI panel with explicit scope and visual review                             |
| Serialized saves, undo/redo, independent apps, delete/restore, validation, source exports already exist                             | Strong foundation for a dependable editor                     | Preserve these contracts and expose their state consistently                          |
| Local notes work; authentication/payment blocks are demos; source export works; hosted deployment is absent                         | A Publish-looking control could promise too much              | Export now; provider readiness and deployment only as capabilities arrive             |

No telemetry or customer research has established conversion, retention, or willingness to pay. The first research exercise should be five observed first-use sessions with the notes template, followed by professional users extending the same app.

## 3. Information architecture and shell

### App library

Opening Studio returns an existing customer to the last app and viewport. A first-time user sees a restrained app library with **Create app**, **Open example**, and **Import project**. Creation offers Blank, Notes, and available working starters with honest capability labels. AI appears as an optional way to edit supported content, not a promise to generate an entire working topology.

Each app row shows name, thumbnail, saved timestamp, and storage location. Local apps say **On this computer**. Actions: open, rename, duplicate once supported, export project, and move to Recently deleted. Deletion explains where the app goes; restore remains easy to find. Import validates before replacement and offers creation as an independent app. Existing data namespaces must survive rename and migration; a new independent copy receives a new namespace.

The editor's project dropdown switches apps and opens the library. Switching awaits saved edits; a failed save offers Retry, Keep editing, or deliberately discard the unsaved draft. Never silently switch away from an uncommitted draft.

### Editor shell

Desktop header, approximately 56 px: Block Studio mark, app dropdown, contextual mode switch, save status, Undo / Redo, Preview, and Export. Keep the primary task visible. Remove promotional sentences from the repeated-use workspace.

Left tool rail, approximately 56 px: Select, Pan, Add, Pages / Layers, and AI. Tooltips include names and available shortcuts. Expanded drawers are 256–288 px; the right inspector is 320–360 px. At 1440 × 900, the canvas should occupy at least 70% of the editor's content width with panels closed. This is a design target, not a current measurement.

Top-left canvas breadcrumb: **Paper / App flow** or **Paper / All notes / Page canvas**. Bottom-center controls: Fit, zoom, and view options. Bottom-right minimap is optional and remembers its visibility. An Issues button shows actionable errors and warnings, not an unexplained red count.

Only one main left drawer and one right work panel occupy the canvas at a time. AI can replace the inspector while retaining the current selection; review can temporarily expand. Reserve modals for creation, irreversible deletion, import review, and essential confirmations. Settings and frequent editing remain navigable workspaces.

## 4. Visual system

| Token              | Proposed value / rule                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Canvas             | `#08090B`, matte and flat                                                                             |
| Rail / header      | `#0E1013`                                                                                             |
| Panel / node       | `#15181D`                                                                                             |
| Elevated / hovered | `#1D2229`                                                                                             |
| Decorative border  | `#303640`; interactive boundaries must meet applicable contrast requirements                          |
| Primary text       | `#F4F5F7`                                                                                             |
| Secondary text     | `#ADB5C0`, subject to contrast verification                                                           |
| Accent             | `#8BBEFF` for focus, selection, and highlighted connections                                           |
| Grid               | Tiny, low-opacity neutral dots at a base 24 px spacing; adapt density to zoom                         |
| Type               | Existing sans-serif stack initially; self-host the chosen family before release, with system fallback |
| Sizes              | 12 px metadata, 14 px controls, 16 px section headings, 20–24 px workspace titles                     |
| Spacing            | 4 / 8 / 12 / 16 / 24 / 32 px                                                                          |
| Corners            | 8 px controls, 12–14 px nodes and panels                                                              |
| Primary button     | Near-white fill with dark text; one clear primary action per work panel                               |
| State colors       | Small success, warning, and error treatments paired with text and icons                               |

Treat Studio chrome and the customer's app theme as separate systems. A dark editor can contain white, dark, or branded app previews. Do not recolor exported apps just because the editor becomes dark. Theme editing offers usable presets plus tokens for type, color, spacing, and radius; cross-block shared tokens require a new persisted contract.

Controls have defined default, hover, focus, pressed, selected, disabled, loading, success, and error states. Disabled actions explain the missing requirement through nearby text or an accessible description. Icons supplement familiar actions; tooltips supply names. Decorative dots do not substitute for readable boundaries.

Motion is brief and functional: selection and panels about 120–180 ms, viewport transitions about 180–240 ms. Respect reduced motion. No continuous wire animation, neon glow, glass effects that reduce contrast, or elaborate loading theatrics.

## 5. App flow and connection behavior

Page nodes have a compact header, page preview, start marker where relevant, named action ports, and an overflow menu. Preview cards represent the full page. Single click selects; double click opens its Page canvas; **Edit page** opens the rendered editing workspace. Clicking inside a canvas thumbnail selects the card rather than unexpectedly submitting a form.

Use semantic zoom: far out shows titles and connection structure; medium shows compact previews; close shows detailed ports. Maintain keyboard access through a synchronized page and connection list. Search locates a page, focuses its card, and preserves a return path.

Connections distinguish three concepts without relying on color alone:

| Connection                | Display                                 | Editing rule                                              |
| ------------------------- | --------------------------------------- | --------------------------------------------------------- |
| Navigation / action       | Solid curve, action label               | User-owned explicit destination                           |
| Suggested automatic route | Dashed curve with Auto label            | Inspect destination, accept it, replace it, or disable it |
| Page composition          | A separate Layout view / numbered order | Does not compete visually with behavior wires             |

Drag a source port to a compatible destination. Highlight valid targets; explain incompatible targets before commit. Dropping on empty space offers **Connect to page**, and eventually **Create destination page**. A provisional wire cancels with Escape. User-authored connections remain saved and undoable.

Selecting a wire exposes its source, action, destination, route mode, and **Cut connection**. Delete also cuts the selected wire outside text inputs. Cutting means **No action / No connection** for that event: persist a suppression so the automatic engine does not recreate it. Offer **Restore automatic route** separately. Validate both targets before accepting a reconnection.

New custom buttons start with **No action**. Template buttons retain the template's visible, inspectable behavior. New independent blocks may show automatic suggestions, but unrelated destinations must not be silently committed. This changes today's next-page fallback experience and requires a compatibility policy: preserve existing apps' behavior, label inherited automatic routes, and opt new apps into the explicit suggestion contract. Write migration tests before changing the runtime.

Example: **New note** opens the editor with an empty record ID; **Open note** opens it with the selected record; **Favorites** opens its own page. Show separate action ports even if two actions reach the same page. A user can inspect the passed record rather than guessing why the editor opened.

## 6. Page composition and element customization

Page canvas retains block nodes for reusable behavior and data flow. The Layout panel shows the finished page's ordered block list. Dragging nodes rearranges the workspace; dragging the ordered list changes app layout. The UI names these separately and includes an actual rendered page preview. Avoid implying that arbitrary graph coordinates are final responsive CSS coordinates.

The Add drawer has two clearly separated destinations:

- **Blocks:** available functional units such as notes collection, editor, summary, authentication demo, and action button; searchable by outcome and category.
- **Elements:** controls inside the selected block. Initially Button, Text, and Divider, matching today's renderer support. Image, Input, Icon, Container, and other elements appear after their schema and web/native renderers work.

Every library entry shows a preview, supported targets, data needs, and whether a service is real, local, or a demo. Adding by click inserts at the selected location; drag supports intentional placement. Allow keyboard insertion through search. Keep starters valid immediately.

The editing workspace contains a rendered page or focused block, a layer tree with friendly element names, and a right inspector with **Content**, **Layout**, **Style**, and **Actions** tabs. Selecting a rendered element synchronizes its tree entry and inspector. Existing semantic element IDs remain the bridge to persistence and AI; never infer behavior only from a text label or DOM index.

Layout controls must state their effect:

| Control              | Meaning                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| Align text           | Changes text alignment inside the selected element                                |
| Align item           | Positions the element within its parent layout                                    |
| Align contents       | Arranges children inside a container                                              |
| Width / height       | Fixed, hug content, or fill where supported; show units and bounds                |
| Spacing              | Separate padding, gap, and margin with linked-side controls                       |
| Offset               | Adjusts current element visually; does not promise arbitrary reparenting          |
| Advanced positioning | Free placement only once a persisted layout model and cross-target behavior exist |

When a control does not apply, explain the applicable parent or offer to select it. Editing a number or alignment icon changes the rendered result immediately, and saved/reloaded/exported results must agree. Clamp or reject invalid values with a specific message. Group a drag into one history operation; do not save every pointer movement.

Use **This element**, **This block**, and **Matching elements across app** as explicit scopes. A global edit lists matches and offers exclusion/review. If matching IDs are ambiguous or target support differs, show that before applying. Native limitations appear at the relevant field and export readiness report.

Responsive preview has named desktop, tablet, and phone widths. Preview widths do not imply independently persisted breakpoint overrides. Until those exist, edit one shared style and show overflow warnings. Breakpoint-specific styles, layout containers, reusable components, and design tokens are later schema work.

## 7. Properties, saving, and history

Adopt one rule for routine properties: edit locally for immediate preview, validate on commit, persist through the serialized project queue, then show **Saved**. A text field commits on blur / Enter; a valid select or toggle commits immediately; a drag commits on release. Debounced typing can be added without losing the final change. Escape restores an uncommitted field. Compound structures such as bulk import or a complex JSON edit use an explicit Review / Apply transaction.

Save state distinguishes **Unsaved edits**, **Saving**, **Saved on this computer**, and **Save failed**. Pending draft edits cannot look saved simply because no request is in flight. Invalid input stays visible for correction and does not replace the last valid project. A transport failure retains the proposed change for retry while clearly identifying the last saved state.

Changes that overwrite multiple blocks or alter behavior show a review. Broad destructive actions have a concrete summary. Cancel preserves the saved project. Undo/redo describe the next operation, preserve selection where possible, and explain conflict limits. The current manual history and AI undo cannot be marketed as one unlimited timeline until they share a tested transaction model.

Every interactive control has an owner, visible outcome, failure message, and test scenario. Audit the entire current control inventory, including variants, alignments, numerical styles, Apply, Validate, actions, cut wires, import/export, app create/delete/restore, AI, and settings.

## 8. Button actions and execution clarity

Actions tab uses plain language: **When this button is clicked → Go to page → Favorites**. Supported first-release choices are No action, Original block behavior, Go to page, Go back, Open URL, and Show message. Each button has an independent action. Do not assign behavior because a button happens to say Save or Continue.

Data-backed template behaviors remain visible and may carry typed payloads. Later action chains can add data mutations, API requests, conditions, and branching, but require real execution contracts, error states, and web/native support. Present unavailable integrations as explanatory library items only where useful; they cannot be executable controls.

Provide **Test action** from a disposable preview session. Trace source control, event, destination, and data. No-action controls report that state in the builder's test panel. Testing must not unexpectedly modify the customer's working notes or real remote data.

## 9. AI assistance

AI opens beside the current work. An explicit scope chip shows **This block** or **Whole app** for currently supported operations. Selected element scope can be conveyed as a constrained target using the existing design edit surface; page and multi-selection scope require gateway changes. Do not display unsupported scope as functional.

Suggested requests reflect supported edits: tighten spacing, center a specific button, rewrite copy, or apply an available style consistently. Before sending, show the selected provider and scope. User-customized fields stay protected unless the user deliberately includes them.

Flow: request → generating proposal → visual before/after plus plain-language change list → Apply changes / Discard → saved result with Undo. Show no-op as **Already matches your request**. Keep errors actionable and retain the prompt for retry. App/provider changes invalidate stale proposals with a clear explanation.

Initially review and apply a whole validated plan. Per-change accept/reject, selective application, page scope, and AI-created graph topology are later agent contract work. Technical paths remain available under **Details**, while normal review reads **Note editor / Save button / alignment**.

Connection settings belong in Settings → AI connections, with a compact provider summary in the panel. Keep existing local ChatGPT OAuth eligibility and usage messaging. The storyboard does not authorize a hosted ChatGPT integration, imply unlimited inference, or invent a remaining-token balance. Provider counts use actual returned usage; estimates are explicitly labelled. Recorded demo mode has persistent identification.

## 10. Preview, issues, and delivery

Preview opens a dedicated workspace with device width, page picker, Start over, Open in new tab, and optional action trace. Preserve the editing context when returning. Maintain separate **Preview data** and **App data** modes; default testing uses an isolated store and explains the choice. Existing live notes preview uses persistent local data today, so isolation needs runtime changes rather than a cosmetic label.

Issues are grouped into blockers, warnings, and information, each with affected page/block and a **Go to issue** action. Report unsatisfied services, unreachable pages, ambiguous routes, invalid configs, unsupported platform styles, and missing destinations. A compile pass establishes structural readiness, not successful real-provider integration or app-store approval.

Delivery starts with **Export**. Select Web source or Mobile source, inspect readiness, download, then show concise setup steps and generated README. Identify demo auth/payment and local data clearly. Phone preview is responsive web, while mobile export is Expo source. Native verification remains a separate check.

Once deployment providers are actually implemented, introduce Publish with prerequisites, environment configuration, secure secrets handling, deployment logs, success URL, version, and rollback. Mobile publication needs its own signing and store submission workflow. Never reuse a web Publish confirmation for an unbuilt mobile binary.

## 11. Settings and the paid customer experience

Settings groups: App details, Theme, AI connections, Integrations, Storage & backups, and Advanced. Display service connection health and a meaningful test result. Saving secret configuration requires server-side protected storage; credentials must not enter project JSON, thumbnails, URLs, or exports.

Commercial account settings eventually include plan entitlements, invoices, renewal/cancellation, workspace members, and support. These require identity, authorization, billing, and persistent cloud workspaces. They are a distinct implementation track; the current local editor remains clear about local storage.

A paid launch needs discoverable help at the point of confusion, restorable backups, clear limits before spending, preserved work on failure, and a support path with an optional redacted diagnostic bundle. Customer content, tokens, and notes are excluded by default. Do not introduce fake collaboration avatars, cloud-saved indicators, billing balances, or disabled upgrade buttons as decoration.

## 12. Accessibility, responsiveness, and performance

- Keyboard parity: page/layer lists, selecting nodes, editing properties, connecting through an action form, and cutting via a connection list. Graph dragging cannot be the only path.
- Target WCAG 2.2 AA: verify text/UI contrast, visible focus, labelled inputs, non-color status, announced save/errors, and complete dialog focus behavior. Standard pointer controls meet the applicable 24 px minimum target requirements; touch layouts use at least 44 px controls.
- Shortcuts work outside editable fields: Space pan, Escape cancel/back one level, Delete selected node/wire, Cmd/Ctrl+Z undo, redo platform equivalent, and discoverable command search. Decide reserved-key conflicts before shipping.
- At 1280+ px support two contextual panels; at 900–1279 px favor one panel; below 900 px use single drawers/sheets. Small screens prioritize app library, preview, properties, and basic edits, with an accessible list alternative to the graph. Full spatial composition remains best on larger screens.
- Use cached page thumbnails, refresh only changed pages, suspend expensive previews offscreen, and lazy-load rendered element editing. Selection and port overlays must not trigger a whole-app compile.
- Performance targets on a documented reference machine with a 50-page / 200-block fixture: selection feedback under 100 ms, warm workspace usable under 2 seconds, smooth viewport motion, and saved-state feedback within 1 second after a completed local write. Benchmark current behavior before optimizing; define thumbnail and memory budgets from that baseline.

## 13. Delivery sequence and implementation map

| Phase                   | Concrete work                                                                                                     | Main code / prerequisite                                                           | Exit criterion                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1: Shell and language   | Tokens, black dots, header/rail, app picker, mode names, contextual drawers, node visual states                   | `workspace.css`, `Workspace.tsx`, `FlowCanvas.tsx`; React Flow and Lucide retained | Existing apps open unchanged; all current actions still work; visual/accessibility review                |
| 2: Editing clarity      | Inspector tabs, layers, in-context editing, alignment semantics, grouped drags, consistent saving/drafts          | `Inspector.tsx`, `DesignEditor.tsx`, `useProject.ts`, runtime element bridge       | Select → edit → save → reload → export agrees on supported web/native fields                             |
| 3: Behavior and preview | Named routes, compatible targets, cut/suppression, Issues workspace, isolated preview data, whole-page thumbnails | Wiring engine, manifest, web/native runtimes, preview API and cache                | Paper's distinct button routes pass; cutting stays cut after reload; user data unchanged by tests        |
| 4: AI and delivery      | Contextual AI, readable review, connections settings, export readiness and setup                                  | `AgentView.tsx`, `ChatGPTSettings.tsx`, gateway/server, compiler reports           | Real supported scopes accurately represented; stale/error/no-op paths work; both source targets verified |
| 5: Extensibility        | Containers, additional elements, shared tokens, responsive overrides, reusable components, action chains          | New versioned schemas and both target renderers                                    | New contracts migrate safely and compile consistently                                                    |
| 6: Commercial hosting   | Identity, per-user apps/credentials, access control, cloud persistence, billing, deployment, support              | New backend and infrastructure; approved hosted OAuth integration where required   | Cross-user isolation, recovery, billing lifecycle, provider deployment and security validation           |

Phases 1–4 produce the redesigned local Studio. Phase 5 grows the builder's expressiveness. Phase 6 makes a hosted paid product operable. Visual improvements can begin immediately; commercial promises wait for their services. Phase durations should be estimated after each phase's contract and migration scope is agreed, not inferred from this storyboard.

Refactor the large Workspace progressively into `EditorShell`, `AppLibrary`, `CanvasToolbar`, `LibraryDrawer`, `SelectionInspector`, `PreviewWorkspace`, `IssuesPanel`, and `ExportWorkspace`. Keep one authoritative project state, serialized writes, stable IDs, protected edits, and existing graph compatibility. Add ephemeral selection/tool/viewport state separately; persist per-app view preferences without contaminating generated app behavior.

## 14. Acceptance scenarios and launch gates

| Scenario             | Evidence required                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| First useful result  | In observed sessions, a new user creates the notes app and saves a note without help; initial target within 5 minutes                          |
| Revisit work         | Rename/switch/reload/restore retain app identity, saved configuration, and data                                                                |
| Understand a variant | Sign-in → sign-up updates appearance and saved behavior; protected custom copy remains understandable                                          |
| Customize correctly  | Add two buttons; change spacing, size, text and item alignment; save/reload; compare web and native supported output                           |
| Wire intentionally   | Two buttons route to different pages; one can have No action; cut routes remain disabled; undo restores only intended behavior                 |
| Survive failure      | Failed saves, invalid fields, cancelled drag, stale AI plan, denied login, disconnected provider, and failed export preserve recoverable state |
| Test safely          | Preview creation/deletion and reset leave working app records unchanged                                                                        |
| Own the output       | Downloaded web app builds and runs independently; Expo source typechecks and undergoes appropriate device testing                              |
| Operate at scale     | Reference large graph remains usable; keyboard/list navigation and zoom work without unreadable interactive targets                            |
| Charge honestly      | All advertised capabilities work; demos are labelled; hosted account/billing/deployment gates pass before a hosted paid launch                 |

Use the existing unit and browser suites as regression protection, then add focused scenarios for the changed contracts. Keep screenshot checks at representative desktop, tablet, and phone widths. Test focus and screen-reader flows manually as well as automated checks.

Track time to first preview, first useful saved action, unresolved route frequency, save failures, recovery completion, export success, and repeat app editing. Measure AI acceptance and successful application separately from requests. Any telemetry should be opt-in for the local product and exclude user content. These are proposed metrics, not current project analytics.

## 15. Storyboard and design references

The interactive storyboard includes App flow, Page canvas, Customize, AI review, App library, Export, and Preview. It demonstrates layout and navigation with static sample data; its controls do not alter real apps or perform AI inference, saving, compiling, or deployment. Full editor behavior is governed by the specification above. The Notes database card visualizes the existing shared local notes store; general standalone data/service nodes require new graph and execution contracts.

The original image supplies the visual direction. The following references supply workflow inspiration rather than a feature parity claim:

- [Higgsfield Canvas](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas): connected work on an infinite board.
- [ElevenLabs Flows](https://elevenlabs.io/flows): visible node-based production logic.
- [Invideo Editor](https://help.invideo.io/en/articles/16920168-how-to-get-started-with-invideo-editor): a focused creative workspace.

The redesign should preserve Block Studio's own purpose: building working apps for web and mobile, with a clear path from a simple template to an inspectable, extensible project.
