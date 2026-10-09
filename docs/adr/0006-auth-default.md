# ADR-0006: Better Auth default; preserve Paper Supabase

Date: 2026-10-09. Status: accepted default architecture; native proof pending spike.

## Decision

Choose Better Auth for future generic generated APIs, with its official Expo integration. Keep today's Supabase Paper Cloud adapter, sessions, RLS, quotas and payment enforcement intact. Do not silently port existing accounts or enable native Paper Cloud exports after a fixture login succeeds.

Use Hono for the isolated generated-API spike and later full-stack backend. Better Auth delegates actual authentication/session handling; we do not hand-build auth. Reference auth.account remains a real cloud-web component with explicit web support.

## Reuse and health

better-auth/@better-auth/expo 1.7.7 (2026-09-30), MIT. Hono 4.13.13 (2026-10-04), MIT. Better Auth declares React 18/19; Expo plugin requires SecureStore, network/linking/browser/constants peers. Verify against our Expo 57 pins rather than copying the official SDK-55 guide verbatim. Better Auth sampled closed issues #11646/#11645 were closed October 9; principal contributors Bekacru, himself65 and bytaesu provide active maintenance. Auth/security updates require ongoing dependency review.

## Alternatives

Supabase remains supported for Paper and is an alternative provider. Clerk is a commercial service, not vendored auth implementation. Ory/Keycloak add operational services; defer enterprise adapters.

## Native/Hono spike

Time box: four hours. Generate a disposable Hono API and Expo client from checked templates with private runtime environment and a temporary database. Verify signup/login, session persistence, protected endpoint denial before login/after logout, invalid sessions, and device-reachable origin. Verify actual Expo execution when an emulator/device is available; API/unit or RN mocks are not native proof. Record prerequisites/failures instead of declaring success at timeout. No credentials or populated database enter the graph or export.

Sources: [Better Auth license](https://github.com/better-auth/better-auth/blob/main/LICENSE.md), [Expo integration](https://better-auth.com/docs/integrations/expo), [Hono integration](https://better-auth.com/docs/integrations/hono), [Hono license](https://github.com/honojs/hono/blob/main/LICENSE).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
