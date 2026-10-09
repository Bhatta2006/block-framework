# ADR-0004: Router choices and compatibility

Date: 2026-10-09. Status: accepted future choices; existing routing retained in Phase 0.

## Decision

Keep current web hash navigation and native React Navigation emission unchanged in Phase 0. The v1 page contract carries stable route/navigation metadata; migrated routes preserve existing IDs and order. Preserve explicit -> semantic -> next-page -> terminal precedence, same-page payload delivery, cut suppressions, hidden pages and tabs.

For later new export architecture choose TanStack Router for Vite and Expo Router for native. SSR/Next.js is a later optional backend, not a Phase 0 default. Reject route patterns/guards that have no executable backend rather than accepting decorative metadata as working security.

## Reuse and health

TanStack React Router 1.170.41 (2026-09-30), MIT, declares React >=18/19 and Node >=20.19. Expo Router 57.0.25 (2026-10-06), MIT, declares Expo/React/RN peers and additional Expo dependencies; never add it without matching our pinned SDK. TanStack sampled closed issue #8641 resolved October 8; contributors include tannerlinsley, schiller-manuel and SeanCassiere. Existing React Navigation is already installed/generated and must remain during the compatibility phase.

## Alternatives

Switching current apps immediately would break URL hashes, links, payloads and output hashes. Next.js adds an SSR deployment architecture that simple local exports do not need. Keep those choices out of this refactor.

## Verification

Existing navigation/browser-back, record deep-link, same-page consumer and hidden/tab navigation tests stay green. Add v1 migration tests proving wire order and destinations are unchanged.

Sources: [TanStack license](https://github.com/TanStack/router/blob/main/LICENSE), [Expo Router source/license](https://github.com/expo/expo/tree/main/packages/expo-router), [npm TanStack metadata](https://registry.npmjs.org/@tanstack/react-router/1.170.41), [npm Expo metadata](https://registry.npmjs.org/expo-router/57.0.25).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
