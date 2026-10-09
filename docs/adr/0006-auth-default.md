# ADR-0006: Better Auth default; preserve Paper Supabase

Date: 2026-10-09. Status: accepted default architecture; API/build evaluation passed; device proof deferred by the user.

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

### Evaluation findings

The four-hour-box evaluation is preserved in [spikes/native-auth](../../spikes/native-auth/README.md). It starts with the existing Notes native compiler output and overlays a disposable Expo client and Hono API. This is an isolated evaluation generator, not a new supported production compiler target. Better Auth creates its schema before the handler starts. SQLite persists sessions across API restarts; the session secret is created at runtime outside the generated sources.

Automated assertions passed for signup, login, wrong-password denial, protected endpoint 401/200, invalid cookies, foreign-origin rejection, database restart, and logout revocation. Both client and server typecheck. Metro exported the Android JavaScript bundle successfully (647 modules). These checks exercise the actual auth library and generated API, but do not prove Android SecureStore persistence, on-device networking or native UI behavior.

A connected Android phone had Expo Go installed, but the fixture did not reach a verified login because the local development-server connection failed. On 2026-10-09 the user explicitly requested simulation or deferral and continuation. Physical-device execution is therefore deferred, not passed; no mocked result substitutes for it. The local development servers were stopped. Resume the documented device checklist before claiming the native-cloud gap is closed.

Expo Go SDK 57 expects react-native-screens 4.26.0 and react-native-safe-area-context 5.7.0; only the isolated fixture uses those pins. The existing compiler pins and export hashes are unchanged. Expo also recommended newer TypeScript and React type definitions; the fixture passes with the repository's TypeScript 5.9.3 and React types 19.2.3. Verify this compatibility again for a production development build.

The installed packages used by the spike report allowlisted MIT licenses: Better Auth and its Expo/core packages 1.7.7, Hono 4.13.13, @hono/node-server 2.1.4, better-sqlite3 13.0.3, its types 9.6.0, and the Expo SecureStore/network/linking/constants/browser modules. SQLite is a disposable spike store; it does not decide the later generated production database. Sources: [better-sqlite3 license](https://github.com/WiseLibs/better-sqlite3/blob/master/LICENSE), [Hono Node adapter license](https://github.com/honojs/node-server/blob/main/LICENSE), [Expo license](https://github.com/expo/expo/blob/main/LICENSE).

The isolated Expo dependency audit reports 23 affected packages (16 high, seven moderate), propagating three advisories in braces, node-forge and uuid. This is an unresolved dependency gate for publication, not evidence of a production-ready mobile export. The suggested forced repair would downgrade Expo incompatibly and was not applied. Track [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), and [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq); assess runtime/build exposure and compatible fixes before adoption.

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
