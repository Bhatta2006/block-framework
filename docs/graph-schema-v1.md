# Application graph schema v1

The authoritative schema is `packages/manifest/src/schema/project-graph-v1.json`; TypeScript contracts are in `packages/manifest/src/graph-v1.ts`. Schema versions are strings. Unknown versions fail validation. The Studio project wrapper retains numeric `version: 1`, profile, and touched paths.

| Section    | Contract                                                                                                                                             | Phase 0 execution                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| app        | Name, slug, semver, targets (`web`, `ios`, `android`), optional dataId/layout                                                                        | Existing metadata; target declarations checked |
| theme      | Recursive named DTCG token groups, `$type` and `$value` leaves                                                                                       | Existing primary/background/text color tokens  |
| pages      | Stable IDs, ordered component roots, primaryComponent, title, lane, layout, positions, navigation/cuts; optional route/params/guards/redirect/parent | Existing flat pages and routing                |
| components | Block nodes with type@version/config/variant/design/position, optional slots/bindings; layout nodes with children                                    | Flat blocks; nesting and bindings reject       |
| data       | Entities/JSON Schema fields/indexes, relations/cardinality, policies, seeds                                                                          | Empty; execution deferred                      |
| flows      | IDs, trigger, typed step declarations and edges                                                                                                      | Empty; execution deferred                      |
| services   | Stable ID, provider, optional publicUrl, references to declared environment names                                                                    | Existing Supabase binding with ID `cloud`      |
| agents     | ID, service reference, model, tools                                                                                                                  | Empty; execution deferred                      |
| env        | Name, server/public scope, required flag; never a value                                                                                              | Empty; binding execution deferred              |
| wires      | Existing instance event to page/consumer/port references                                                                                             | Existing precedence and payload checks         |
| i18n       | Default locale, locales, message dictionaries                                                                                                        | Omitted; execution deferred                    |
| extensions | Package-namespaced JSON                                                                                                                              | Compatibility presence flags only              |

`validateAppGraphV1` validates shape, unique IDs, references, environment references, component placement and cycles. Block-specific configuration and wiring payload compatibility remain the wiring resolver's responsibility. `legacyGraph` rejects every unsupported executable declaration: it never drops a data model, guard, flow, service, binding, or agent silently.

## Migration and storage

`migrateGraph(unknown)` validates v0 before calling `migrate0To1`, or validates and copies v1. It never mutates its input. `legacyGraph` produces the temporary screen/block view consumed by the current UI and emitters. There is no second saved graph. App catalogs (including deleted apps) and project files save v1 after successful validation. HTTP responses keep the compatibility shape during Phase 0 so existing editor callbacks and agent touched paths remain stable.

The `blockfw.compatibility` extension stores only `composedPages` and `themePresent`. These distinguish an omitted composition/theme from an explicitly authored one without duplicating values. Positions, design actions, cut wires, explicit empty arrays, theme values, ordering, unplaced blocks, cloud URL presence and dataId survive round trips. Local examples declare all three targets; cloud examples declare web only.

The five original example files remain v0 migration fixtures. Compiler regression tests migrate each on load and compare every supported target against its original emitted files and SHA-256 hash. The unsupported Paper Cloud native target continues to reject. A deliberate block-vending rebaseline is reserved for the final Phase 0 step.

No credentials are declared in `env` or service bindings. Public URLs use the existing restricted URL contract. Credentials belong in the exported backend's environment. Version/content pins belong in `blockfw.lock.json`, produced by the compiler's resolved block contract, rather than another editable graph.
