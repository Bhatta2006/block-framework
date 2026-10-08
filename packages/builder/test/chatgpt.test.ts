import { afterEach, describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ChatGPTConnection } from '../src/chatgpt.js';
import type { ConnectionVault } from '../src/chatgpt-vault.js';
import { startCanvasServer } from '@blockfw/builder';

const connections: ChatGPTConnection[] = [];
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});
const request = { system: 'Return JSON', user: 'Change the title', maxTokens: 800 };
const fallback = {
  name: 'recorded',
  model: 'demo',
  complete: async () => ({ text: '{}', usage: { inputTokens: 0, outputTokens: 0 } }),
};

async function fixture() {
  let saved: unknown;
  const vault: ConnectionVault = {
    read: () => structuredClone(saved),
    write: (value) => {
      saved = structuredClone(value);
    },
    close: () => undefined,
  };
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'RS256', use: 'sig' };
  const controls = {
    scopes: 'openid email offline_access resource.invoke chatgpt.tokens.use.direct',
    nonce: '',
    wrongNonce: false,
    wrongAudience: false,
    badSignature: false,
    subject: 'user-1',
    clientId: 'oaiapp_test',
    stream: 'success',
    status: 200,
    expires: 3600,
    refreshes: 0,
    revocations: 0,
    issuedRefresh: 'refresh-1',
    calls: [] as Array<{ url: string; body: unknown }>,
  };
  const http: typeof fetch = async (input, init) => {
    const url = String(input);
    const body =
      init?.body instanceof URLSearchParams
        ? Object.fromEntries(init.body)
        : typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : undefined;
    controls.calls.push({ url, body });
    if (url.endsWith('/.well-known/openid-configuration'))
      return Response.json({
        issuer: 'https://auth.openai.com',
        jwks_uri: 'https://auth.openai.com/keys',
        revocation_endpoint: 'https://auth.openai.com/revoke',
      });
    if (url.endsWith('/keys')) return Response.json({ keys: [jwk] });
    if (url.endsWith('/revoke')) {
      controls.revocations++;
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/oauth/token')) {
      const refreshing = body?.grant_type === 'refresh_token';
      if (refreshing) {
        controls.refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const signing = controls.badSignature
        ? (await generateKeyPair('RS256')).privateKey
        : keys.privateKey;
      const id = await new SignJWT({
        nonce: controls.wrongNonce ? 'invalid' : controls.nonce,
        email: 'test@example.com',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer('https://auth.openai.com')
        .setAudience(controls.wrongAudience ? 'another-client' : controls.clientId)
        .setSubject(controls.subject)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(signing);
      return Response.json({
        access_token: 'access-test',
        refresh_token: refreshing ? 'refresh-2' : controls.issuedRefresh,
        id_token: id,
        token_type: 'Bearer',
        expires_in: refreshing ? 3600 : controls.expires,
        scope: controls.scopes,
      });
    }
    if (url.endsWith('/models'))
      return Response.json({
        models: [
          { slug: 'model-test', display_name: 'Test Model', visibility: 'list' },
          { slug: 'hidden', display_name: 'Hidden', visibility: 'hidden' },
        ],
      });
    if (url.endsWith('/responses')) {
      if (controls.status !== 200)
        return new Response('Do not expose this body: access-test', { status: controls.status });
      const events = [
        { type: 'response.output_text.delta', delta: '{"ops":[],"rationale":"Done"}' },
        ...(controls.stream === 'truncated'
          ? []
          : [
              {
                type: controls.stream === 'failed' ? 'response.failed' : 'response.completed',
                response: {
                  status: controls.stream === 'failed' ? 'failed' : 'completed',
                  usage: { input_tokens: 125, output_tokens: 25 },
                },
              },
            ]),
      ];
      const encoded = new TextEncoder().encode(
        events.map((event) => 'data: ' + JSON.stringify(event) + '\r\n\r\n').join(''),
      );
      return new Response(
        new ReadableStream({
          start(controller) {
            // Deliberately split SSE fields, UTF-8 and CRLF boundaries across chunks.
            for (let i = 0; i < encoded.length; i += 7) controller.enqueue(encoded.slice(i, i + 7));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    throw new Error('Unexpected network request');
  };
  const connection = new ChatGPTConnection({ vault, fetch: http });
  connections.push(connection);
  const begin = async (id?: string) => {
    const login = await connection.start(id);
    const redirect = await fetch(login.url, { redirect: 'manual' });
    const auth = new URL(redirect.headers.get('location')!);
    controls.nonce = auth.searchParams.get('nonce')!;
    return auth;
  };
  const callback = async (auth: URL, overrides: Record<string, string> = {}) => {
    const uri = new URL(auth.searchParams.get('redirect_uri')!);
    uri.search = new URLSearchParams({
      code: 'code-test',
      state: auth.searchParams.get('state')!,
      client_id: controls.clientId,
      ...overrides,
    }).toString();
    return fetch(uri);
  };
  const connect = async (id?: string) => {
    const auth = await begin(id);
    expect((await callback(auth)).status).toBe(200);
    return auth;
  };
  const ready = async () => {
    await connect();
    await connection.models();
    await connection.selectModel('model-test');
  };
  return { connection, controls, begin, callback, connect, ready, vault, saved: () => saved };
}

describe('ChatGPT connection', () => {
  it('registers with PKCE, validates signed identity, hides tokens and reuses host/client after restart', async () => {
    const f = await fixture();
    const auth = await f.connect();
    expect(auth.origin).toBe('https://auth.openai.com');
    expect(auth.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(auth.searchParams.get('agent_name_hint')).toBe('Block Studio');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('resource')).toBe('https://api.openai.com/v1');
    expect(JSON.stringify(f.connection.status())).not.toMatch(/access-test|refresh-1|idToken/);
    expect(f.connection.status().welcome).toBe(true);
    await f.connection.acknowledgeWelcome();
    expect(f.connection.status().welcome).toBe(false);
    const exchange = f.controls.calls.find((call) => call.url.endsWith('/oauth/token'))!
      .body as Record<string, string>;
    expect(exchange.client_id).toBe('oaiapp_test');
    expect(exchange.redirect_uri).toBe(auth.searchParams.get('redirect_uri'));
    expect(exchange.code_verifier?.length).toBeGreaterThanOrEqual(43);
    f.connection.close();
    const restored = new ChatGPTConnection({ vault: f.vault });
    connections.push(restored);
    const login = await restored.start('oaiapp_test');
    const next = new URL((await fetch(login.url, { redirect: 'manual' })).headers.get('location')!);
    expect(next.searchParams.get('client_id')).toBe('oaiapp_test');
    expect(next.searchParams.get('ext_agent_host_id')).toBe(
      auth.searchParams.get('ext_agent_host_id'),
    );
    expect(next.searchParams.has('agent_name_hint')).toBe(false);
    expect(next.searchParams.has('id_token_hint')).toBe(false);
  });
  it('rejects mismatched state before code exchange and handles denial without model access', async () => {
    const f = await fixture();
    const auth = await f.begin();
    expect((await f.callback(auth, { state: 'invalid' })).status).toBe(400);
    expect(f.controls.calls).toHaveLength(0);
    expect(f.connection.status().pending).toBe(true);
    expect((await f.callback(auth, { error: 'access_denied' })).status).toBe(400);
    expect(f.connection.status().error).toContain('declined');
    expect(f.connection.status().activeId).toBeUndefined();
  });
  it.each(['wrongNonce', 'wrongAudience', 'badSignature'] as const)(
    'rejects an invalid identity: %s',
    async (flag) => {
      const f = await fixture();
      f.controls[flag] = true;
      const auth = await f.begin();
      expect((await f.callback(auth)).status).toBe(400);
      expect(f.connection.status().accounts.every((a) => !a.connected)).toBe(true);
    },
  );
  it('does not treat identity sign-in as permission to use a ChatGPT plan', async () => {
    const f = await fixture();
    f.controls.scopes = 'openid email';
    await f.connect();
    expect(f.connection.status().accounts[0]?.planEnabled).toBe(false);
    await expect(f.connection.models()).rejects.toThrow('not enabled');
    expect(f.controls.calls.some((call) => call.url.endsWith('/models'))).toBe(false);
  });
  it('uses account-specific models and the supported Responses streaming contract', async () => {
    const f = await fixture();
    await f.ready();
    expect(await f.connection.models()).toEqual([
      { slug: 'model-test', display_name: 'Test Model' },
    ]);
    await expect(f.connection.selectModel('invented')).rejects.toThrow('catalog');
    const result = await f.connection.provider(fallback).complete(request);
    expect(result.usage).toEqual({ inputTokens: 125, outputTokens: 25 });
    expect(JSON.parse(result.text).ops).toEqual([]);
    const body = f.controls.calls.find((call) => call.url.endsWith('/responses'))!.body;
    expect(body).toEqual({
      model: 'model-test',
      instructions: request.system,
      input: [{ role: 'user', content: request.user }],
      store: false,
      stream: true,
    });
  });
  it.each(['truncated', 'failed'])('rejects a %s inference stream', async (stream) => {
    const f = await fixture();
    await f.ready();
    f.controls.stream = stream;
    await expect(f.connection.provider(fallback).complete(request)).rejects.toThrow(/complete/);
  });
  it('serializes refresh, saves rotated tokens and uses the issued client ID', async () => {
    const f = await fixture();
    f.controls.expires = 1;
    await f.connect();
    await Promise.all([f.connection.models(), f.connection.models()]);
    expect(f.controls.refreshes).toBe(1);
    const body = f.controls.calls.find(
      (call) => (call.body as { grant_type?: string })?.grant_type === 'refresh_token',
    )!.body;
    expect(body).toEqual({
      grant_type: 'refresh_token',
      client_id: 'oaiapp_test',
      refresh_token: 'refresh-1',
      resource: 'https://api.openai.com/v1',
    });
    expect(JSON.stringify(f.saved())).toContain('refresh-2');
  });
  it('keeps registrations separate even with identical emails and revokes only the selected connection', async () => {
    const f = await fixture();
    await f.ready();
    f.controls.clientId = 'oaiapp_second';
    await f.connect();
    expect(f.connection.status().accounts).toHaveLength(2);
    await f.connection.select('oaiapp_test');
    const old = f.connection.provider(fallback);
    await f.connection.signOut('oaiapp_test');
    expect(f.controls.revocations).toBe(1);
    await expect(old.complete(request)).rejects.toThrow('changed');
    expect(f.connection.status().accounts.find((a) => a.id === 'oaiapp_second')?.connected).toBe(
      true,
    );
    expect(f.connection.status().accounts.find((a) => a.id === 'oaiapp_test')?.connected).toBe(
      false,
    );
    expect(f.connection.status().accounts.some((a) => a.id === 'oaiapp_test')).toBe(true);
  });
  it('reports plan limits without exposing provider response bodies or falling back to demo output', async () => {
    const f = await fixture();
    await f.ready();
    f.controls.status = 429;
    await expect(f.connection.provider(fallback).complete(request)).rejects.toThrow('Manage usage');
  });
  it('protects connection endpoints against foreign origins, cross-site requests and DNS rebinding', async () => {
    const f = await fixture();
    const base = await startCanvasServer({ port: 0, chatgpt: f.connection });
    const path = base + '/api/agent/chatgpt/login';
    const blocked = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' },
      body: '{}',
    });
    expect(blocked.status).toBe(403);
    expect(
      (
        await fetch(base + '/api/agent/edit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://foreign.example',
          },
          body: JSON.stringify({ instruction: 'make it playful' }),
        })
      ).status,
    ).toBe(403);
    const rebound = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(
        path,
        { method: 'POST', headers: { Host: 'foreign.example' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(rebound).toBe(403);
    expect((await fetch(base + '/api/agent/chatgpt/status')).status).toBe(200);
    await f.ready();
    const usage = (await (await fetch(base + '/api/agent/usage')).json()) as { provider: string };
    expect(usage.provider).toBe('chatgpt');
  });
});
