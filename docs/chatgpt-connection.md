# Use your ChatGPT plan in Block Studio

Open **AI assistant → Continue with ChatGPT**. Sign in on OpenAI's authorization page, choose the account/workspace, and allow ChatGPT plan usage. Return to Studio, acknowledge the first-use confirmation, and select a model. Enter an instruction, review the proposed changes, and apply them. No OpenAI API key or client secret is required for this local/open-source flow.

OpenAI currently documents eligibility for ChatGPT Plus and Pro users. Access depends on the selected account/workspace, granted permissions, model availability and plan/app limits. **Manage usage** opens [ChatGPT usage settings](https://chatgpt.com/settings/usage). This authorization connects Studio's AI editor; it does not implement authentication in exported apps or grant access to ChatGPT conversations.

## Remembered connections

Connections survive server restarts. Each saved account/workspace registration has its own issued client ID, verified identity, model selection and token set. Accounts with the same email remain distinct. Choose another connected account in the picker, use **Continue with ChatGPT** to add a registration, or reconnect a saved registration after signing out.

The app generates a persistent host UUID. First sign-in uses OpenAI's dynamic registration entry point; later sign-ins reuse the issued client ID and host ID. OAuth state, nonce and PKCE values are new for each attempt. A dedicated callback listener binds only to `127.0.0.1`, using `/auth/callback` and an available port. The exact callback URI is reused during code exchange. Unfinished attempts can be cancelled and expire after five minutes.

The Node runtime validates the ID token's signature, issuer, audience, expiry, subject and nonce before activating a connection. Identity sign-in alone does not enable AI requests: the granted `chatgpt.tokens.use.direct` scope is required. Models are discovered using that account's access token; Studio does not assume a fixed model is available.

Credentials are stored outside the repository in an AES-256-GCM encrypted file, with its encryption key in Windows Credential Manager, macOS Keychain, or Linux Secret Service. Storage locations are:

- Windows: `%LOCALAPPDATA%/BlockStudio/chatgpt.enc`
- macOS: `~/Library/Application Support/BlockStudio/chatgpt.enc`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/BlockStudio/chatgpt.enc`

Tokens do not enter browser storage, project graphs, exported source, ZIP files, or usage responses. If the OS credential store is locked/unavailable, unlock/configure it and retry; Studio does not fall back to plaintext token storage. Unix directories/files use owner-only permissions. A per-runtime storage lock prevents multiple Studio processes from racing rotating refresh tokens. Close the other Studio instance before connecting another server to the same saved credential store.

## Requests and recovery

Studio sends authenticated requests to the public `/v1/responses` endpoint with `store: false`, `stream: true`, developer instructions, and a user-input array. It requires a completed stream and uses provider-reported token usage. Unsupported ChatGPT-plan request fields, including `max_output_tokens`, are omitted. Requests have a local timeout and response-size bound. This flow does not impose a server-side output-token cap.

Tokens refresh near expiry. Refreshes are serialized and replacement access/refresh tokens are saved together. Expired or revoked sessions ask for reconnection. Usage-limit and model-permission failures give actionable feedback and a Manage usage link; they never silently substitute demo responses.

Changing accounts/models or signing out invalidates pending plans and cancels active inference. Reviewed-edit undo history remains available. **Sign out** attempts remote refresh-token revocation, clears local tokens, and retains the account/client mapping for reconnection. If revocation cannot be confirmed, Studio explains that the user should disconnect the app in ChatGPT settings. With no connected ChatGPT account, Studio uses the configured environment provider or its clearly labelled recorded demo.

ChatGPT connections are enabled only on the local Studio server. Hosted/commercial deployment needs an appropriate approved OpenAI integration and application-session architecture; this local flow is not a remote multi-user authentication system.

## Verification

Automated tests use generated RSA-signed identities and mocked OpenAI transport. They cover dynamic registration, PKCE, incorrect state, declined consent, invalid nonce/audience/signature, plan-scope enforcement, model discovery, Responses request shape, chunked streams, incomplete/failed streams, token rotation, separate same-email registrations, revocation, usage limits, and HTTP origin/host protection. Browser tests cover the sign-in controls, polling, model selection, first-use confirmation, sign-out, cancellation and credential-store errors.

These tests make no paid model requests and do not sign into the user's account. Live authorization and inference must be verified by the user completing the OpenAI sign-in flow. Existing notes-app and Studio regressions remain part of the suite.

Official references: [registration/sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [accounts/sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), and [UI guidelines](https://developers.openai.com/siwc/ui-ux-guidelines).
