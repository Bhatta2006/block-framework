# Notes app reality check

The test app is **Paper**: a responsive black-and-white notes app assembled from the same graph that Studio edits and exports. It has five pages and six block instances, built from three new reusable block types. It is available in the app picker alongside existing apps; **Create app → Notes app** creates another independent copy.

## What prevented the original library from building this app

| Task                                | Original gap                                                                  | Implemented capability                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Create and edit notes               | Collections were static sample items; detail pages could only display an item | `data.collection` and `data.editor`, with a typed selected-record event                                               |
| Keep changes after refresh          | Generated apps had no persistent record store                                 | Local browser storage and native AsyncStorage, sharing one tested record model                                        |
| Reuse data across pages             | Each block held its own component state                                       | A shared `collectionKey` joins collection, editor, and summary blocks within an app                                   |
| Open an existing note after refresh | Navigation retained payloads only in memory                                   | Web editor URLs contain the selected record and collection; back/forward and reload retain the selection              |
| Organize growing content            | No search, folders, tags, sorting, or record lifecycle                        | Search across title/body/tags; folders; favorites; pinning; archive; recoverable trash; confirmed permanent deletion  |
| Write longer notes                  | No editable body, formatting, or task controls                                | Autosave editor, Markdown headings/bold, checklist insertion and interactive checklist preview, word/character counts |
| Recover or move app data            | Project JSON contained configuration only                                     | Validated JSON backups, merge import, export, storage-error feedback, and explicit recovery from corrupt storage      |
| Keep editors out of the main menu   | All web pages appeared in navigation                                          | A per-page **In navigation** toggle; record editor pages can stay reachable only through their wires                  |
| Start with a complete working flow  | Beginners had to configure every new page                                     | A notes template with resolved selection/return wires and a monochrome app shell                                      |
| Understand a disconnected action    | Pressing an unconnected control silently did nothing                          | New data controls explain which event needs a connection                                                              |

The build also exposed intermittent Windows locks during catalog replacement. Catalog saves now use bounded retries and roll back in-memory app changes if persistence fails. Another check found that asynchronously loaded editor controls were absent from the design picker; the picker now observes loaded content, and a browser regression verifies live and saved title-field styling.

The three biggest changes are persistent records, editable record forms, and shared data across wired pages. These turn the builder from a collection of interactive demos into a tool that can build a useful local CRUD app.

## How to build and extend it in Studio

1. Open **Switch apps → Create app**, choose **Notes app · persistent records**, enter a name, and create it. Existing projects stay in the app library.
2. Open the **All notes** canvas. Its summary and collection both use `collectionKey: notes`. Other collection keys create separate datasets in the same app.
3. Select the collection to configure its title, subtitle, create-button label, view, search, folders, backups, and initial seed records. Seed records initialize a new collection only; changing seeds does not replace saved user notes.
4. Connect `data.recordSelected` to the record editor. It carries `{ collection, recordId }`. An empty record ID opens a new draft; the first edit creates a persistent note. Connect the editor's `data.closed` event to the desired collection page.
5. Add collection blocks with `view: favorites`, `archive`, or `trash`. They use the same records; these are filtered views, not copied data.
6. Turn off **In navigation** on an editor page. The page remains available to its event connections. Collection and editor blocks also work together on one composed page.
7. Use **Preview** or **Open app** to test real saved records. Canvas thumbnails and individual-block design previews use temporary records and cannot change the running app's notes.
8. Export the web or mobile source using the existing export controls. The runtime and storage module are included in each export.

Web folders can be created, renamed, or removed while moving their notes to Inbox. Native folders can be created and merged into Inbox; native backup export uses the share sheet and import accepts pasted backup JSON. The web formatting toolbar wraps selected text; native formatting controls insert Markdown. These platform differences are intentional and visible.

## Data and recovery contract

Records contain an ID, title, body, folder, tags, favorite/pinned/archive/trash flags, and creation/update timestamps. Backup format version is `1`. Imports reject malformed records, duplicate IDs, invalid dates, and unsupported versions before writing. Imports merge by ID, preserving a local record when its timestamp is newer than the backup. Permanent deletion removes the record; a previously exported backup can still restore it.

App IDs remain stable across renaming and project-file imports. Creating another app assigns a fresh ID, even when its name and slug match an existing app. Record storage is scoped by app ID and collection key. Web storage is also scoped by browser profile and origin; the Studio preview, a separately hosted export, and a native install have separate stores. Move notes between them with backups.

Native writes are serialized to avoid older autosave writes completing after newer edits. Save indicators distinguish loading, saving, successful persistence, and failures. Failed writes retain an in-memory copy for backup export. Corrupt storage is not silently replaced by sample records; importing a valid backup is an explicit recovery path. Web lists refresh on storage events from other tabs, but simultaneous editing is not a collaborative conflict-resolution system.

## Verification

- Created Paper through the actual Studio UI and manually verified a new note's title, body, folder, tags, and editor URL after refresh.
- Automated browser workflows cover template creation/configuration, navigation visibility, note editing/autosave, Markdown/checklists, search, favorites, pinning, archive, trash/restore/permanent deletion, folder management, backup validation/merge, app isolation, temporary design previews, phone-width layout, missing-record links, same-page collection/editor composition, and disconnected-action feedback.
- Portable storage tests cover reloading, rapid asynchronous writes, deletion without reseeding, filtering, folder reassignment, backup merging, invalid imports, duplicate seeds, corruption recovery, write failures, and independent stores.
- Both targets compile with no unmet wires. Standalone web TypeScript and production builds pass. Standalone Expo TypeScript and Android Metro/Hermes export pass. AsyncStorage is pinned to the version listed by the generated Expo SDK's `bundledNativeModules.json`.

Screenshots are generated by the browser regressions under `.builder-cache/proof/notes-app.png`, `notes-editor.png`, and `notes-phone.png`. Test projects use an isolated server and do not modify the user's existing app library.

## What this result proves, and what remains

Studio can now build and export a complete **local notes app** through its block graph, with real editable persistent records. The browser app has been exercised end to end. The native export has been typechecked and bundled; a physical-device/emulator interaction test and a signed native build remain release checks.

This is a fixed text-record collection model, not an arbitrary database-schema designer. General API/condition/action nodes, cloud accounts and sync, collaboration/conflict resolution, attachments, reminders, encryption, and managed deployment remain separate product layers. The new web data blocks participate in the element designer; native data blocks support outer-block styling and added controls, while detailed styling of their internal native controls currently requires exported-source edits. Live AI functionality still requires a configured provider; the default assistant is a labelled recorded demo.

The separate [Paper Cloud template](paper-cloud-setup.md) now implements real web accounts, private Supabase notes, onboarding, optimistic save conflicts, plan quotas, and manually verified UPI testing. The local template retains device storage. Arbitrary schemas, collaboration, attachments, reminders, native cloud integration, and managed deployment remain further work.

Those limits do not prevent creating, using, backing up, and exporting Paper today.
