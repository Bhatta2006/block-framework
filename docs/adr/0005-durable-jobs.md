# ADR-0005: Postgres-backed durable jobs

Date: 2026-10-09. Status: accepted future default; no executor in Phase 0.

## Decision

Choose pg-boss as the default future durable-job adapter, with graphile-worker as the fallback candidate. Both reuse Postgres so a generated app does not require Redis just for jobs. Define workflow/job declarations without generating a pretending executor. Nonempty flows reject Phase 0 compilation.

Later jobs must preserve idempotency, retries/backoff, transactional enqueue, tenant identity and cancellation. Secrets and live provider objects are not job payloads. The graph names capabilities; runtime credentials come from deployment environment.

## Reuse and health

pg-boss 12.37.1 (2026-10-08), MIT, Node >=22.12; graphile-worker 0.18.0 (2026-09-08), MIT, Node >=22.18. pg-boss sampled issue #958 was closed October 8; contributors timgit/kibertoad/bcomnes demonstrate activity but a dominant maintainer remains a bus-factor risk. Both ship TypeScript contracts; React/RN peer compatibility is irrelevant for server-only jobs.

Do not pin these into existing exports yet; doing so raises Node/runtime requirements without an implemented feature. Recheck licensing and transitive dependencies at Phase 2 adoption.

## Alternatives

BullMQ introduces Redis. Managed Trigger.dev adds a separate service/deployment choice. Neither is needed for this foundation. Building a durable scheduler ourselves is not approved core IP.

Sources: [pg-boss license](https://github.com/timgit/pg-boss/blob/master/LICENSE), [Graphile Worker license](https://github.com/graphile/worker/blob/main/LICENSE.md), [pg-boss npm metadata](https://registry.npmjs.org/pg-boss/12.37.1), [Graphile npm metadata](https://registry.npmjs.org/graphile-worker/0.18.0).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
