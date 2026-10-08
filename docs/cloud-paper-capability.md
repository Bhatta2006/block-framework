# Cloud Paper capability contract

## Capability

Paper becomes a real account-based notes app built from reusable Studio blocks. Google and confirmed-email authentication, saved onboarding, per-user Supabase PostgreSQL records, and Free / INR 500 / INR 1000 access plans replace the corresponding demo behavior in this new template. Existing local Paper apps remain independent.

## Constraints

- The user selected Paper and exact INR prices 0, 500, and 1000. They specified personal UPI for testing, not a merchant gateway or public payment launch.
- Personal UPI payment uses a genuine UPI URI and QR code. A customer claim is not a payment confirmation. Only the verified owner can approve after checking the actual bank receipt.
- Paid access is a 30-day prepaid pass with manual renewal, not an automatic debit or claimed recurring UPI subscription. Duration is configurable by the operator. No money is sent during automated testing.
- No provider account credentials are placed in source, graph JSON, browser bundles, logs, or exports. Provider credentials are configured separately.
- Authenticated cloud mode fails closed when configuration or providers fail. It never silently substitutes local persistence or a simulated sign-in.
- Ownership and limits are enforced server-side and with database policies. Clients cannot grant their own entitlements or approve payments.
- Existing accounts, notes, graphs, and app IDs are preserved. Creating the cloud template adds an independent app.

## Actors and surfaces

Customers use signup/login, email verification/recovery, onboarding, notes, plans, checkout, and account settings. The owner uses a restricted payment-review panel. Operators configure Supabase, Google OAuth, SMTP, environment variables, migrations, backups, and HTTPS hosting.

## States and interfaces

Authentication: signed out → verification required / Google OAuth → signed in → onboarding required → account ready. Recovery sessions can only set a new password until completed. Sign-out invalidates the application session.

Payment: pending → submitted → approved or rejected. Approval is idempotent and audited. Approval changes access only after owner confirmation. Expired passes fall back to Free limits; existing notes remain readable and removable.

Collection saves use optimistic revisions. Conflicting writes fail visibly rather than overwriting a different device's changes. Server validation limits record counts and payload size. Export/recovery lets the user preserve an unsaved snapshot.

## Data and security

Supabase is the source of truth for profiles, collections, payment claims, entitlements, and sessions. Authentication is verified through Supabase Auth. Web application sessions use random opaque HttpOnly cookies; provider credentials in session rows are encrypted with an operator-managed key. Browser state never contains provider access or refresh tokens.

Mutations require an explicitly allowed Origin and JSON requests. Google and default-template email flows use PKCE with a protected short-lived verifier cookie. An optional token-hash callback is also supported. Sessions, payment decisions, and entitlements are inaccessible to user SQL writes. RLS isolates collections by auth.uid(). Rate limits and request size limits apply to the backend. Stale-tab account identity headers prevent a previously open editor from saving into a different signed-in account.

## Scope

First working production-services target is responsive web with a deployable backend. Native exports must explicitly identify target limitations until equivalent real account/session/payment transport is supported; they must not emit mock native auth for a cloud project.

## Open setup dependencies

The dedicated Paper Cloud Supabase project, protected schema, API integration, local authentication callbacks, Google client/provider, and two Google test users are configured. Google login, onboarding, cloud save/reload, and both UPI checkout amounts were verified against the real services. The team email is confirmed. Default Supabase SMTP remains limited to the organization's team email by the user's choice. Public SMTP, public HTTPS hosting, broader Google audience, and actual bank receipt verification remain outside this local test setup. New passwords, account terms, and provider identity verification require the user's participation at the relevant step.

## Handoff

Implemented as five reusable blocks, shared cloud runtime, generated backend/migration, and a Cloud notes template. See [setup and verification](paper-cloud-setup.md) for configuration, actual live outcomes, and remaining release steps.
