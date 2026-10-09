# Block Studio: UI/UX Design Specification

**Goal:** when someone pays for Block Studio, it should look premium within the first five seconds, feel calm and fast within five minutes, and still be pleasant after five hours.
**Scope:** the Studio editor itself (not the apps it generates).
**Relationship to existing docs:** supersedes the visual direction in `docs/studio-experience-plan.md` where they conflict; keeps its good ideas (dark canvas, layers/inspector, contextual AI panel, save contract, publish readiness).
**Companion:** `docs/plan.md` (product and architecture upgrade plan).

---

## Contents

1. [Design principles](#1-design-principles)
2. [Reference products and what we take from each](#2-reference-products-and-what-we-take-from-each)
3. [Information architecture: six modes, one canvas](#3-information-architecture-six-modes-one-canvas)
4. [Screen layout](#4-screen-layout)
5. [The canvas](#5-the-canvas)
6. [Node design system](#6-node-design-system)
7. [Ports and edges](#7-ports-and-edges)
8. [Mode-by-mode UX](#8-mode-by-mode-ux)
9. [The AI composer](#9-the-ai-composer)
10. [Inspector](#10-inspector)
11. [Palette, quick-add, and command palette](#11-palette-quick-add-and-command-palette)
12. [Preview and device frames](#12-preview-and-device-frames)
13. [Onboarding and empty states](#13-onboarding-and-empty-states)
14. [Collaboration UX](#14-collaboration-ux)
15. [Feedback, errors, and system status](#15-feedback-errors-and-system-status)
16. [Visual design system (tokens)](#16-visual-design-system-tokens)
17. [Motion](#17-motion)
18. [Keyboard and power-user UX](#18-keyboard-and-power-user-ux)
19. [Accessibility](#19-accessibility)
20. [Performance budgets](#20-performance-budgets)
21. [Responsive behavior](#21-responsive-behavior)
22. [Implementation stack (reuse before build)](#22-implementation-stack-reuse-before-build)
23. [Rollout plan and acceptance criteria](#23-rollout-plan-and-acceptance-criteria)

---

## 1. Design principles

1. **The canvas is the product.** Chrome (panels, toolbars) recedes; content and nodes carry the color. Panels are dim, translucent, and collapsible.
2. **One idea per surface.** Each mode (Flow, Design, Data, Logic, Agents, Ship) has its own canvas focus, but shares the same layout, gestures, and shortcuts, so learning one teaches all.
3. **Show the app, not the abstraction.** Page nodes show live thumbnails; data nodes show sample rows; flow nodes show last-run values. Non-technical founders understand pictures before boxes.
4. **Progressive disclosure.** Beginners see "Pages, Content, Style, Publish". Advanced controls (bindings, expressions, policies, code) appear when asked for or when the user switches to "Pro" density.
5. **Every action is reversible and visible.** Undo everything; AI changes appear as ghost previews before they land; history is browsable.
6. **Never a dead end.** Every error says what happened, why, and offers a fix (often one click or "Ask AI to fix").
7. **Calm speed.** 60 fps canvas, instant feedback (<100 ms) on direct manipulation, skeletons rather than spinners, no layout jumps.
8. **Cost transparency.** Building, editing, and wiring are free and say so. Anything that spends AI credits or money shows the estimate before it runs.

---

## 2. Reference products and what we take from each

| Product | What to borrow | What to avoid |
| --- | --- | --- |
| **Higgsfield Canvas** | Infinite board where any input becomes a node; chaining nodes into a re-runnable pipeline; live multiplayer via a shared link; free graph-building with cost only at generation time; big visual node previews (media fills the node) | Media-first density doesn't fit logic nodes; keep their visual richness for page/design nodes only |
| **ComfyUI** | Typed, color-coded ports; reroute points; groups; node bypass/mute; queue/run status per node | Visual noise, tiny text, wire spaghetti; beginners get lost |
| **n8n** | Clean node cards with icon + title + subtitle; execution data shown on nodes after a run; side panel with input / parameters / output columns; "+" on edge ends | Heavy modal panels that hide the canvas |
| **Figma / Figma Weave (Weavy)** | Multiplayer cursors, comments pinned to canvas, frames/sections, properties panel discipline, zoom feel | Tool overload for non-designers |
| **Framer / Webflow** | Direct manipulation of live UI, breakpoints bar, layers tree, style panel with sensible groups | Exposing CSS concepts to non-technical users |
| **Linear** | Typography, restraint, keyboard-first, command palette, fast transitions, subtle borders | – |
| **Langflow / Flowise / Rivet** | AI-agent graphs: model → tools → memory layout; inline test chat; trace inspection | Cluttered settings forms |
| **Unreal Blueprints** | Execution-flow vs data-flow wire distinction; collapsing subgraphs into functions | Steep learning curve |
| **Retool / Supabase Studio** | Data table editor, schema visualizer, SQL-optional | Dense enterprise look |
| **tldraw / Excalidraw** | Snappy canvas interactions, selection feel, minimal toolbar | – |

---

## 3. Information architecture: six modes, one canvas

A segmented mode switcher sits at the top center. Each mode is a *lens* on the same app graph.

| Mode | Canvas shows | Primary user | Key verbs |
| --- | --- | --- | --- |
| **Flow** | Pages as large thumbnail nodes, navigation and event edges | Everyone | Add page, connect, reorder, preview |
| **Design** | One page (or a component) at real size with device frame; layers tree | Founders, designers | Select, drag, style, insert block |
| **Data** | Entities as table cards, relations as edges, sample rows | Technical founders | Add entity/field, relate, set permissions |
| **Logic** | Flows: trigger → steps, with run traces | Technical founders | Add trigger/step, branch, test run |
| **Agents** | Agent nodes connected to models, tools, knowledge, memory | Anyone building AI features | Add agent, attach tools/knowledge, chat-test |
| **Ship** | Checklist + environments + deploy timeline (not a node canvas) | Everyone | Connect provider, fix issues, deploy, export |

Mode switching keeps the selection context when possible (selecting a block in Design and switching to Data highlights the entity it's bound to).

**Beginner vs Pro density:** a toggle in the user menu. Beginner hides Logic and Data modes behind "Advanced" until the app needs them (e.g., adding a "Save" button prompts: "This needs a place to store data. Set it up for me / Show me how").

---

## 4. Screen layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◧ App ▾  Branch: main ▾ │  Flow  Design  Data  Logic  Agents  Ship │ ◉◉ Share Preview ▶ │  ← Top bar (48px)
├────┬─────────────────────────────────────────────────────────────┬───────────┤
│ ▣  │                                                             │ Inspector │
│ ⊕  │                                                             │  (320px,  │
│ ☰  │                     INFINITE CANVAS                         │ resizable,│
│ ◇  │                                                             │ collapsi- │
│ ⌕  │                                                             │   ble)    │
│    │                                                             │           │
│ 56 │                          ┌───────────────────────────┐      │           │
│ px │                          │ ✦ Ask Studio…        ⌘K   │      │           │
│rail│                          └───────────────────────────┘      │           │
│    │  [minimap]                 AI composer (floating)  [zoom]   │           │
├────┴─────────────────────────────────────────────────────────────┴───────────┤
│ Bottom dock (collapsed 28px): Problems 2 · Run log · Preview console · History │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Top bar (48 px):** app switcher + branch, mode switcher (center), collaborators' avatars, Share, Preview, Deploy status pill. Nothing else.
- **Left rail (56 px icons) + flyout (280 px):** Add (palette), Layers / Outline, Pages, Assets, Search, Kits. Flyout overlays the canvas (does not push it) and closes on canvas click.
- **Canvas:** fills everything else. Background `--canvas-bg` with a subtle dot grid that fades at low zoom.
- **Inspector (right, 320 px default, 280–480 resizable):** contextual to selection. Collapses to a 40 px strip with `]`.
- **AI composer:** floating pill bottom-center; expands into a panel (see §9).
- **Bottom dock:** collapsed by default to a status line; expands to 240 px with tabs.
- **Focus mode (`.`):** hides all panels except canvas and composer.

---

## 5. The canvas

**Engine:** React Flow (xyflow), already in use.

### 5.1 Navigation

| Gesture | Action |
| --- | --- |
| Trackpad two-finger scroll | Pan |
| Pinch / ⌘+scroll | Zoom (to cursor) |
| Space + drag, middle-drag | Pan |
| Double-click empty canvas | Quick-add search at that point |
| Double-click node | Open it (page → Design mode, flow node → inspector focus, entity → table editor) |
| `Shift+1` / `Shift+2` | Fit all / zoom to selection |
| `Z` + drag | Zoom to region |

Zoom range 10%–400%. Zoom animation 180 ms ease-out. Snap to 8 px grid while dragging (hold ⌘ to disable). Alignment guides appear between nodes (magenta 1 px lines, Figma-style).

### 5.2 Semantic zoom

Nodes change representation by zoom level so large graphs stay legible:

| Zoom | Page node shows | Logic node shows |
| --- | --- | --- |
| < 35% | Colored block with title only; edges simplified to straight lines | Icon dot + title |
| 35–90% | Thumbnail + title + status badges | Card with title, subtitle, ports |
| > 90% | Full thumbnail, port labels, inline values | Card + last-run values inline |

### 5.3 Organization

- **Sections/frames** (Figma-like): labeled translucent regions ("Onboarding", "Checkout"). Drag a section to move its contents. Collapse a section into a single node.
- **Subflows:** select nodes → "Collapse into subflow" (`⌘G`). Appears as one node with exposed ports, like Blueprint functions.
- **Auto-layout:** `⇧L` tidies the selection using **ELK.js** (EPL-2.0, used as an unmodified dependency) or **dagre** (MIT). Never auto-move nodes without the user asking.
- **Reroute points:** double-click an edge to add a bend point.
- **Minimap:** bottom-left, 160×100, shows sections in their colors; hidden below 20 nodes.

### 5.4 Selection

Click, shift-click, marquee drag. Selected nodes get a 2 px `--accent` ring with a 4 px soft glow. Multi-selection shows a floating mini-toolbar above the bounding box: Align, Distribute, Group, Duplicate, Delete, Ask AI.

---

## 6. Node design system

### 6.1 Anatomy (standard node)

```text
╭──────────────────────────────────────────╮
│ [icon]  Title                    ⋯  ●     │  ← header 36px; ● = status dot
│         subtitle / type · v1.2           │
├──────────────────────────────────────────┤
│  ○ input port label        output label ○│  ← port rows 24px
│  ○ input port label                      │
├──────────────────────────────────────────┤
│  preview area (thumbnail / sample / value)│  ← optional, mode-dependent
╰──────────────────────────────────────────╯
```

- Width: 240 px standard, 320 px for page nodes, 200 px compact logic nodes. Corner radius 12 px.
- Background `--node-bg`; 1 px border `--node-border`; on hover border lightens; selected uses accent ring.
- **Category color appears only in the icon tile and a 2 px top edge**, never as a full fill, so the canvas stays calm.
- Header icon tile 24 px, radius 6 px, category color at 16% opacity with icon at 100%.
- Title 13 px / 600; subtitle 11 px / 400 `--text-tertiary`.
- `⋯` menu appears on hover: Duplicate, Rename, Disable, Convert to subflow, View code, Delete.

### 6.2 Node categories and colors

| Category | Color token | Icon examples |
| --- | --- | --- |
| Page / UI | `--cat-ui` (violet) | layout, monitor, smartphone |
| Data | `--cat-data` (cyan) | database, table |
| Logic | `--cat-logic` (amber) | git-branch, zap, repeat |
| Integration | `--cat-integration` (blue) | provider logo (monochrome) |
| AI | `--cat-ai` (pink) | sparkles, bot |
| Auth / Billing | `--cat-account` (green) | shield, credit-card |
| Code | `--cat-code` (slate) | code-2 |
| Infra | `--cat-infra` (gray) | server, clock |

### 6.3 Page nodes (Flow mode)

Large 320×(auto) cards with a live thumbnail (rendered from the preview runtime, cached, refreshed on change with a 150 ms crossfade). Thumbnails fill the card edge-to-edge like Higgsfield's media nodes. Badges overlay the bottom: `Hidden from nav`, `Requires login`, `Pro only`, `2 problems`.

### 6.4 Status

| State | Visual |
| --- | --- |
| Idle | No dot |
| Running | Accent dot with pulse (1.2 s) + thin progress bar along top edge |
| Success | Green dot, fades after 3 s; last-run values stay |
| Warning | Amber dot + count badge |
| Error | Red dot, red 1 px border, error chip under node with "Fix" |
| Disabled | 40% opacity, dashed border |
| AI proposed (ghost) | Dashed accent border, 70% opacity, "Proposed" chip with ✓ / ✕ |
| Remote user editing | Collaborator's color ring + avatar chip |

---

## 7. Ports and edges

### 7.1 Ports

- 10 px circles on node edges; grow to 14 px on hover; show label tooltip at low zoom.
- **Shape encodes kind:** circle = data, diamond = execution/event (control flow), square = service requirement.
- **Color encodes type family** (string, number, boolean, entity, list, media, any) using a muted palette; the exact type shows in the tooltip (`List<Post>`).
- Unconnected required inputs show a hollow red ring.
- Dragging from a port highlights only **compatible** ports across the canvas (others dim to 30%), the single biggest UX win from typed graphs.

### 7.2 Edges

| Edge | Style |
| --- | --- |
| Navigation (page → page) | 2 px solid, `--edge-nav`, arrowhead |
| Event / execution | 2 px solid, category color of source, animated dash only while running |
| Data | 1.5 px solid, type color |
| Automatic (convention) routing | 1.5 px dashed, 50% opacity, "auto" label on hover (preserves current semantics) |
| Cut / disconnected | Hidden; restorable from inspector "Cut connections" list |
| Layout guide (composition order) | 1 px dotted, only visible in Design-related views |

- Bezier curves by default; toggle to smooth-step in settings.
- Hovering an edge highlights both endpoints; clicking selects it and shows a midpoint toolbar: Cut, Insert node, Add condition, Label.
- **Drop-on-empty quick-add:** dragging an edge into empty space opens quick-add filtered to compatible nodes, then auto-wires (n8n/ComfyUI pattern).
- **Insert on edge:** dragging a node onto an edge splices it in when types allow (edge glows to signal).

---

## 8. Mode-by-mode UX

### 8.1 Flow mode

- Default home. Pages left-to-right in user flow order; sections for Onboarding, Main, Settings, Admin.
- Top-left breadcrumb shows app name and page count.
- Primary CTA when empty: "Describe your app" (AI) or "Start from a kit".
- Clicking a page opens a **peek panel** (inspector) with page settings, route, guards, and a mini preview; double-click enters Design mode.

### 8.2 Design mode

```text
┌ Layers ──────┐ ┌───────── Breakpoints: Phone 390 · Tablet 820 · Desktop 1280 ─────────┐ ┌ Inspector ┐
│ ▾ Page: Feed  │ │                                                                      │ │ Content   │
│   ▾ Stack     │ │                 ┌──────── device frame ────────┐                     │ │ Style     │
│     Header    │ │                 │                              │                     │ │ Layout    │
│     PostList  │ │                 │   live, interactive page     │                     │ │ Data      │
│     TabBar    │ │                 │                              │                     │ │ Actions   │
└───────────────┘ │                 └──────────────────────────────┘                     │ └───────────┘
                  └──────────────────────────────────────────────────────────────────────┘
```

- Real rendered page (same runtime as preview) inside a device frame. Hover outlines elements (1 px accent), click selects, double-click edits text inline.
- Blue insertion line while dragging blocks from the palette; slot drop zones glow.
- **Breakpoint bar** like Framer; edits apply to the current breakpoint and cascade downward, with a dot indicating overrides.
- Layers tree on the left (replaces the left flyout in this mode), drag to reorder/nest.
- "Interact" toggle (`I`) switches between edit and click-through behavior.
- Side-by-side web + phone view toggle for cross-platform apps.

### 8.3 Data mode

- Entities as table cards listing fields (name, type icon, required/unique badges) with relation edges using crow's-foot ends.
- Click a card → inspector shows fields editor, permissions (plain-language presets: "Only the owner", "Anyone in the team", "Public read"), and a **sample rows** tab with an editable grid.
- Adding a relation: drag from a field to another entity; a small popover asks "One post has many comments?" with plain-language choices.
- Schema changes show a **migration preview** chip ("adds 1 column, safe"); destructive ones turn red and require confirmation.

### 8.4 Logic mode

- Left: list of flows grouped by trigger type. Canvas: selected flow.
- Trigger node pinned on the left; steps flow rightward; branches fan downward.
- **Test run** button on the trigger: runs with sample input; each node shows input/output chips; clicking a node shows an n8n-style three-column panel (Input · Settings · Output) in the inspector expanded to 640 px.
- Expressions edited in an inline Monaco field with autocomplete from the type system and a live evaluated value under it.
- Plain-language summary at the top of each flow ("When a payment succeeds → upgrade the plan → email a receipt"), generated deterministically from the nodes.

### 8.5 Agents mode

- Agent node at center; model node, tools, knowledge sources, memory, and guardrails attach around it (Langflow-like but tidier).
- Built-in **test chat** panel on the right with tool-call traces, token cost per turn, and "Save as eval case".
- Usage/cost estimates on the model node.

### 8.6 Ship mode (non-canvas)

- Two-column page: left **Readiness checklist** (grouped: Accounts, Payments, Data, Domains, Mobile store), each item with status and a "Fix" action; right **Environments** cards (Preview, Staging, Production) with deploy history timeline.
- Health score ring (from quality gates) with drill-down.
- Export section: Download web / mobile / full monorepo, Sync to GitHub.

---

## 9. The AI composer

The AI is present everywhere but never in the way.

- **Collapsed:** a floating pill bottom-center: `✦ Ask Studio…  ⌘K`. Context chip shows what it will act on ("Feed page", "3 nodes selected", "Whole app").
- **Expanded:** 560 px wide panel rising from the pill, max 60% viewport height; canvas remains visible and interactive above it.
- **Conversation + plan:** responses show a **plan card** listing typed operations grouped by mode ("Design: add 2 blocks · Data: add entity Comment · Logic: 1 flow").
- **Ghost preview:** proposed nodes appear on the canvas with the dashed "Proposed" style; a review bar shows "Apply all", "Apply selected", "Discard", plus per-node ✓/✕.
- **Cost line** before running: "Uses existing blocks · free" or "Creates 1 new block · est. 18k tokens · ₹12". Requires confirmation above a user-set threshold.
- **Coverage report** for big requests: progress bar "87% from library · 2 new blocks needed".
- **Slash commands:** `/page`, `/block`, `/entity`, `/flow`, `/agent`, `/fix`, `/explain`, `/clone <url>`.
- **Inline AI:** right-click any node or element → "Ask AI about this…"; error chips include "Fix with AI".
- **Block-author progress:** when creating a new block, a compact stepper shows Spec → Implement → Test → Render → Review, each with logs on expand. The user can approve the spec before any implementation tokens are spent.
- After apply: toast "Applied 7 changes · Undo" (`⌘Z` reverts the whole batch).

---

## 10. Inspector

- **Header:** icon, editable name, type + version, overflow menu.
- **Tabs (contextual):** Content · Style · Layout · Data · Actions · Advanced. Only relevant tabs appear.
- **Field controls:** generated from JSON Schema (existing RJSF approach) but restyled to our design system with custom widgets: color token picker, spacing scrubber (drag on label to change value, like Figma), segmented controls for enums, toggles, image picker, rich text, list editors with drag handles.
- **Binding affordance:** every bindable field has a small `⌁` button on hover; clicking turns it into a binding/expression field with a type-aware picker ("currentUser → name").
- **Touched indicator:** fields customized by hand show a small dot; tooltip "Protected from automatic changes · Reset" (surfaces today's touched-path concept).
- **Validation:** inline, on blur; invalid fields never save, with the message right under the field.
- Sticky footer for destructive actions only (Delete block).

---

## 11. Palette, quick-add, and command palette

### 11.1 Palette (left flyout "Add")

- Search at top (fuzzy, by name, tag, and intent: typing "login" finds Sign in, Social buttons, Auth kit).
- Tabs: **Blocks · Kits · Templates · My blocks · Marketplace**.
- Categories as collapsible groups with 2-column visual tiles (thumbnail + name); list view toggle for Pro density.
- Hover tile → larger preview card with variants carousel, targets (Web / iOS / Android icons), stability badge.
- Drag to canvas, or click to insert at the current selection.

### 11.2 Quick-add (double-click canvas / drop edge / `Tab`)

Compact 360 px popover at cursor: search + recent + suggested (based on the source port's type). Arrow keys + Enter insert and wire.

### 11.3 Command palette (`⌘K`)

Built with **cmdk**. Sections: Actions, Navigate (pages, flows, entities), Insert, Settings, Ask AI (falls through to the composer when the query isn't a command). Shows shortcuts on the right of each item.

---

## 12. Preview and device frames

- **Preview button** opens a split view (canvas left, preview right) or full-screen (`⌘↵`).
- Device presets: iPhone 15/16 size class, Pixel, iPad, Desktop 1280/1440; rotate; dark/light toggle; slow-network toggle.
- **Mobile on a real device:** "Open on phone" shows a QR code for Expo Go / dev build.
- Data mode switch in the preview header: **Sample data** (safe, default) vs **Connected** (real services; persistent amber banner "Connected to live data"), keeping today's isolation rule.
- Preview console in the bottom dock shows logs, network calls, and flow traces linked back to nodes (click a log → highlight node).

---

## 13. Onboarding and empty states

**First run (≤60 seconds to "wow"):**

1. Welcome screen, one question: "What are you building?" with a large text field and example chips (SaaS dashboard, Marketplace, Chat app, AI assistant, Landing page).
2. Optional: brand (logo upload or color), audience, tone, which is the existing 6-question profile cascade restyled as a friendly two-step card.
3. Studio shows the graph assembling live on the canvas (nodes fade in along edges, ~1.5 s total), then auto-opens the preview.
4. A 4-step coach-mark tour (dismissible, resumable from Help): Canvas, Design, AI composer, Ship.

**Empty states** always offer three doors: *Describe it to AI*, *Start from a kit/template*, *Add manually*. Illustrations are simple line art in `--text-tertiary` with a single accent stroke.

**Templates gallery:** grid of full app templates with large previews, filter by category and platform, "Remix" button.

---

## 14. Collaboration UX

- Avatars in the top bar; click to **follow** that person's viewport.
- Live cursors with name labels (fade after 3 s of inactivity); remote selections show colored rings.
- **Comments mode (`C`):** click anywhere to drop a pin; threads with mentions, reactions, resolve; pins attach to nodes/elements and move with them.
- **Share dialog:** invite by email, role select (Editor, Designer, Viewer, Client), link sharing for preview-only access.
- **Branches & history:** History panel (bottom dock) lists operations grouped by session/author with "Restore to here"; branch switcher in top bar; merge view shows graph diff with added (green), changed (amber), removed (red) nodes on the canvas.

---

## 15. Feedback, errors, and system status

- **Save state** in top bar: "Saved" (quiet) · "Saving…" · "Offline: changes kept locally" · "Conflict: review" (clickable).
- **Toasts** (Sonner): bottom-right, max 3 stacked, 4 s, always with an action when one exists (Undo, View, Fix).
- **Problems panel** (bottom dock): grouped by severity, each row clickable to focus the node; includes quality-gate results.
- **Error copy rules:** plain language first, technical detail collapsible. Example: "This list doesn't know which posts to show. Connect it to a data source." [Connect data] [Ask AI] ▸ Details: `PostList.items unbound (List<Post>)`.
- **Long tasks** (compile, deploy, block creation): non-blocking progress in the status line with a details popover; never a full-screen spinner.
- **Destructive actions:** confirmation only for irreversible ones (delete entity with data, production deploy); everything else is undoable and doesn't ask.

---

## 16. Visual design system (tokens)

Dark-first (matches node-editor norms and long sessions), with a full light theme. All values as CSS variables; source of truth in a W3C design-tokens JSON compiled with Style Dictionary (shared with the generated-app token pipeline).

### 16.1 Color (dark)

| Token | Value | Use |
| --- | --- | --- |
| `--canvas-bg` | `#0B0B0E` | Canvas |
| `--canvas-dot` | `#1C1C22` | Grid dots |
| `--panel-bg` | `rgba(18,18,22,0.86)` + `backdrop-filter: blur(20px)` | Panels, rail, inspector |
| `--surface-1` | `#141418` | Cards in panels |
| `--node-bg` | `#16161B` | Nodes |
| `--node-border` | `#26262E` | Node border |
| `--border-subtle` | `#202027` | Dividers |
| `--text-primary` | `#EDEDF0` | Main text |
| `--text-secondary` | `#A1A1AA` | Labels |
| `--text-tertiary` | `#6B6B76` | Hints |
| `--accent` | `#7C5CFF` | Selection, primary actions |
| `--accent-hover` | `#8F74FF` | – |
| `--success` | `#3DD68C` | – |
| `--warning` | `#F5A524` | – |
| `--danger` | `#F2555A` | – |
| `--cat-ui` | `#9B87F5` | Category |
| `--cat-data` | `#38BDF8` | Category |
| `--cat-logic` | `#F5B544` | Category |
| `--cat-integration` | `#5B8DEF` | Category |
| `--cat-ai` | `#F472B6` | Category |
| `--cat-account` | `#34D399` | Category |
| `--cat-code` | `#94A3B8` | Category |
| `--cat-infra` | `#71717A` | Category |

Light theme mirrors with `--canvas-bg #F7F7F8`, `--node-bg #FFFFFF`, `--node-border #E4E4E7`, text `#18181B / #52525B / #A1A1AA`, same accent family adjusted for contrast. All text/background pairs meet WCAG AA (4.5:1 body, 3:1 large/UI).

### 16.2 Typography

- UI: **Inter** (OFL) or **Geist** (OFL), with `font-feature-settings: "cv11", "ss01"` for Inter; tabular numbers in data views.
- Code/expressions: **JetBrains Mono** or **Geist Mono** (OFL).
- Scale (px / line-height / weight): 11/16/500 (caption), 12/16/400 (small), 13/20/400 (body, default UI), 14/20/500 (emphasis), 16/24/600 (panel titles), 20/28/600 (dialog titles), 28/36/650 (onboarding).
- Letter-spacing −0.01em for ≥16 px.

### 16.3 Spacing, radius, elevation

- Spacing: 4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Radius: 6 (inputs, chips), 8 (buttons), 12 (nodes, cards), 16 (panels, dialogs), 999 (pills).
- Elevation (dark): rely on borders + subtle shadows: `0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)` for floating panels; nodes use `0 2px 8px rgba(0,0,0,0.3)`.
- Hit targets ≥ 28 px in dense UI, ≥ 40 px for primary actions.

### 16.4 Iconography

**Lucide** (ISC), 16 px in UI, 1.5 px stroke; 20 px in the rail. Provider logos monochrome by default, colored on hover.

### 16.5 Components to standardize

Button (primary/secondary/ghost/danger; sm/md), IconButton, Input, NumberScrubber, Select, Combobox, SegmentedControl, Switch, Slider, ColorTokenPicker, Tabs, Tooltip, Popover, ContextMenu, Dialog, Sheet, Toast, Badge, Avatar/AvatarStack, Kbd, Skeleton, EmptyState, ProgressStepper, CodeField (Monaco), DataGrid.

---

## 17. Motion

| Interaction | Duration | Easing |
| --- | --- | --- |
| Hover states | 120 ms | ease-out |
| Panel open/close, flyouts | 200 ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Mode switch (canvas crossfade + slight scale 0.98→1) | 240 ms | same |
| Zoom to fit | 300 ms | ease-in-out |
| Node appear (AI apply) | 220 ms, staggered 30 ms | spring (stiffness 300, damping 30) |
| Toasts | 180 ms in, 140 ms out | ease-out |

Rules: motion explains causality (a node flies from palette to drop point; AI ghost nodes materialize along their edges). Respect `prefers-reduced-motion`: replace movement with opacity fades and disable pulsing.

---

## 18. Keyboard and power-user UX

| Shortcut | Action |
| --- | --- |
| `⌘K` | Command palette / AI |
| `/` | Focus AI composer |
| `Tab` / double-click | Quick-add |
| `1`–`6` | Switch mode (Flow, Design, Data, Logic, Agents, Ship) |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘D` | Duplicate |
| `⌘G` / `⇧⌘G` | Collapse to subflow / expand |
| `⌫` | Delete selection (edges: cut) |
| `⇧L` | Tidy layout |
| `⇧1` / `⇧2` | Fit all / fit selection |
| `[` / `]` | Toggle left flyout / inspector |
| `.` | Focus mode |
| `C` | Comment mode |
| `I` | Interact mode (Design) |
| `⌘↵` | Preview |
| `⌘S` | Save checkpoint (named history entry; autosave is always on) |
| `?` | Shortcut sheet |

Shortcuts are shown in tooltips and the command palette, and are remappable in settings.

---

## 19. Accessibility

- Full keyboard operation of the canvas: arrow keys move focus between nodes (spatially), `Enter` opens, `⌥+arrows` nudge position, port connection via a keyboard "connect" mode (select source port → type to pick target).
- Screen reader: each node exposes role, name, type, and connection summary ("Feed page, 3 incoming, 2 outgoing, 1 problem"); an **Outline view** (left rail) presents the whole graph as a navigable tree, which is the accessible alternative to the canvas.
- Color is never the only signal (port shapes, icons, text badges).
- Focus rings: 2 px `--accent` with 2 px offset, always visible on keyboard focus.
- Zoom up to 400% without loss; UI scale setting (90/100/110/125%).

---

## 20. Performance budgets

| Metric | Budget |
| --- | --- |
| Studio initial load (warm cache) | < 1.5 s to interactive canvas |
| Pan/zoom with 500 nodes | 60 fps; with 2,000 nodes ≥ 45 fps (semantic zoom + React Flow viewport culling) |
| Node drag latency | < 16 ms per frame |
| Inspector open | < 100 ms |
| Mode switch | < 250 ms |
| Page thumbnail refresh | < 800 ms after edit, off main thread (worker render or cached image) |
| Preview hot update | < 500 ms for config/style changes |
| JS shipped for the shell | < 400 kB gzip; Design, Data, Logic, Agents modes lazy-loaded (extends today's lazy loading) |

Techniques: memoized custom nodes, `onlyRenderVisibleElements`, thumbnails as cached bitmaps, Zustand selectors to avoid re-renders, Web Workers for layout (ELK) and validation.

---

## 21. Responsive behavior

- **≥ 1280 px:** full layout.
- **1024–1279 px:** inspector overlays the canvas as a sheet; left flyout narrower (240 px).
- **768–1023 px (tablet):** view, comment, preview, light edits; touch gestures (pinch, two-finger pan, long-press for context menu).
- **< 768 px (phone):** companion experience: view app, preview on device, approve AI plans, reply to comments, check deploys. Not full editing.

---

## 22. Implementation stack (reuse before build)

| Need | Reuse | License |
| --- | --- | --- |
| Canvas, nodes, edges, minimap | **xyflow / React Flow** (already used) | MIT |
| Auto-layout | **ELK.js** or **dagre** | EPL-2.0 / MIT |
| UI primitives | **Radix UI** + **shadcn/ui** patterns, restyled with our tokens | MIT |
| Styling | **Tailwind CSS v4** with CSS-variable tokens | MIT |
| Tokens pipeline | **Style Dictionary** | Apache-2.0 |
| Command palette | **cmdk** | MIT |
| Toasts | **Sonner** | MIT |
| Sheets (tablet) | **Vaul** | MIT |
| Motion | **Motion** (framer-motion) | MIT |
| State | **Zustand** (+ Yjs bindings for collaboration) | MIT |
| Collaboration | **Yjs** + **Hocuspocus**, `y-protocols/awareness` for cursors | MIT |
| Drag & drop (palette, layers) | **dnd-kit** | MIT |
| Forms from schema | Keep **RJSF** with custom widgets, or **AutoForm**-style on Zod | Apache-2.0 / MIT |
| Code & expressions | **Monaco Editor** (or CodeMirror 6, MIT, lighter) | MIT |
| Data grid (Data mode) | **TanStack Table** + **TanStack Virtual** | MIT |
| In-page design editing | **Puck** (evaluate per plan.md §5.2) | MIT |
| Icons | **Lucide** | ISC |
| Fonts | Inter / Geist / JetBrains Mono | OFL |
| Hotkeys | **react-hotkeys-hook** or **tinykeys** | MIT |
| Visual regression for Studio | Playwright screenshots + Storybook | Apache-2.0 / MIT |

Build ourselves: custom node components, port type system visuals, ghost-preview/AI review layer, semantic zoom logic, mode orchestration, Ship checklist.

---

## 23. Rollout plan and acceptance criteria

### Phase A: Design system and shell (3–4 weeks)

- Tokens (dark + light), typography, core components in Storybook.
- New shell: top bar with mode switcher, left rail + flyouts, inspector, bottom dock, floating AI composer.
- Flow mode on the new node design (page thumbnails, sections, semantic zoom, minimap).
- Migrate existing Workspace, Inspector, DesignEditor, AgentView, CardsView into the shell without losing features.

**Acceptance:** all existing Playwright flows pass on the new shell; 5 first-time users each find "add a page", "change a button color", and "preview on phone" without help in under 3 minutes.

### Phase B: Design mode + palette + command palette (3–4 weeks)

- Live page editing in device frames, layers tree, breakpoints, inline text edit, slot drop zones.
- Palette with visual tiles, quick-add, cmdk command palette, shortcut sheet.

**Acceptance:** 60 fps canvas with 500 nodes on a mid-range laptop; Lighthouse accessibility ≥ 95 for the Studio shell; System Usability Scale ≥ 80 in a 10-person test.

### Phase C: Data, Logic, Agents modes (with plan.md Phase 2–3)

- Entity cards, relation drawing, permissions presets, sample data grid.
- Flow canvas with test runs and three-column node panel; expression editor.
- Agent canvas with test chat and traces.

**Acceptance:** a non-technical tester creates an entity, binds a list to it, and builds a "send email on signup" flow unaided in under 10 minutes.

### Phase D: AI composer v2, collaboration, Ship (with plan.md Phase 3)

- Ghost previews, plan cards, cost lines, coverage report, block-author stepper.
- Cursors, follow mode, comments, history, branch diff view.
- Ship mode readiness checklist and deploy timeline.

**Acceptance:** AI-applied changes are always previewed before landing and undoable in one step; two users edit the same project concurrently without conflicts in a 30-minute session; a user goes from finished graph to public URL entirely inside Ship mode.

### Ongoing quality bar

- Visual regression screenshots for every Studio component and mode in light and dark.
- Monthly 5-user usability sessions (mix of technical and non-technical founders); track time-to-first-preview, time-to-first-deploy, and drop-off points.
- A "polish week" every 6 weeks dedicated to micro-interactions, copy, and consistency.
