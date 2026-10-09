# Compiler front-end and back-ends

`prepareProject(graph, registry)` is the shared semantic front-end. It validates input, migrates graph versions, and reuses the wiring engine's resolved instances. Both public compile entry points call this front-end and then their target emitter. Studio compile/export use the persisted v1 graph, preserving target declarations; the editor's compatibility view remains a read/edit adapter.

IR version `1` contains stable source IDs, authored order, the lossless compatibility graph, resolved versions/config/variants/placement/ports, incoming payload JSON Schemas in wire order, shared theme defaults, resolved navigation destinations, the wiring report and target/capability declarations. It contains no TS syntax, ASTs, functions, providers, Maps, Sets or timestamps. Configuration defaults are resolved once. Payload-to-TypeScript conversion, component naming, imports, JSX, platform styling and files belong to emitters.

The front-end clones registry/source data and deeply freezes the owned IR. Registry objects remain mutable and independent. A private weak map records validation and the implementation registry; emitters reject forged/deserialized IR and a different registry. Serialized IR is useful for inspection; it is not an unchecked remote compiler input. Re-prepare the original graph before emission.

`src/backends/web.ts` and `src/backends/native.ts` accept the same IR and check target capabilities explicitly. `src/files.ts` owns common output contracts and sorted path/content SHA-256 hashing. The compatibility exports (`compileProject`, `compileWebProject`, `CompileError`, pinned Expo dependencies, schemaToTs, hashFiles) remain available.

Unused palette instances remain unplaced. Native preserves its existing ignore-with-note behavior; web still hydrates registered palette defaults and rejects unknown types. Unsupported nested layouts, bindings, data execution, flows and agents reject in the front-end. Cloud account/payment blocks continue rejecting native emission.

The split retains original per-file/project hashes for five web and four native examples. The original golden fixture is unchanged. No rebaseline was used for this step; the single allowed rebaseline remains reserved for block source vending.
