# ADR-0002: Separate web and native UI implementations

Date: 2026-10-09. Status: accepted architecture; Puck adoption remains an evaluation.

## Decision

Use separate web (shadcn/Radix/Tailwind) and native (React Native Reusables/NativeWind) implementations with shared TypeScript logic and design tokens. Studio chrome and application tokens remain separate. Keep today's CSS and native templates through Phase 0, except the three reference packages. Do not add a shell redesign or migrate all blocks.

Use Style Dictionary in the later token pipeline; define the portable token contract now. NativeWind stable 4.2.7 does not establish compatibility with the web Tailwind v4 toolchain: native installation/Metro/New Architecture must be checked separately before Phase 1 adopts it.

## Reuse and health

| Project          | Checked version/release | License    | Integration                                 |
| ---------------- | ----------------------- | ---------- | ------------------------------------------- |
| shadcn CLI       | 4.21.4, 2026-10-07      | MIT        | Registry format; later vendor UI            |
| Radix dialog     | 1.2.0, 2026-10-05       | MIT        | Later dependency                            |
| Tailwind         | 4.3.3, 2026-07-16       | MIT        | Web only initially                          |
| NativeWind       | 4.2.7, 2026-09-14       | MIT        | Later native dependency                     |
| RN Reusables     | repository source       | MIT        | Later vendor selected components            |
| Style Dictionary | 5.6.0, 2026-10-03       | Apache-2.0 | Later build-time dependency; Node >=22      |
| Puck             | 0.23.0, 2026-08-07      | MIT        | Isolated Design spike only                  |
| Craft            | 0.2.12, 2025-02-14      | MIT        | Reference; outside six-month release window |

Radix/Puck declare React 19 support. Puck recent closed issue sample #1854 was resolved on October 7; top human contributors include chrisvxd and FedericoBonel. RN Reusables has a dominant maintainer (mrzachnugent); recent sampled closed issues are from June. Its compatibility is not assumed from its license. Recheck source revision/release and render on the pinned Expo toolchain before adopting native UI.

## Alternatives

Tamagui 2.7.7 (2026-08-15) supports React >=19 but package metadata lacks a license field: source/package licensing requires further verification if reconsidered. A universal component layer increases export coupling. react-native-web alone limits native web semantics. Keep both as alternatives, not installed dependencies.

## Puck spike

Time box: three hours after reference migration. Render Hero, Collection and Account from real implementations with isolated data/cloud previews. Translate edits into graph operations; test ordering, selection, config edits, locked paths and round-trip stability. Puck data is never saved as an independent app graph. Record integration cost, React compatibility, bundle impact and limitations here; no product commitment follows automatically.

Sources: [shadcn license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md), [RN Reusables license](https://github.com/founded-labs/react-native-reusables/blob/main/LICENSE), [NativeWind](https://github.com/nativewind/nativewind), [Puck license](https://github.com/puckeditor/puck/blob/main/LICENSE), [Style Dictionary](https://github.com/style-dictionary/style-dictionary).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
