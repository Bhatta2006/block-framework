# Studio shell v2: direction and first increment

Date: 2026-10-10. Branch: `codex/phase-1-professional-exports`. Implements Phase A of
[studio-ui-ux.md](studio-ui-ux.md) §23 and Phase 1 remaining increment 4 in
[phase1-progress.md](phase1-progress.md).

## Why this increment, now

The compiler, typed graph operations, deterministic exports, and shared tokens are already
stronger than most competitors' output. The Studio shell is not. It is a pale-green
sidebar app with marketing copy inside the editor, a modal for every task, and no
keyboard model. A paying founder judges the product in the first five seconds, so the
gap between the engine and the shell is the most expensive gap we have.

## What the market expects in late 2026

Sources are mostly vendor and reviewer blogs, so treat them as directional:

| Signal                                                                                                                                                                                                                                                                                                                                                 | Implication for Studio                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Lovable, Bolt, and v0 are prompt-first. The first screen is one large "what do you want to build?" field, with templates under it. ([Lovable guide](https://lovable.dev/guides/best-ai-app-builders), [Mocha comparison](https://getmocha.com/blog/best-ai-app-builder-2026))                                                                          | The welcome screen leads with intent and templates. Starting manually is the secondary path.                                   |
| Lovable split chat into **Plan** and **Build** modes, and replaced "Visual Edits" with a preview toolbar for picking elements, editing inline, and annotating. ([RapidDev on Plan mode](https://rapidevelopers.com/lovable-issues/lovable-plan-mode-explained), [June 2026 roundup](https://till-freitag.com/en/blog/lovable-feature-roundup-june-en)) | Our existing plan → review → apply agent is already "Plan mode". Surface it as a composer that is always present, not a modal. |
| Lovable and Bolt now ship first-party backends. Only Bolt reaches Expo, and none of them ships a deterministic, inspectable graph. ([appbuilder24](https://appbuilder24.com/blog/bolt-vs-lovable-vs-v0-vs-base44-ai-app-builder-comparison-2026), [nxcode](https://www.nxcode.io/resources/news/best-ai-app-builders-2026))                            | Lead with what they lack: a visible graph, one graph for web and native, zero-token edits, and owned code.                     |
| Figma Weave and Higgsfield Canvas run node canvases with reusable workflows, and spend credits only when a node generates. ([Higgsfield help](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas), [Figma Weave](https://www.figma.com/solutions/figma-ai-tool-weave/))                                                           | Canvas nodes need large media previews, calm chrome, and an explicit "free" label on edits that cost nothing.                  |
| Framer and Webflow ship agents on the canvas plus real-time collaboration. ([Flow Ninja](https://www.flowninja.com/blog/framer-vs-webflow))                                                                                                                                                                                                            | Collaboration stays on the roadmap (Phase D). The shell reserves top-bar space for presence.                                   |

## Decisions for this increment

1. **Dark-first token system** (`ui/src/styles/tokens.css`) with a complete light theme and
   a System/Dark/Light toggle. Studio chrome tokens are separate from the generated app's
   theme, as `studio-experience-plan.md` requires.
2. **Shell layout** per spec §4: a 48 px top bar (app switcher, breadcrumb, mode switcher,
   save state, undo/redo, Preview, Export), a 56 px left rail, a docked navigator
   (pages and layers), the block library, a canvas, an inspector, and a status bar.
3. **Modes:** Flow, Design, and Ship work today. Data, Logic, and Agents appear disabled
   with a "Soon" label and say which phase delivers them. An unimplemented capability
   never appears as a working control.
4. **Ship view** replaces the export modal: a readiness checklist derived from the real
   wiring report and project state, plus the existing export targets. Deploy appears as
   a planned capability only.
5. **AI composer:** a floating pill (`/` or the rail) opens the existing scoped agent
   as a docked panel instead of a modal, so the canvas stays visible.
6. **Command palette** (`Ctrl/⌘ K`, built with `cmdk`, MIT): navigate pages, switch modes,
   insert blocks, run actions. A shortcut sheet opens with `?`.
7. **Canvas restyle:** dark dot grid, category-colored node icons, a status rail on each
   node, semantic zoom (live previews give way to compact cards below 45% zoom, which also
   saves iframe work), and themed edges, minimap, and controls.
8. **Template gallery** for new apps: visual cards for Starter, Notes, and Cloud notes,
   each with an honest capability label.
9. Workspace.tsx (1,272 lines) is split into shell, view, and dialog modules. It keeps only
   orchestration (about 550 lines). Each new TS/TSX module is under 400 lines; FlowCanvas
   stays one file (about 540 lines) and is the next candidate to split.

Preserved contracts: typed graph operations, serialized saves, undo/redo, app library,
every export target, agent plan fingerprints, and the accessible names that the browser
suite relies on. Where the UX changes on purpose (the template picker), the tests change
with it in the same commit.

## Not in this increment

Data, Logic, Agents modes; Puck-style in-page editing; collaboration; deploy adapters; the
80-block catalog. They remain in the phase plan.
