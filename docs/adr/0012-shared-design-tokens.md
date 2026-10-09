# ADR-0012: Shared generated design tokens

Date: 2026-10-09. Updated: 2026-10-10. Status: accepted; shared-token export checkpoint implemented.

## Decision and reuse

Implement ADR-0002's separate web/native UI strategy. Generate a real shared theme package only when both applications consume it. Reuse Style Dictionary 5.6.0 (Apache-2.0, October 3 release) for token resolution and platform conversion, and Material Color Utilities 0.3.0 (Apache-2.0, June 24, 2024 release) for brand-derived tonal palettes. Both licenses meet the plan allowlist. The latest color release, 0.4.0, fails Node's ESM loader because its public entry imports extensionless internal modules. Use the previous compatible published release rather than patching dependency internals. It is outside the six-month release window; this small deterministic build-time dependency is pinned and tested against known colors rather than assumed current. Do not implement a color algorithm from scratch.

Checked the official repositories, npm metadata and APIs before implementation. The existing profile cascade already supplies brand/background/text colors; use those as inputs. Preserve explicit background and text choices. Token source includes light/dark semantic colors, primary/neutral/success/warning/danger palettes, typography, spacing, radius, shadow and motion. Emit W3C-shaped typed values and resolve references through Style Dictionary without filesystem writes or timestamp headers.

Keep graph JSON canonical. Generated CSS, native values and Tailwind mappings are derived artifacts; no Studio runtime dependency is permitted. Web Tailwind 4.3.3 and native NativeWind 4.2.7/Tailwind 3 use separate tooling as required by their supported installations. Native runtime checks use the existing pinned Expo toolchain. Adopting native styling does not prove physical-device behavior.

## Scope and verification

Reach compiler workspace composition, theme generation/formatting, both application consumers, package scripts, hashes, fixtures and setup documentation. First integrate values derived from the existing theme; later canonical-token editing must preserve every graph field through operations, storage and undo. Do not silently accept declarations a target ignores.

Check determinism, brand propagation, reference resolution, shared consumers and malformed inputs. Independently typecheck/lint/format/test/build generated SaaS and Notes workspaces. Preserve Phase 0 hashes; record intentional professional-workspace fixture changes. Run all repository gates before each commit.

Sources: [Style Dictionary API](https://styledictionary.com/reference/api/), [built-in formats](https://styledictionary.com/reference/hooks/formats/predefined/), [Style Dictionary license](https://github.com/style-dictionary/style-dictionary/blob/main/LICENSE), [Material Color Utilities](https://github.com/material-foundation/material-color-utilities), [color utilities license](https://github.com/material-foundation/material-color-utilities/blob/main/LICENSE), [NativeWind installation](https://www.nativewind.dev/docs/getting-started/installation), [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite).

## Checkpoint behavior and limits

The multi-target workspace emits `packages/theme`, consumed through `@app/theme` by web CSS and the native theme module. The existing profile's three colors feed a full portable token source. Style Dictionary resolves references into CSS and native TypeScript values, with explicit duration conversion and native dimensions in px. Light/dark semantic values and reduced-motion overrides are available. Existing legacy blocks retain some fixed styles; this checkpoint does not claim complete dark-mode restyling or a canonical token editor.

The same authored `theme-build.ts` is vendored into the export. The theme package has its own typecheck and build commands; Turbo rebuilds it before application builds and caches its actual outputs. Editing `tokens.json` works independently of Studio. Build dependencies are declared in that package, and no Studio package enters generated runtime code. Canonical serialization before token generation keeps first-build and subsequent-build order identical. Broken references and unsupported native units fail rather than emit placeholder values.

The new `phase1-saas-theme.json` deliberately records package paths, source hashes and the audited ZIP. Prior workspace and Phase 0 fixtures remain unchanged. Tests cover deterministic generation, brand propagation, reference resolution, invalid colors, foreground contrast selection, native duration conversion, rejected units and export/rebuild equivalence. Physical-device verification remains deferred at the user's request. The wider UI-library adoption, nested trees/slots, v2 catalog and Studio shell remain Phase 1 work.

Checkpoint verification on October 10 passed repository typecheck, lint, 264 unit tests, Studio build and 68 browser tests. Independently installed SaaS and Notes exports passed theme/web/native typechecks, lint, formatting, generated DOM tests and web/Android/iOS bundle builds. Production SaaS acceptance passed in Chromium and Firefox with theme switching and reduced motion. Direct rebuild probes on both exports confirmed byte equivalence, propagation of edited tokens and preservation of previous output when reference resolution fails. These checks do not establish physical-device behavior or GitHub-hosted CI results.
