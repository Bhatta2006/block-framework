# Block Studio — web and mobile, from one graph

Block Framework now includes **Block Studio**, a visual node-based workspace for building responsive web applications and native mobile applications. Connect pages on a flow canvas, compose blocks inside each page, preview the behavior, and export an editable codebase.

## Start the studio

```sh
npm ci
npm run build:studio
npm run studio
```

To try a complete app, open **Switch apps → Create app → Notes app**. The included **Paper** template has persistent notes, autosave, search, folders, tags, favorites, pinning, archive, trash/restore, Markdown checklists, and import/export backups. Three reusable data blocks share collections across connected pages, and a page can be hidden from the app navigation. See [the notes app reality check](docs/notes-reality-check.md) for the gaps this build uncovered, instructions, verification, and remaining limits.

For real services, select **Cloud notes** instead. Five reusable blocks add verified email/Google accounts, saved onboarding, INR 0/500/1000 plans, UPI checkout, account management, and owner payment review. Existing collection/editor/summary blocks use private Supabase storage through the generated server. Configure the backend URL under **Developer tools → Cloud services**; a web ZIP includes the server, SQL migration, blank environment template, and hosting instructions. See [Paper Cloud setup and live verification](docs/paper-cloud-setup.md). Canvas thumbnails remain temporary previews; the connected app uses real accounts and cloud data. Cloud exports currently support responsive web.

Open **http://127.0.0.1:5174**. The CLI persists the active project to `.builder-cache/project.blockfw.json` and the app library to the adjacent `.apps.json` file. Use `node packages/builder/dist/bin.js --project path/to/project.blockfw.json --port 5174` to choose a different file. Keep both files when backing up the complete workspace.

Click the app name in the sidebar to switch apps, create an app, delete an app, or restore a recently deleted app. **New starter app** creates a separate app with two connected pages and four editable blocks; it preserves existing apps.

The bundled Habitual example includes authentication, onboarding, pricing, a composed home page, details, progress, profile, and settings. Authentication and billing are local demo services.

## Build visually

1. **Page flow:** drag pages around; double-click a page or select it in the sidebar. Drag an event port to another page to override its automatic route. Select a wire and choose **Cut connection**, or press Delete. Cuts persist; reconnect a port or use Undo to restore it. Cutting a page canvas layout guide keeps both blocks on the page.
2. **Page canvas:** click or drag a library block onto the canvas. Blocks connect in rendering order automatically. Event ports connect compatible producers and consumers.
3. **Properties:** select a block to edit its content, appearance, rendering order, or event destination. Use stack, grid, or split page layouts.
4. **Preview:** run the app at desktop or phone width. The phone view is a responsive web preview; native source is a separate export target.
5. **Export:** download a React/Vite web application or an Expo/React Native mobile application. Both include complete source and run instructions.

Manual changes support undo/redo and Ctrl/Cmd+Z. Node positions persist independently of the finished page layout. Developer tools let you save/import project files, inspect block contracts, and edit the graph directly. The optional AI assistant proposes scoped edits for review; its default responses are labelled recorded demos.

## Customize inside a block

Select a block and choose **Customize inside this block**. Click an element in the design preview, then drag it to change its offset or use the property controls for precise position, width, height, padding, spacing, corner radius, colors, typography, alignment, opacity, and visibility. Style controls preview immediately; **Apply design** saves them without reloading the design canvas. Check desktop and phone widths. **Reset element** restores the template's appearance. The checkbox **Apply to matching elements in all blocks** applies a common style throughout the current app.

Open **Element library** inside the designer to insert buttons, text, or dividers into the selected block. Added elements can be placed before an existing element or at the end, styled individually, dragged, and removed. Change their labels with **Element text**.

Select a button and choose **When this button is pressed**: no action, go to a specific page, go back, open a complete HTTP/HTTPS URL, or show a message. **Save element & action** saves that button's content and behavior. Each button has its own destination; new buttons have no action by default. Existing buttons keep their original block behavior until you explicitly override it. Navigation actions appear as separate event ports in the canvas and can be connected or cut there too. Deleting a destination page resets its button actions to no action.

Styles are saved under `block.design.elements`. The shared web runtime applies styles to rendered elements; native export translates corresponding template styles into typed React Native JSX. Main parts such as `container`, `title`, `subtitle`, `button`, and `input` have shared identities. Web-specific decorative elements and individually repeated rows do not necessarily have identical counterparts in native templates; check the exported native app for those details. Layout customization preserves event handlers unless you explicitly choose a different button action. Added elements/actions also compile into the mobile source.

**Ask AI to edit this block** selects that block in the AI assistant. Choose **All blocks** for app-wide changes. The assistant can edit declared content fields (including quiz questions), variants, and element designs. To revise previously customized fields, explicitly select the overwrite checkbox for that request, then review the diff. In **AI assistant → Continue with ChatGPT**, eligible users can connect their ChatGPT account, authorize plan usage, and choose a model without configuring an API key. Studio remembers the connection using protected local storage. See [ChatGPT connection setup](docs/chatgpt-connection.md). Alternatively, configure `BLOCKFW_LLM_PROVIDER=openai-compatible`, `BLOCKFW_LLM_BASE_URL`, `BLOCKFW_LLM_MODEL`, and `BLOCKFW_LLM_API_KEY` before starting the server. Recorded demo responses do not provide arbitrary AI design generation.

## The block library

| Block             | Purpose                                    | Variants              |
| ----------------- | ------------------------------------------ | --------------------- |
| `content.hero`    | Introduction and connected call to action  | default, compact      |
| `content.text`    | Section heading and supporting copy        | default, compact      |
| `action.button`   | Connected action button                    | default, compact      |
| `auth.email`      | Email sign-in/sign-up demo                 | signin, signup        |
| `onboarding.quiz` | Questions, progress, and answers           | quiz-cards, quiz-list |
| `paywall.basic`   | Plans and checkout/restore demos           | cards, compact        |
| `home.list`       | Collections with selected-item events      | list, grid            |
| `content.detail`  | Routed content and a connected action      | article, product      |
| `stats.overview`  | Metrics and summary cards                  | row, grid             |
| `profile.card`    | Identity, biography, and profile stats     | card, compact         |
| `settings.list`   | Local toggles and integration placeholders | list, grouped         |

All registered types use version `@1.0.0`. Native templates and the responsive web runtime share configuration and event contracts.

## Project structure

```json
{
  "schemaVersion": "0",
  "app": { "name": "My app", "slug": "my-app", "version": "1.0.0" },
  "screens": [
    {
      "id": "home",
      "title": "Home",
      "block": "hero",
      "blocks": ["hero", "text"],
      "layout": "stack"
    },
    { "id": "next", "title": "Next", "block": "next" }
  ],
  "blocks": [
    { "id": "hero", "type": "content.hero@1.0.0" },
    { "id": "text", "type": "content.text@1.0.0" },
    { "id": "next", "type": "content.text@1.0.0" }
  ]
}
```

The `blocks` array on a page defines its composition order; the required `block` field preserves compatibility with older single-block graphs. Optional page and block `position` fields store canvas coordinates. Explicit `wires` override the default routing. Without one, an event finds a unique matching consumer, preferring its own page, then falls back to the next page. Ambiguous consumers require an explicit choice.

The studio wraps this graph in `{version: 1, profile, touched, graph}`. Hand-edited fields, including nested children, are protected from subsequent profile or AI replacement unless a reviewed AI request explicitly allows updating them.

## Compile from the command line

```sh
# Standalone React/Vite application
node packages/compiler/dist/cli.js compile examples/studio/graph.json --target web --out out/web

# Expo application for iOS and Android
node packages/compiler/dist/cli.js compile examples/studio/graph.json --target mobile --out out/mobile

# Audited, repeatable source ZIP
node packages/compiler/dist/cli.js export examples/studio/graph.json --target web --out out/app-web.zip

# Validate contracts and print resolved event connections
node packages/compiler/dist/cli.js validate examples/studio/graph.json
```

In a web export: `npm install`, `npm run dev`, then `npm run build` for deployable static output. In a mobile export: `npm install`, `npm run typecheck`, then `npx expo start`.

The optional mobile backend scaffold is generated with `--spine examples/full-app/spine.json`. It emits SQL, database types, and a Supabase bootstrap; it does not automatically connect blocks to a production database.

## Extend the framework

```sh
node packages/compiler/dist/cli.js sdk scaffold custom.widget --category utility
node packages/compiler/dist/cli.js sdk test custom.widget
node packages/compiler/dist/cli.js sdk validate
```

Native block sources live in `packages/blocks/src/blocks/`; register new manifests and pure renderers in `registry.ts`. The generated web runtime is in `packages/compiler/src/web-runtime.ts`; add browser renderers there or extend `src/runtime.tsx` after export. Block configuration schemas generate the editor forms. Event payload contracts drive wiring and native input types.

The compiler remains deterministic. Optional AI edits use an independent gateway with a saved ChatGPT connection or `BLOCKFW_LLM_*` configuration. Studio labels ChatGPT plan, other live providers, and recorded responses, and requires review before applying a plan. ChatGPT requests use the documented OAuth and public Responses API flow, subject to account eligibility and usage limits.

## Packages

| Package     | Role                                                      |
| ----------- | --------------------------------------------------------- |
| `manifest`  | Schemas, types, validation                                |
| `blocks`    | Nineteen blocks, registry, authoring SDK                  |
| `wiring`    | Event routing, payload compatibility, reachability        |
| `compiler`  | Web and Expo compilation, CLI, source ZIPs                |
| `spine`     | PostgreSQL migrations and database types                  |
| `agent`     | Scoped provider-independent edit planning/apply/undo      |
| `builder`   | Local server, React Flow editor, preview, profile cascade |
| `benchmark` | Compiler, agent, and export regression tasks              |

See [the detailed project map](docs/project-map.md) for architecture, contracts, data flow, HTTP APIs, current limits, and the next product layers.

For the complete implemented capability inventory, all 19 block contracts, application workflows, architecture, service setup, verification, and release boundaries, read [the full project overview](docs/project-overview.md).

## Verify

```sh
npm run build:studio
npm run lint
npm run typecheck
npm test
node packages/compiler/dist/cli.js sdk validate
```

Browser checks:

```sh
npx playwright install firefox
npx playwright test --config packages/builder/playwright.config.ts --project firefox
```

These checks exercise the real editor and generated web behavior. Browser evidence is written to `.builder-cache/proof/`. The suite includes composition, configuration, undo/redo, node/port dragging, the demo app flow, same-page payload delivery, responsive preview, toggles, web/mobile downloads, invalid project edits, and small-screen navigation.

Real authentication, onboarding, private text-note cloud storage, server-enforced limits, and manual UPI payment review are implemented for cloud web apps. Public SMTP, HTTPS deployment, merchant billing automation, cloud collaboration, arbitrary data schemas, and visual API/business-logic nodes remain further integration work. Local persistent text-record collections also work in web and native exports. The export path gives developers ownership of the full source.
