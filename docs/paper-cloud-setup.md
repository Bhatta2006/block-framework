# Paper Cloud: setup and verification

Paper Cloud is a working responsive web application built from the Block Studio graph. It uses real Supabase Auth and PostgreSQL rather than local or simulated accounts. The running local app is at http://127.0.0.1:8787; Studio is at http://127.0.0.1:5174.

## Reusable features added to Studio

| Block or feature           | What it provides                                                                        | Reuse                                                              |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `auth.account`             | Google OAuth, confirmed email signup/login, recovery/reset, sign-out                    | Real account entry point for another cloud app                     |
| `onboarding.profile`       | Two-step profile/focus setup persisted per account                                      | Gates unfinished accounts and supports later profile edits         |
| `billing.plans`            | Free, INR 500 Plus, INR 1000 Pro, UPI QR/link, claim/history                            | Payment UI connected to server-owned prices                        |
| `account.settings`         | Verified identity, current plan, profile/plans navigation                               | Account management and owner-only review navigation                |
| `billing.review`           | Restricted payment queue, bank receipt acknowledgement, audited approval/rejection      | Manual personal-UPI test workflow                                  |
| Cloud collection transport | Private notes, revisions, quotas, save feedback, conflict recovery                      | Existing record collection/editor/summary blocks use cloud storage |
| Cloud app template/export  | Ten-page graph, backend URL setting, Node server, SQL, environment template, Dockerfile | Start another app with an explicit service setup                   |

All five new blocks support the existing individual-element design workflow, including the automatically displayed login/onboarding gates. Account and plan transitions have explicit event ports. Web-only cloud export is enforced; the responsive phone preview remains available.

Cloud autosave combines rapid edits, preserves the latest unsaved draft on a failed write, stops later queued writes after a conflict, and offers an unsaved backup export. A late refresh cannot overwrite a newer local edit. Protected account headers reject writes from a stale tab after the signed-in account changes.

## Current configured services

- Dedicated Supabase project: **Paper Cloud**, reference `lgggewxaavslvnxswzdo`, Singapore Free tier.
- Six protected tables: profiles, collections, payments, entitlements, sessions, payment audit. RLS separates user records; session/audit and payment grants require server access.
- Supabase Site URL: `http://127.0.0.1:8787`. Allowed callbacks: `/auth/callback` and `/auth/confirm` on that origin.
- Google project: `paper-cloud-511018`; web client **Paper Cloud web**. Google callback is the Supabase `/auth/v1/callback` URL. Google provider is enabled with nonce checking retained.
- Google external testing users: `pdcstmoments@gmail.com` and `ramakrishnavbhat.cs24@rvce.edu.in`.
- Confirmed email accounts are required. Default Supabase email templates work with PKCE; open signup/recovery links in the browser that initiated them. Confirmation in another browser can still verify the email, after which password sign-in works. Restart recovery in the browser where its link will open.
- By user choice, default SMTP is used for the team email only. Public email delivery needs custom SMTP.
- UPI recipient: `9480106354@slc`; verified owner email: `pdcstmoments@gmail.com`.
- Paid access defaults to **30-day prepaid passes**, configurable with `PAID_ACCESS_DAYS`. There is no recurring debit. Free allows 25 notes, Plus 1,000, Pro 10,000. The database enforces the limit across collections; expired access keeps existing notes readable and editable.

Provider credentials and the persistent session encryption key are stored separately in ignored local server environment files, with the credential directory and active environment restricted to the current Windows user. Exports contain blank credential fields. Keep the encryption key stable across restarts and restrict access to the server environment.

## Build another app with these features

1. In Studio, choose **Switch apps → Create app → Cloud notes**. Edit its pages, blocks, copy, designs, and connections.
2. Export **Web application**. The ZIP includes `CLOUD-SETUP.md`, `.env.example`, `.gitignore`, backend source, migration, and Dockerfile.
3. Give each independently deployed app its own dedicated Supabase project and backend origin. Connecting two graphs to the same backend shares that service's accounts, notes, and plans; changing the Studio app name does not provision an isolated database.
4. Apply the migration, enable confirmed email/Google, set the exact callback URLs, and configure server secrets privately. For local development, use a separate port if another app is already running.
5. Run `npm install`, `npm run build`, then `npm start`. Set **Developer tools → Cloud services → Backend URL** to that app's origin. Canvas thumbnails use temporary data; opening the connected app performs real service operations.
6. Change owner, UPI recipient, access duration, and public origin through the environment. The supplied backend's paid tiers and quotas implement the Paper use case; different prices, data types, and business entitlements require corresponding server/database extensions.

## Actual verification

Verified on October 8–9, 2026:

- Google account selection and consent returned through the real Supabase callback into Paper.
- Saved onboarding completed for the team account.
- A note titled **Cloud setup verification** saved to the real database and survived a full reload and server restart. Existing onboarding/session state also survived.
- The same live account and note loaded through Studio's interactive preview, confirming the graph-built app uses the connected service. Ordinary-account navigation to the owner page was denied, and profile editing reopened the saved name.
- Both paid choices produced real UPI URIs and QR codes with the exact INR amounts and recipient. Checkout rows remained pending. No money was transferred and no bank receipt or paid grant was represented as verified.
- The team email was confirmed through Supabase. Real password authentication was exercised by separate provider test fixtures; the team's own password sign-in and recovery completion still need a user-run check.
- Nine live database checks passed: authenticated save; denied cross-user reads/profile writes; denied direct collection writes/session reads/privileged grants; enforced Free quota; rejected malformed tags; rejected stale revisions. These used two separate real provider fixtures, not proof of customer email delivery. The sanitized result is [cloud-live-verification.json](cloud-live-verification.json).
- Unit tests exercise the actual exported server with controlled upstream responses, including encrypted sessions, identity checks, fixed payment amounts, receipt acknowledgement, PKCE/recovery restrictions, and write conflicts. UI service fixtures only verify frontend contracts and are separate from live provider evidence.
- Final checks: **203 unit tests passed**, root/UI TypeScript and lint passed, all **19 block SDK validations passed**, and the generated app passed TypeScript/production build. Existing browser regressions and four cloud UI checks passed in Firefox and Chromium, including safe owner-control design previews. Root and generated-app dependency audits reported zero known vulnerabilities. The twenty-file source ZIP passed the export audit and includes a blank environment template and ignore rules. A scan of tracked/unignored workspace files found no configured provider credentials.

Evidence: [live app inside Studio](design/paper-cloud-inside-studio.png), [persisted cloud note](design/paper-cloud-persisted-note.png), [Google test audience](design/google-test-users-ready.png), [UPI checkout](design/paper-cloud-upi-checkout.png), [enabled Google provider](design/supabase-google-enabled.png).

## Before a public release

The current deployment is local and intentionally uses personal UPI for testing. Public release still needs HTTPS hosting and real origin/callback configuration, custom SMTP and email recovery testing, an appropriate Google audience/branding setup, and a payment method suitable for the intended launch. The owner must sign in with the configured owner email and check actual bank receipts before approving paid access. Actual bank-app payment acceptance and owner receipt/grant are not yet live-verified. No public deployment was performed.

Monitor authenticated provider readiness in addition to `/healthz` (which is only process liveness). Configure trusted reverse-proxy rate limits, keep database backups, clean expired server sessions periodically, and protect service/encryption keys. Native account/payment export, arbitrary data schemas, collaboration, and automatic merchant receipt verification remain separate capabilities.
