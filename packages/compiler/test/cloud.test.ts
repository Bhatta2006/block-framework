import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, compileWebProject } from '@blockfw/compiler';
import { validateProjectGraph, type ProjectGraph } from '@blockfw/manifest';
// The same plain Node module is exported as the runnable app server.
// @ts-expect-error The export asset intentionally has no TypeScript declaration.
import { createAppHandler, validateCollection } from '../assets/cloud-server.mjs';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
});
const env = {
  APP_ORIGIN: 'http://127.0.0.1:8787',
  SUPABASE_URL: 'https://paper.test',
  SUPABASE_ANON_KEY: 'public-test',
  SUPABASE_SERVICE_ROLE_KEY: 'private-test',
  SESSION_ENCRYPTION_KEY: 'a'.repeat(64),
  OWNER_EMAIL: 'owner@example.com',
};
const user = {
  id: 'e167c573-2b21-476f-a1e7-acd78d4a9d58',
  email: 'person@example.com',
  email_confirmed_at: '2026-01-01',
};
const paymentId = 'e267c573-2b21-476f-a1e7-acd78d4a9d58';
async function fixture(owner = false, confirmed = true, expiresIn = 3600) {
  const calls: { url: URL; method: string; body: Record<string, unknown>; token: string }[] = [];
  let sessions: Record<string, unknown>[] = [];
  let payment: Record<string, unknown> | null = null;
  let revoked = false;
  const verifiedUser = {
    ...user,
    email: owner ? env.OWNER_EMAIL : user.email,
    email_confirmed_at: confirmed ? user.email_confirmed_at : null,
  };
  const upstream: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const token = String((init?.headers as Record<string, string>)?.Authorization);
    calls.push({ url, method, body, token });
    if (
      url.pathname === '/auth/v1/token' &&
      revoked &&
      url.searchParams.get('grant_type') === 'refresh_token'
    )
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    if (url.pathname === '/auth/v1/token')
      return Response.json({
        access_token: 'user-access',
        refresh_token: 'user-refresh',
        expires_in: expiresIn,
      });
    if (url.pathname === '/auth/v1/user')
      return revoked ? Response.json({}, { status: 401 }) : Response.json(verifiedUser);
    if (url.pathname === '/auth/v1/signup' || url.pathname === '/auth/v1/recover')
      return Response.json({});
    if (url.pathname === '/auth/v1/logout') return Response.json({});
    if (url.pathname.endsWith('/paper_sessions')) {
      if (method === 'POST') sessions.push(body);
      if (method === 'DELETE') sessions = [];
      return Response.json(sessions);
    }
    if (url.pathname.endsWith('/paper_profiles'))
      return Response.json([
        { id: user.id, full_name: 'Test', onboarding_completed_at: '2026-01-01' },
      ]);
    if (url.pathname.endsWith('/paper_entitlements')) return Response.json([]);
    if (url.pathname.endsWith('/paper_collections')) return Response.json([]);
    if (url.pathname.endsWith('/paper_payments')) {
      if (method === 'POST') payment = { ...body, id: paymentId };
      if (method === 'PATCH') payment = { ...payment, ...body };
      return Response.json(payment ? [payment] : []);
    }
    if (url.pathname.endsWith('/paper_save_collection'))
      return Response.json({ code: 'PT409', message: 'conflict' }, { status: 409 });
    if (url.pathname.endsWith('/paper_review_payment'))
      return Response.json({ status: 'approved' });
    throw new Error('Unexpected upstream request: ' + url.pathname);
  };
  const server = createServer(createAppHandler({ env, fetch: upstream }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server');
  const base = 'http://127.0.0.1:' + address.port;
  let cookie = '';
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    origin = env.APP_ORIGIN,
    headers: Record<string, string> = {},
  ) =>
    fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const login = async () => {
    const result = await request('/api/cloud/auth/login', 'POST', {
      email: verifiedUser.email,
      password: 'long test password',
    });
    cookie = result.headers.get('set-cookie')?.split(';')[0] ?? '';
    return result;
  };
  return {
    request,
    login,
    calls,
    getSessions: () => sessions,
    revoke: () => {
      revoked = true;
    },
  };
}
function empty() {
  return { version: 1, records: [], folders: ['Inbox'] };
}
describe('real cloud app contracts', () => {
  it('exports a connected graph, a server, and RLS migration without credentials', () => {
    const graph = JSON.parse(
      readFileSync('examples/paper-cloud/graph.json', 'utf8'),
    ) as ProjectGraph;
    validateProjectGraph(graph);
    const result = compileWebProject(graph, loadDefaultRegistry());
    const pkg = JSON.parse(result.files.find((f) => f.path === 'package.json')!.content);
    expect(pkg.dependencies.qrcode).toBe('1.5.4');
    expect(pkg.devDependencies['@types/qrcode']).toBe('1.5.6');
    expect(result.files.find((f) => f.path === 'src/cloud-runtime.tsx')!.content).toContain(
      'CloudProvider',
    );
    expect(result.wiring.report.unmet).toEqual([]);
    expect(result.wiring.report.flow?.unreachable).toEqual([]);
    expect(result.files.find((f) => f.path === 'server/index.mjs')?.content).toContain(
      'receiptVerified',
    );
    expect(result.files.find((f) => f.path.endsWith('.sql'))?.content).toContain('auth.uid()');
    expect(result.files.map((f) => f.content).join('\n')).not.toContain('private-test');
    expect(() => compileProject(graph, loadDefaultRegistry())).toThrow(/web/i);
  });
  it('rejects foreign origins before calling Supabase and requires sign-in for notes', async () => {
    const f = await fixture();
    expect(
      (await f.request('/api/cloud/auth/login', 'POST', {}, 'https://foreign.test')).status,
    ).toBe(403);
    expect(f.calls).toHaveLength(0);
    expect((await f.request('/api/cloud/collections/notes')).status).toBe(401);
  });
  it('keeps provider tokens encrypted on the server and binds reads to the verified user', async () => {
    const f = await fixture();
    const response = await f.login();
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(JSON.stringify(await response.json())).not.toContain('user-access');
    expect(JSON.stringify(f.getSessions())).not.toContain('user-refresh');
    const session = await f.request('/api/cloud/auth/session');
    expect((await session.json()).owner).toBe(false);
    await f.request('/api/cloud/collections/notes');
    const read = f.calls.find((c) => c.url.pathname.endsWith('paper_collections'))!;
    expect(read.url.searchParams.get('user_id')).toBe('eq.' + user.id);
    expect(read.token).toBe('Bearer user-access');
  });
  it('cannot issue sessions for unverified email accounts', async () => {
    const f = await fixture(false, false);
    expect((await f.login()).status).toBe(403);
    expect(f.getSessions()).toEqual([]);
  });
  it('returns to signed-out state when a provider session or refresh grant is revoked', async () => {
    for (const expiresIn of [3600, 1]) {
      const f = await fixture(false, true, expiresIn);
      await f.login();
      f.revoke();
      const session = await f.request('/api/cloud/auth/session');
      expect(session.status).toBe(200);
      expect((await session.json()).user).toBeNull();
      expect(session.headers.get('set-cookie')).toContain('Max-Age=0');
      expect((await f.request('/api/cloud/collections/notes')).status).toBe(401);
    }
  });
  it('rejects stale-tab writes when the cookie now belongs to another account', async () => {
    const f = await fixture();
    await f.login();
    const result = await f.request(
      '/api/cloud/collections/notes',
      'PUT',
      { revision: 0, data: empty() },
      env.APP_ORIGIN,
      { 'X-Paper-Account': 'another-user' },
    );
    expect(result.status).toBe(409);
    expect((await result.json()).error.code).toBe('account_changed');
    expect(f.calls.some((c) => c.url.pathname.endsWith('paper_save_collection'))).toBe(false);
  });
  it('uses server prices and UPI recipient, and claiming receipt never grants a plan', async () => {
    const f = await fixture();
    await f.login();
    const response = await f.request('/api/cloud/payments', 'POST', {
      plan: 'plus',
      amount: 1,
      upiId: 'attacker@bank',
      user_id: 'another',
    });
    const result = await response.json();
    const link = new URL(result.upiUrl);
    expect(result.payment.amount).toBe(50000);
    expect(result.payment.user_id).toBe(user.id);
    expect(link.searchParams.get('pa')).toBe('9480106354@slc');
    expect(link.searchParams.get('am')).toBe('500.00');
    expect(link.searchParams.get('tr')).toBe(paymentId.replace(/-/g, ''));
    expect(
      (
        await f.request('/api/cloud/payments/' + paymentId + '/claim', 'POST', {
          reference: '123456789012',
        })
      ).status,
    ).toBe(200);
    expect(f.calls.some((c) => c.url.pathname.endsWith('paper_review_payment'))).toBe(false);
    expect((await (await f.request('/api/cloud/auth/session')).json()).plan).toBe('free');
  });
  it('requires owner identity and actual receipt acknowledgement for payment approval', async () => {
    const f = await fixture();
    await f.login();
    expect((await f.request('/api/cloud/owner/payments')).status).toBe(403);
    const owner = await fixture(true);
    await owner.login();
    const path = '/api/cloud/owner/payments/' + paymentId + '/review';
    expect(
      (await owner.request(path, 'POST', { approve: true, note: 'Receipt checked' })).status,
    ).toBe(400);
    expect(owner.calls.some((c) => c.url.pathname.endsWith('paper_review_payment'))).toBe(false);
    expect(
      (
        await owner.request(path, 'POST', {
          approve: true,
          receiptVerified: true,
          note: 'Receipt checked',
        })
      ).status,
    ).toBe(200);
    const rpc = owner.calls.find((c) => c.url.pathname.endsWith('paper_review_payment'))!;
    expect(rpc.body.p_actor).toBe(user.id);
    expect(rpc.body.p_days).toBe(30);
    expect(rpc.token).toBe('Bearer private-test');
  });
  it('returns a recoverable conflict instead of overwriting another device', async () => {
    const f = await fixture();
    await f.login();
    const result = await f.request('/api/cloud/collections/notes', 'PUT', {
      revision: 0,
      data: empty(),
    });
    expect(result.status).toBe(409);
    expect((await result.json()).error.code).toBe('write_conflict');
  });
  it('requires PKCE cookies for callbacks and invalidates the app session on logout', async () => {
    const f = await fixture();
    expect((await f.request('/auth/callback?code=stolen')).headers.get('location')).toContain(
      'oauth_expired',
    );
    await f.login();
    expect((await f.request('/api/cloud/auth/logout', 'POST', {})).status).toBe(200);
    expect((await f.request('/api/cloud/collections/notes')).status).toBe(401);
  });
  it('sends PKCE email links and keeps recovery sessions restricted until password reset', async () => {
    const f = await fixture();
    const signup = await f.request('/api/cloud/auth/signup', 'POST', {
      email: user.email,
      password: 'long test password',
    });
    expect(signup.status).toBe(202);
    const sent = f.calls.find((c) => c.url.pathname.endsWith('/signup'))!;
    expect(sent.body.code_challenge_method).toBe('s256');
    expect(sent.body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sent.url.searchParams.get('redirect_to')).toBe(env.APP_ORIGIN + '/auth/callback');
    const recovery = await f.request('/api/cloud/auth/recover', 'POST', { email: user.email });
    expect(recovery.status).toBe(202);
    const pkceCookie = recovery.headers.get('set-cookie')!.split(';')[0]!;
    const callback = await f.request(
      '/auth/callback?code=email-code',
      'GET',
      undefined,
      env.APP_ORIGIN,
      { Cookie: pkceCookie },
    );
    expect(callback.status).toBe(303);
    const exchange = f.calls.find((c) => c.url.searchParams.get('grant_type') === 'pkce')!;
    expect(exchange.body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.getSessions().at(-1)?.recovery).toBe(true);
    const appCookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith('paper-session='))!
      .split(';')[0]!;
    expect(
      (
        await f.request('/api/cloud/collections/notes', 'GET', undefined, env.APP_ORIGIN, {
          Cookie: appCookie,
        })
      ).status,
    ).toBe(403);
  });
  it('rejects malformed collection inputs, duplicate IDs, and invalid tags', () => {
    expect(validateCollection(empty())).toEqual(empty());
    expect(() => validateCollection({ ...empty(), version: '1' })).toThrow();
    expect(() => validateCollection({ ...empty(), folders: [1] })).toThrow();
  });
});
