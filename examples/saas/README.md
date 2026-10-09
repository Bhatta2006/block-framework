# Launchpad: Phase 1 SaaS acceptance example

This schema-v1 graph composes existing Hero, text, metrics, collection, summary and editor blocks into a landing page and project dashboard. The landing CTA opens the dashboard; selecting a brief opens the editor; edits persist on the device. The team metrics are visibly labeled sample data. No accounts, shared cloud database, payments or production service setup are implied.

From the repository root:

```powershell
npm run build
node packages/compiler/dist/cli.js compile examples/saas/graph.json --target workspace --out .audit-work/phase1/saas-workspace
```

Inside that output, run `git init` to give Turbo its own repository boundary, install with the pnpm version pinned in package.json, and follow the generated README. Commit pnpm-lock.yaml before enabling the generated GitHub Actions workflow. The root `test` command runs web DOM tests; native apps are typechecked and bundled without claiming device execution.

For the browser acceptance check, start the exported web app on port 5202 (`pnpm --filter app-web dev --host 127.0.0.1 --port 5202`). From the Block Studio repository root run `node examples/saas/acceptance.mjs`. It uses the repository's installed Playwright browsers and verifies the actual exported app in Chromium and Firefox. Set `BLOCKFW_SAAS_URL` to use another server. Each check uses a fresh browser context and only local fixture data.

This is the functional starting fixture for the Phase 1 golden SaaS app. The professional UI/token migration, Lighthouse ≥90, accessibility audit and independent engineering review remain acceptance work; the current fixture does not claim to satisfy the whole phase.
