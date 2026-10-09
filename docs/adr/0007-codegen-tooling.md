# ADR-0007: Vendored TSX with ts-morph composition

Date: 2026-10-09. Status: accepted; spike results pending.

## Decision

Adopt ts-morph 28.0.0 (MIT) as a compiler dependency, reuse pinned Prettier 3.9.9 (MIT) for formatting, and reuse the shadcn registry item format for file/dependency distribution. No Plop/Biome/monorepo toolchain change is required now. Config is typed props, not JSX source interpolation. The compiler vendors source and only constructs composition/imports/wiring.

Block package format v2 extends the existing block contract and registry rather than requiring a new package manager. Keep v0 blocks working during incremental migration. Only content.hero, data.collection, auth.account migrate in Phase 0. Support declarations describe executable implementations; auth.account native remains rejected. Each real file is included in framework typecheck/lint/render tests. Preserve existing stable element IDs and design/action semantics.

The manifest carries package format, implementation files, dependencies, license and §6.3 capability metadata. Registry distribution uses shadcn registry:block files, targets and dependency declarations. Optional server/data directories are not scaffolded when unused. Required files reject traversal, missing/duplicate destinations, undeclared imports and unsupported targets. Every output is independently installable without @blockfw runtime packages.

## Reuse and health

ts-morph 28.0.0 released 2026-04-12 (within six months on the research date). Recent sampled closed issue #1685 resolved September 7; dsherret has 2,226 contributions vs next contributors 17/7: explicit maintainer-concentration risk. Bundled compiler version may differ from root TypeScript; test emitted output using the existing 5.9.3 compiler. Prettier 3.9.9 released September 23. Both are build-time tooling, not React/RN runtime dependencies.

Babel types 8.0.6 (MIT; September 18) and the installed TypeScript factory are alternatives. ts-morph reduces import/JSX assembly effort; do not introduce a second AST stack. shadcn format is MIT; copying third-party components must also retain their own license notices.

## Composition spike

Time box: three hours. Produce Hero and Collection web files and generated page composition from the same graph. Compare output layout, dependencies, bundle size, typing, events, data stores and designs. Repeat emission/hash and ZIP checks. Record measured results here before making v2 default.

One deliberate hash rebaseline is reserved for integrating these vendored implementations. The original fixture stays in Git and a second fixture documents changed paths and why. Compiler extraction and graph migration are not excuses for unexplained output drift.

Sources: [ts-morph license](https://github.com/dsherret/ts-morph/blob/latest/LICENSE), [ts-morph setup](https://ts-morph.com/setup/), [shadcn registry items](https://ui.shadcn.com/docs/registry/registry-item-json), [shadcn license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [Prettier](https://github.com/prettier/prettier).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
