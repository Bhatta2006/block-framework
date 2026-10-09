# Better Auth + Expo + generated Hono evaluation

Status, 2026-10-09: real API assertions, client/server typechecks, and Android JavaScript bundle generation passed. Physical-device login is deferred at the user's request. This fixture does not establish native SecureStore persistence or close the production native-cloud gap.

## Reproduce without a phone

Use Node 24 or later. Build the framework from the repository root with `npm run build`. From this directory:

```powershell
npm run generate
Push-Location .generated
npm install
Pop-Location
npm run typecheck
npm test
Push-Location .generated
npx expo export --platform android --output-dir dist-android --no-bytecode --max-workers 2
Pop-Location
```

The generator starts with the actual migrated Notes graph and native compiler output, then overlays the checked-in auth client/server templates. It does not enable a new compiler target. Direct dependencies are pinned in the generator; `.generated/package-lock.json` records the local install and is ignored along with generated artifacts. A fresh install can resolve different transitive dependencies; rerun its audit when reproducing.

The test creates a temporary SQLite database and random credentials, then removes them. It checks signup/login, wrong password, unauthenticated/authenticated protected requests, invalid cookies, rejected origins, database restart with an existing session, and logout revocation. This is an API integration test; it does not simulate an Android operating system.

## Resume device verification later

1. Run `npm run api` in this directory. In another terminal, run `npm start -- --port 8082`.
2. With an authorized Android device and Expo Go SDK 57, use Android platform tools to forward the two local ports: `adb reverse tcp:8788 tcp:8788` and `adb reverse tcp:8082 tcp:8082`. Reconnects can clear these mappings.
3. Open `exp://127.0.0.1:8082` in Expo Go. The API binds only to the computer's loopback interface; USB forwarding makes it reachable for this fixture.
4. Probe the protected API while signed out: expect 401. Sign up with a disposable account; expect a visible session and protected API 200.
5. Close/reopen the fixture and verify the same session and 200. Restart the API and verify again. Sign out; expect 401. Sign back in and repeat.
6. Stop the two development servers and remove these two reverse mappings after the test.

API state and its generated session secret live in ignored `.state/`; secrets are not graph fields or generated source. Use only disposable credentials. The HTTP cookie setting and Expo development origins are local evaluation settings; deployment requires a separate production configuration review.

## Findings and limits

The Expo Go fixture pins screens 4.26.0 and safe-area-context 5.7.0 to the SDK 57 ABI, without changing production compiler output. Expo recommends newer TypeScript/types than the repository uses; the current fixture typechecks with TypeScript 5.9.3. Android export bundled 647 modules successfully; no APK, signing, store submission or real-device auth success is claimed.

The isolated dependency audit reported 23 affected packages (16 high, seven moderate). Compatible remediation and native execution remain prerequisites for production adoption. See [ADR-0006](../../docs/adr/0006-auth-default.md) for licenses, decisions, exact limitations and advisory links. The API/build checks are the retained partial verification after the user deferred phone testing.
