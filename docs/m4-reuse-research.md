# M4 Reuse Research — Export & Device Delivery (subagent report)

**Date:** October 8, 2026
**Note:** This research arrived after M4 implementation was complete. The
implementation already aligns with its recommendations (`archiver` v8,
EAS/Gradle/Expo Go strategy). Filed here for reference.

## Key validation of M4 choices

- ✅ **`archiver` v8 (MIT)** — subagent confirms REUSE. I already used it.
- ✅ **EAS Build as primary** — aligns with `docs/android-build-guide.md`.
- ✅ **Expo Go as Fallback #1** — aligns with demo strategy.
- ✅ **Web export as Fallback #2** — noted for future.

## Loud flags (from subagent)

- ⚠️ **`jszip`: (MIT OR GPL-3.0-or-later)** — REJECTED. Dual license includes GPL.
- ⚠️ **`adm-zip`: MIT but CVE-ridden** — CVE-2026-77301 (CVSS 8.7), CVE-2026-76845 (CVSS 6.5). REJECTED on security track record.

## Open items noted by subagent

1. Generated `app.json` should include `"web": { "bundler": "metro", "output": "static" }` for web export fallback.
2. EAS needs `eas.json` build profiles — consider generating as part of export.
3. ZIP audit test should be a CI step (currently in unit tests).

---

## Full subagent report

# M4 Reuse/Research Log — Export & Device-Delivery Path

**Date:** October 8, 2026
**Scope:** ZIP export tooling, Android installable build routes, Expo Go fallback, web export fallback for the Block Framework demo.

## Category 1 — ZIP export tooling

| Package | Link | License | Health | Verdict |
|---|---|---|---|---|
| `archiver` | https://www.npmjs.com/package/archiver | **MIT** (pure; all 9 transitive deps MIT) | Excellent: v8.0.0, updated May 2026, industry standard for streaming archives, ~40KB unpacked | **REUSE** |
| `adm-zip` | https://www.npmjs.com/package/adm-zip | MIT | ⚠️ **Poor security track record**: CVE-2026-77301 (CVSS 8.7 HIGH, decompression bomb, fixed in 0.6.1), CVE-2026-76845 (CVSS 6.5, symlink traversal via 0.6.0), CVE-2018-1002204 (Zip-Slip). Current v0.6.1. | **REJECT** — repeated extraction CVEs; we only need write, but the track record is disqualifying when a clean alternative exists |
| `jszip` | https://www.npmjs.com/package/jszip | ⚠️ **(MIT OR GPL-3.0-or-later)** — dual license includes GPL-3.0 | Excellent: v3.10.2, actively maintained | **REJECT — GPL FLAGGED LOUDLY.** Dual MIT/GPL means MIT use is legally possible, but the project's license policy says flag GPL. With pure-MIT `archiver` available, there is no reason to accept GPL-adjacent risk. |
| `yazl` | https://www.npmjs.com/package/yazl | MIT | Moderate: streaming, but smaller community than archiver | **REJECT** — archiver supersedes it on adoption and docs |
| `zip-a-folder` / `zip-lib` / `zip-local` | npm | MIT (various) | Low-to-moderate maintenance, thin wrappers | **REJECT** — unnecessary abstraction over archiver |

**Recommendation:** `archiver` v8. Use `archive.directory()` or `archive.glob()` with ignore patterns (`node_modules/**`, `.git/**`, `*.keystore`, `.env*`) to build the export ZIP server-side. Streaming = constant memory even for large projects. Zero license risk.

**Secrets audit note:** the export code must explicitly exclude: `node_modules/`, `.git/`, `*.keystore`, `.env*`, `android/local.properties`, `ios/` build artifacts, and any `EXPO_*` secrets. This is a code-level guarantee, not a library feature — add a test that scans the ZIP listing.

## Category 2 — Android installable build: route comparison

| Route | Reliability | Speed | Cost | Setup effort | Verdict |
|---|---|---|---|---|---|
| **EAS Build (cloud)** via `eas-cli` (MIT, v24.12.0, official Expo tool) | **High** — managed infra, managed signing, reproducible | 5–15 min/build + free-tier queue (low priority, 1 concurrency, 45-min timeout) | **Free: 15 Android + 15 iOS builds/month** (verified Sept 2026 pricing; Starter $19/mo beyond that) | Low: Expo account + `eas login` + `eas build:configure` (one-time) | **REUSE — primary route** |
| **Local Gradle** via `npx expo prebuild --platform android` + `./gradlew assembleRelease` | High once set up | 10–15 min cold (downloads ~2GB SDK deps), <2 min warm | Free, unlimited | **High**: JDK 17 + Android SDK + signing keystore config. Must be done *before* demo day, not during. | **REUSE — pre-built fallback.** Build the APK in advance; sideload via `adb install` or file share. |
| `eas build --local` | Medium | Slower than plain Gradle on some hosts; pulls large local toolchain | Free | Medium-high: still needs local SDK + EAS auth | **REJECT** — worse than both above: slower than plain Gradle, still needs EAS login, no advantage for our case |
| React Native CLI / bare workflow from scratch | Medium | Slow | Free | Very high | **REJECT** — we generate Expo projects; ejecting to bare RN throws away the Expo advantage |
| Capacitor | N/A | N/A | N/A | N/A | **REJECT** — wrong ecosystem; our output is React Native/Expo, not a webview wrapper |

**Why EAS cloud is primary for the demo:** the demo machine needs zero native toolchain. The failure modes (queue wait, network) are mitigated by building the APK *days before* demo day and keeping the binary as the artifact — the live "build" moment in the demo can be the already-built APK installing, not a 15-minute Gradle run on stage.

**Credential boundary:** EAS needs an Expo account + token (`EXPO_TOKEN`). Per project rules, the user provides this as an environment variable; the pipeline must work up to the auth step without it and print exact instructions for the final step.

## Category 3 — Expo Go fallback (no build required)

- **Mechanism:** `npx expo start` in the generated project → terminal QR code → scan with Expo Go app (Play Store/App Store) → app loads over LAN. `npx expo start --tunnel` if LAN peer-to-peer is blocked (needs Expo login).
- **License/cost:** Expo Go is a free app; no build quota consumed; no new dependencies.
- **Fit:** Perfect live-demo fallback — shows real-time edits via Fast Refresh. Limitation: only works with Expo SDK modules (our generated app uses only Expo SDK modules, so this holds).
- **Verdict:** **REUSE as Fallback #1.** Zero setup, zero build time, most reliable live moment.

## Category 4 — Web export fallback

- **Mechanism:** `npx expo export --platform web` → static `dist/` (`index.html`, `_expo/` bundles, `assets/`) → serve with any static host (`npx serve dist`) or deploy to Vercel/Netlify/Cloudflare Pages.
- **Requirements:** `app.json` needs `"web": { "bundler": "metro", "output": "static" }` — the generator must emit this.
- **License/cost:** Built into `expo` CLI (MIT); hosting free tiers suffice for demo.
- **Fit:** Good last-resort fallback (browser tab if phone fails). Limitation: React Native-for-Web rendering; minor visual differences vs. native.
- **Verdict:** **REUSE as Fallback #2.** Already proven: M3's CI runs `expo export --platform android`; adding `--platform web` is trivial.

## Recommended demo-day strategy (reliability-ordered)

1. **Pre-built APK via EAS** (built days before, binary in hand) — the "installable app" Wow moment.
2. **Expo Go QR** — the "live edit on a real phone" moment (Fast Refresh).
3. **Web export** — the "it also runs in a browser" safety net.

All three must be rehearsed; the runbook picks the fallback per failure mode.

## License summary

No GPL/AGPL/unclear licenses among REUSE verdicts. One loud flag:
- ⚠️ **`jszip`: (MIT OR GPL-3.0-or-later)** — rejected; use `archiver` (pure MIT) instead.
- ⚠️ **`adm-zip`: MIT but CVE-ridden** (CVE-2026-77301 CVSS 8.7, CVE-2026-76845 CVSS 6.5) — rejected on security track record.

Everything recommended (`archiver`, `eas-cli`, `expo` CLI) is MIT with clean transitive trees.

## Dependency cost

| Addition | Size | Transitive deps |
|---|---|---|
| `archiver@8` | ~40KB unpacked | 9 (all MIT) |
| `eas-cli` | ~5.9MB unpacked | ~19 direct (standard CLI weight; dev-only, not shipped in ZIP) |

`eas-cli` is a build-time/dev dependency only — it never enters the exported ZIP. `archiver` is a small server-side addition to `@blockfw/builder`.

## Open items for the parent agent

- The generated project's `app.json`/`app.config` must include the `"web"` static-export config for Fallback #2 to work — verify the compiler emits it.
- EAS needs `eas.json` build profiles (`preview` → APK, `production` → AAB); generate this as part of the export pipeline.
- The ZIP audit test (no secrets, no `node_modules`, no absolute paths) should be a CI step, not just documentation.
