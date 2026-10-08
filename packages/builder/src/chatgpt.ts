import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from 'jose';
import type { CompletionRequest, CompletionResponse, LlmProvider } from '@blockfw/agent';
import { ChatGPTVault, type ConnectionVault } from './chatgpt-vault.js';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const TOKEN_ENDPOINT = ISSUER + '/api/accounts/oauth/token';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const USAGE_URL = 'https://chatgpt.com/settings/usage';
interface Tokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}
interface Account {
  id: string;
  subject?: string;
  email?: string;
  name?: string;
  model?: string;
  scopes: string[];
  expiresAt: number;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  welcomed?: boolean;
}
interface Saved {
  version: 1;
  hostId: string;
  activeId?: string;
  accounts: Account[];
}
export interface ChatGPTModel {
  slug: string;
  display_name: string;
}
export interface ChatGPTStatus {
  activeId?: string;
  accounts: Array<{
    id: string;
    label: string;
    connected: boolean;
    planEnabled: boolean;
    model?: string;
  }>;
  pending: boolean;
  error?: string;
  notice?: string;
  welcome: boolean;
  usageUrl: string;
}
interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  ticket: string;
  clientId?: string;
  redirectUri: string;
  authorizationUrl: string;
  server: Server;
  timeout: ReturnType<typeof setTimeout>;
}
export interface ChatGPTOptions {
  vault?: ConnectionVault;
  fetch?: typeof fetch;
  verifyIdentity?: (token: string, clientId: string, nonce?: string) => Promise<JWTPayload>;
  onChange?: () => void;
}

/** OAuth credentials and inference live exclusively in the local Node runtime. */
export class ChatGPTConnection {
  private saved?: Saved;
  private pending?: Pending;
  private error?: string;
  private notice?: string;
  private queue: Promise<unknown> = Promise.resolve();
  private catalogs = new Map<string, ChatGPTModel[]>();
  private requests = new Set<AbortController>();
  private revision = 0;
  private loginGeneration = 0;
  private processing = false;
  private readonly vault: ConnectionVault;
  private readonly http: typeof fetch;
  private readonly verify: NonNullable<ChatGPTOptions['verifyIdentity']>;
  private onChange: () => void;
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private discovery?: Promise<{ jwks_uri: string; revocation_endpoint?: string }>;

  constructor(options: ChatGPTOptions = {}) {
    this.vault = options.vault ?? new ChatGPTVault();
    this.http = options.fetch ?? fetch;
    this.onChange = options.onChange ?? (() => undefined);
    this.verify =
      options.verifyIdentity ??
      (async (token, clientId, nonce) => {
        const discovery = await this.discover();
        this.jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri), { [customFetch]: this.http });
        const { payload } = await jwtVerify(token, this.jwks, {
          issuer: ISSUER,
          audience: clientId,
          requiredClaims: ['sub', 'exp', 'iat'],
          algorithms: ['RS256', 'ES256'],
          clockTolerance: 5,
        });
        if (nonce && payload.nonce !== nonce) throw new Error('Identity verification failed.');
        return payload;
      });
  }
  setOnChange(callback: () => void) {
    this.onChange = callback;
  }

  private load() {
    if (this.saved) return this.saved;
    const raw = this.vault.read() as Saved | undefined;
    if (
      raw &&
      (raw.version !== 1 || !Array.isArray(raw.accounts) || !raw.hostId?.startsWith('urn:uuid:'))
    )
      throw new Error('Saved ChatGPT connection has an unsupported format.');
    this.saved = raw ?? { version: 1, hostId: 'urn:uuid:' + randomUUID(), accounts: [] };
    return this.saved;
  }
  private persist(next: Saved) {
    this.vault.write(next);
    this.saved = next;
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work, work);
    this.queue = task.catch(() => undefined);
    return task;
  }
  private changed() {
    this.revision++;
    for (const request of this.requests) request.abort();
    this.onChange();
  }
  status(): ChatGPTStatus {
    const data = this.load();
    const active = data.accounts.find((a) => a.id === data.activeId);
    return {
      activeId: data.activeId,
      accounts: data.accounts.map((a, i) => ({
        id: a.id,
        label: `${a.email ?? a.name ?? 'ChatGPT account'} · connection ${i + 1}`,
        connected: !!a.accessToken,
        planEnabled: !!a.accessToken && a.scopes.includes(PLAN_SCOPE),
        model: a.model,
      })),
      pending: !!this.pending || this.processing,
      error: this.error,
      notice: this.notice,
      welcome: !!active?.accessToken && active.scopes.includes(PLAN_SCOPE) && !active.welcomed,
      usageUrl: USAGE_URL,
    };
  }
  provider(fallback: LlmProvider): LlmProvider {
    const status = this.status();
    const active = status.accounts.find((a) => a.id === status.activeId);
    if (!active?.connected) return fallback;
    const revision = this.revision;
    return {
      name: 'chatgpt',
      model: active.model ?? '(choose a model)',
      complete: async (request) => {
        if (revision !== this.revision)
          throw new Error('ChatGPT connection changed. Plan the edit again.');
        return this.complete(active.id, active.model, request);
      },
    };
  }
  private async discover() {
    this.discovery ??= (async () => {
      const response = await this.http(ISSUER + '/.well-known/openid-configuration', {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('OpenAI sign-in discovery is unavailable. Try again.');
      const data = (await response.json()) as {
        issuer: string;
        jwks_uri: string;
        revocation_endpoint?: string;
      };
      if (
        data.issuer !== ISSUER ||
        new URL(data.jwks_uri).origin !== ISSUER ||
        (data.revocation_endpoint && new URL(data.revocation_endpoint).origin !== ISSUER)
      )
        throw new Error('Invalid OpenAI discovery response.');
      return data;
    })().catch((error) => {
      this.discovery = undefined;
      throw error;
    });
    return this.discovery;
  }

  async start(clientId?: string) {
    return this.exclusive(async () => {
      if (this.pending || this.processing)
        throw new Error('A ChatGPT sign-in is already open. Cancel it before starting another.');
      const generation = ++this.loginGeneration;
      const data = this.load();
      const returning = clientId ? data.accounts.find((a) => a.id === clientId) : undefined;
      if (clientId && !returning) throw new Error('Unknown ChatGPT connection.');
      this.persist(data); // Reserve a stable host ID and check protected storage before opening login.
      this.error = undefined;
      this.notice = undefined;
      const state = randomBytes(32).toString('base64url');
      const nonce = randomBytes(32).toString('base64url');
      const verifier = randomBytes(48).toString('base64url');
      const ticket = randomBytes(32).toString('base64url');
      const server = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        const pageNonce = randomBytes(16).toString('base64');
        res.setHeader(
          'Content-Security-Policy',
          `default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; style-src 'nonce-${pageNonce}'`,
        );
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const pending = this.pending;
        if (req.method !== 'GET' || !pending || pending.server !== server) {
          res.writeHead(404);
          res.end();
          return;
        }
        if (url.pathname === '/auth/start' && url.searchParams.get('ticket') === ticket) {
          res.writeHead(302, { Location: pending.authorizationUrl });
          res.end();
          return;
        }
        if (url.pathname !== '/auth/callback') {
          res.writeHead(404);
          res.end();
          return;
        }
        const returned = url.searchParams.get('state') ?? '';
        if (
          Buffer.byteLength(returned) !== Buffer.byteLength(state) ||
          !timingSafeEqual(Buffer.from(returned), Buffer.from(state))
        ) {
          res.writeHead(400);
          res.end('Sign-in could not be verified. Return to Block Studio.');
          return;
        }
        this.pending = undefined;
        clearTimeout(pending.timeout);
        this.processing = true;
        void this.exclusive(async () => {
          try {
            if (url.searchParams.has('error'))
              throw new Error('ChatGPT sign-in was declined. You can try again.');
            const code = url.searchParams.get('code');
            const issued = url.searchParams.get('client_id') ?? returning?.id;
            if (
              !code ||
              !issued ||
              issued === 'dynamic_agent_client' ||
              (returning && issued !== returning.id)
            )
              throw new Error('ChatGPT registration was incomplete. Try signing in again.');
            // Save the issued registration before exchanging its single-use code.
            const current = structuredClone(this.load());
            if (!current.accounts.some((a) => a.id === issued)) {
              current.accounts.push({ id: issued, scopes: [], expiresAt: 0 });
              this.persist(current);
            }
            const tokens = await this.exchange(
              new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: issued,
                code,
                code_verifier: verifier,
                redirect_uri: pending.redirectUri,
                resource: RESOURCE,
              }),
            );
            if (!tokens.id_token) throw new Error('OpenAI did not return a verified identity.');
            let identity: JWTPayload;
            try {
              identity = await this.verify(tokens.id_token, issued, nonce);
            } catch {
              throw new Error('ChatGPT identity could not be verified. Sign in again.');
            }
            if (!identity.sub || (returning?.subject && identity.sub !== returning.subject))
              throw new Error('The signed-in ChatGPT account did not match this connection.');
            if (generation !== this.loginGeneration)
              throw new Error('ChatGPT sign-in was cancelled.');
            const next = structuredClone(this.load());
            const account = next.accounts.find((a) => a.id === issued)!;
            Object.assign(account, {
              subject: identity.sub,
              email: typeof identity.email === 'string' ? identity.email : undefined,
              name: typeof identity.name === 'string' ? identity.name : undefined,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              idToken: tokens.id_token,
              scopes: (tokens.scope ?? '').split(/\s+/).filter(Boolean),
              expiresAt: Date.now() + tokens.expires_in * 1000,
            });
            next.activeId = issued;
            this.persist(next);
            this.changed();
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(
              `<!doctype html><title>Connected to Block Studio</title><style nonce="${pageNonce}">body{font:16px system-ui;max-width:600px;margin:64px auto;padding:24px;line-height:1.6}</style><body><h1>ChatGPT connected</h1><p>Return to Block Studio to choose a model and review AI edits. You can close this tab.</p></body>`,
            );
          } catch (error) {
            this.error = error instanceof Error ? error.message : 'ChatGPT sign-in failed.';
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('ChatGPT sign-in could not complete. Return to Block Studio for details.');
          } finally {
            this.processing = false;
            server.close();
          }
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const port = (server.address() as { port: number }).port;
      const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
      const authorization = new URL(ISSUER + '/api/accounts/authorize');
      authorization.search = new URLSearchParams({
        client_id: returning?.id ?? 'dynamic_agent_client',
        ...(returning
          ? returning.email
            ? { login_hint: returning.email }
            : {}
          : { agent_name_hint: 'Block Studio' }),
        ext_agent_host_id: data.hostId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
        resource: RESOURCE,
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      }).toString();
      // A one-use local redirect keeps OAuth URLs/identity hints out of UI JSON.
      const timeout = setTimeout(() => {
        this.cancel();
        this.error = 'ChatGPT sign-in timed out. Try again.';
      }, 5 * 60_000);
      timeout.unref();
      this.pending = {
        state,
        nonce,
        verifier,
        ticket,
        clientId,
        redirectUri,
        authorizationUrl: authorization.toString(),
        server,
        timeout,
      };
      return { url: `http://127.0.0.1:${port}/auth/start?ticket=${ticket}` };
    });
  }
  cancel() {
    this.loginGeneration++;
    if (!this.pending) return;
    clearTimeout(this.pending.timeout);
    this.pending.server.close();
    this.pending = undefined;
  }

  private async exchange(body: URLSearchParams): Promise<Tokens> {
    const res = await this.http(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401)
        throw new Error('ChatGPT authorization expired or was revoked. Sign in again.');
      throw new Error('OpenAI token service is unavailable. Try again.');
    }
    const tokens = (await res.json()) as Tokens;
    if (
      !tokens.access_token ||
      tokens.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    )
      throw new Error('OpenAI returned an invalid token response.');
    return tokens;
  }
  private async token(id: string) {
    return this.exclusive(async () => {
      const account = this.load().accounts.find((a) => a.id === id);
      if (!account?.accessToken) throw new Error('Sign in with ChatGPT to continue.');
      if (!account.scopes.includes(PLAN_SCOPE))
        throw new Error('ChatGPT plan usage was not enabled. Reconnect and allow plan usage.');
      if (account.expiresAt > Date.now() + 60_000) return account.accessToken;
      if (!account.refreshToken) throw new Error('ChatGPT session expired. Sign in again.');
      let tokens: Tokens;
      try {
        tokens = await this.exchange(
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: id,
            refresh_token: account.refreshToken,
            resource: RESOURCE,
          }),
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes('revoked')) {
          const next = structuredClone(this.load());
          const expired = next.accounts.find((a) => a.id === id)!;
          delete expired.accessToken;
          delete expired.refreshToken;
          delete expired.idToken;
          this.persist(next);
          this.changed();
        }
        throw error;
      }
      if (tokens.id_token) {
        const identity = await this.verify(tokens.id_token, id);
        if (identity.sub !== account.subject)
          throw new Error('Refreshed ChatGPT identity did not match. Sign in again.');
      }
      const next = structuredClone(this.load());
      const renewed = next.accounts.find((a) => a.id === id)!;
      Object.assign(renewed, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        idToken: tokens.id_token ?? account.idToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scopes:
          tokens.scope === undefined ? account.scopes : tokens.scope.split(/\s+/).filter(Boolean),
      });
      this.persist(next);
      if (!renewed.scopes.includes(PLAN_SCOPE))
        throw new Error('ChatGPT plan usage is no longer enabled. Reconnect to continue.');
      return renewed.accessToken!;
    });
  }
  async models(): Promise<ChatGPTModel[]> {
    const id = this.load().activeId;
    if (!id) throw new Error('Connect a ChatGPT account first.');
    const revision = this.revision;
    const token = await this.token(id);
    const res = await this.http(RESOURCE + '/models', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(this.requestError(res.status));
    const data = (await res.json()) as { models?: Array<ChatGPTModel & { visibility: string }> };
    const models = (data.models ?? [])
      .filter(
        (m) =>
          m.visibility === 'list' &&
          typeof m.slug === 'string' &&
          typeof m.display_name === 'string',
      )
      .map((m) => ({ slug: m.slug, display_name: m.display_name }));
    if (revision !== this.revision || this.load().activeId !== id)
      throw new Error('ChatGPT account changed. Reload models.');
    this.catalogs.set(id, models);
    return models;
  }
  async select(id: string) {
    await this.exclusive(async () => {
      const next = structuredClone(this.load());
      if (!next.accounts.some((a) => a.id === id && a.accessToken))
        throw new Error('Sign in to this ChatGPT connection first.');
      next.activeId = id;
      this.persist(next);
      this.error = undefined;
      this.notice = undefined;
      this.changed();
    });
  }
  async selectModel(model: string) {
    await this.exclusive(async () => {
      const next = structuredClone(this.load());
      const active = next.accounts.find((a) => a.id === next.activeId);
      if (!active || !this.catalogs.get(active.id)?.some((m) => m.slug === model))
        throw new Error('Choose a model from your ChatGPT account catalog.');
      active.model = model;
      this.persist(next);
      this.changed();
    });
  }
  async acknowledgeWelcome() {
    await this.exclusive(async () => {
      const next = structuredClone(this.load());
      const active = next.accounts.find((a) => a.id === next.activeId);
      if (active) {
        active.welcomed = true;
        this.persist(next);
      }
    });
  }
  async signOut(id: string) {
    this.cancel();
    this.changed();
    await this.exclusive(async () => {
      const next = structuredClone(this.load());
      const account = next.accounts.find((a) => a.id === id);
      if (!account) throw new Error('Unknown ChatGPT connection.');
      let revoked = !account.refreshToken;
      if (account.refreshToken) {
        for (let attempt = 0; attempt < 2 && !revoked; attempt++) {
          try {
            const discovery = await this.discover();
            if (discovery.revocation_endpoint) {
              const response = await this.http(discovery.revocation_endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  token: account.refreshToken,
                  token_type_hint: 'refresh_token',
                  client_id: id,
                }),
                signal: AbortSignal.timeout(10_000),
              });
              revoked = response.status === 200;
            }
          } catch {
            /* Still clear local credentials; report unconfirmed remote revocation. */
          }
          if (!revoked && attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      delete account.accessToken;
      delete account.refreshToken;
      delete account.idToken;
      account.scopes = [];
      account.expiresAt = 0;
      if (next.activeId === id) delete next.activeId;
      this.persist(next);
      this.catalogs.delete(id);
      this.notice = revoked
        ? 'Signed out of ChatGPT.'
        : 'Signed out locally. Remote revocation was not confirmed; disconnect Block Studio in ChatGPT settings.';
      this.changed();
    });
  }
  private requestError(status: number) {
    if (status === 429)
      return 'ChatGPT usage limit reached. Open Manage usage to review your plan or app limits.';
    if (status === 401) return 'ChatGPT session is no longer accepted. Reconnect your account.';
    if (status === 403)
      return 'ChatGPT plan usage or this model is unavailable for your account. Manage usage or choose another model.';
    return `ChatGPT request failed (${status}). Try again.`;
  }
  private async complete(
    id: string,
    model: string | undefined,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    if (!model) throw new Error('Choose a ChatGPT model before planning an edit.');
    const revision = this.revision;
    const token = await this.token(id);
    if (revision !== this.revision) throw new Error('ChatGPT connection changed. Plan again.');
    if (this.requests.size)
      throw new Error('A ChatGPT edit is already running. Wait for it to finish.');
    const controller = new AbortController();
    this.requests.add(controller);
    try {
      const res = await this.http(RESOURCE + '/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructions: request.system,
          input: [{ role: 'user', content: request.user }],
          store: false,
          stream: true,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
      });
      if (!res.ok) throw new Error(this.requestError(res.status));
      if (!res.body) throw new Error('ChatGPT returned an empty stream.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let completed = false;
      let bytes = 0;
      let usage: CompletionResponse['usage'] | undefined;
      const event = (frame: string) => {
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') return;
        const value = JSON.parse(data) as {
          type: string;
          delta?: string;
          response?: { status?: string; usage?: { input_tokens: number; output_tokens: number } };
        };
        if (value.type === 'response.output_text.delta') text += value.delta ?? '';
        if (['response.failed', 'response.incomplete', 'error'].includes(value.type))
          throw new Error(
            'ChatGPT could not complete this edit. Try again or review Manage usage.',
          );
        if (value.type === 'response.completed') {
          if (value.response?.status !== 'completed')
            throw new Error('ChatGPT response did not complete.');
          completed = true;
          const reported = value.response.usage;
          if (
            reported &&
            Number.isFinite(reported.input_tokens) &&
            Number.isFinite(reported.output_tokens)
          )
            usage = { inputTokens: reported.input_tokens, outputTokens: reported.output_tokens };
        }
      };
      try {
        while (!completed) {
          const chunk = await reader.read();
          if (chunk.done) {
            buffer += decoder.decode();
            if (buffer.trim()) event(buffer);
            break;
          }
          bytes += chunk.value.length;
          if (bytes > 4 * 1024 * 1024)
            throw new Error(
              'ChatGPT response exceeded the local size limit. Narrow the edit scope.',
            );
          buffer += decoder.decode(chunk.value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            event(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
          }
        }
      } finally {
        await reader.cancel();
      }
      if (!completed || !text || !usage)
        throw new Error(
          'ChatGPT stream ended without a complete edit and usage report. Try again.',
        );
      if (revision !== this.revision) throw new Error('ChatGPT connection changed. Plan again.');
      return { text, usage };
    } finally {
      this.requests.delete(controller);
    }
  }
  close() {
    this.cancel();
    for (const request of this.requests) request.abort();
    this.vault.close();
  }
}
