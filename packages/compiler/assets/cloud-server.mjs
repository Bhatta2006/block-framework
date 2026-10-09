import { createServer } from 'node:http';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plans = {
  free: { id: 'free', name: 'Free', amount: 0, noteLimit: 25 },
  plus: { id: 'plus', name: 'Plus', amount: 50000, noteLimit: 1000 },
  pro: { id: 'pro', name: 'Pro', amount: 100000, noteLimit: 10000 },
};
function text(value, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(400, 'invalid_input', 'Check the highlighted details.');
  return value.trim();
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    fail(400, 'invalid_password', 'Use a password between 12 and 128 characters.');
  return value;
}
function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail(400, 'invalid_email', 'Enter a valid email address.');
  return result;
}
function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((p) => p.trim().split(/=(.*)/s).slice(0, 2))
      .filter((p) => p.length === 2),
  );
}
export function configuration(env) {
  const origin = new URL(env.APP_ORIGIN || 'http://127.0.0.1:8787');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password)
    throw new Error('APP_ORIGIN must be an origin, without a path.');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  if (!local && origin.protocol !== 'https:')
    throw new Error('HTTPS is required outside loopback.');
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Invalid APP_ORIGIN.');
  const key = Buffer.from(env.SESSION_ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32 || !/^[a-f0-9]{64}$/i.test(env.SESSION_ENCRYPTION_KEY || ''))
    throw new Error('Set SESSION_ENCRYPTION_KEY to a random 32-byte hex key.');
  const sb = new URL(env.SUPABASE_URL || 'https://unconfigured.invalid');
  if (
    sb.protocol !== 'https:' ||
    sb.username ||
    sb.password ||
    sb.pathname !== '/' ||
    sb.search ||
    sb.hash
  )
    throw new Error('SUPABASE_URL must be a secure project origin.');
  if (
    !env.SUPABASE_ANON_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    sb.hostname === 'unconfigured.invalid'
  )
    throw new Error('Configure Supabase before starting the cloud app.');
  const upi = env.UPI_ID || '9480106354@slc';
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upi)) throw new Error('Invalid UPI_ID.');
  const days = Number(env.PAID_ACCESS_DAYS || 30);
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error('PAID_ACCESS_DAYS must be between 1 and 366.');
  const allowed = new Set([origin.origin]);
  if (env.STUDIO_ORIGIN) {
    const studio = new URL(env.STUDIO_ORIGIN);
    if (
      !local ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(studio.hostname) ||
      studio.protocol !== 'http:'
    )
      throw new Error('STUDIO_ORIGIN is only for local development.');
    allowed.add(studio.origin);
  }
  return {
    origin: origin.origin,
    secure: origin.protocol === 'https:',
    key,
    supabase: sb.origin,
    anon: env.SUPABASE_ANON_KEY,
    service: env.SUPABASE_SERVICE_ROLE_KEY,
    owner: email(env.OWNER_EMAIL || 'pdcstmoments@gmail.com'),
    upi,
    days,
    allowed,
    staticDir: resolve(env.STATIC_DIR || 'dist'),
    port: Number(env.PORT || 8787),
  };
}
export function validateCollection(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.records) ||
    data.records.length > 10000 ||
    !Array.isArray(data.folders) ||
    data.folders.length > 1000 ||
    !data.folders.every((f) => typeof f === 'string' && f.trim() && f.length <= 100)
  )
    fail(400, 'invalid_collection', 'Invalid notes collection.');
  const ids = new Set();
  for (const n of data.records) {
    if (
      !n ||
      typeof n.id !== 'string' ||
      !n.id ||
      n.id.length > 100 ||
      ids.has(n.id) ||
      typeof n.title !== 'string' ||
      n.title.length > 1000 ||
      typeof n.body !== 'string' ||
      n.body.length > 200000 ||
      typeof n.folder !== 'string' ||
      n.folder.length > 100 ||
      !Array.isArray(n.tags) ||
      n.tags.length > 50 ||
      !n.tags.every((t) => typeof t === 'string' && t.length <= 100) ||
      !['favorite', 'pinned', 'archived', 'trashed'].every((k) => typeof n[k] === 'boolean') ||
      typeof n.createdAt !== 'string' ||
      typeof n.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(n.createdAt)) ||
      !Number.isFinite(Date.parse(n.updatedAt))
    )
      fail(400, 'invalid_note', 'A note is invalid or too large.');
    ids.add(n.id);
  }
  return data;
}
export function upiLink(config, payment) {
  const url = new URL('upi://pay');
  for (const [key, value] of Object.entries({
    pa: config.upi,
    pn: 'Paper',
    am: (payment.amount / 100).toFixed(2),
    cu: 'INR',
    tn: 'Paper ' + payment.plan + ' ' + payment.id.slice(0, 8),
    tr: payment.id.replace(/-/g, ''),
  }))
    url.searchParams.set(key, value);
  return url.toString();
}
export function createAppHandler({
  env = process.env,
  fetch: request = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  const config = configuration(env);
  const sessionName = config.secure ? '__Host-paper-session' : 'paper-session';
  const oauthName = config.secure ? '__Host-paper-oauth' : 'paper-oauth';
  const refreshes = new Map();
  const limits = new Map();
  const pack = (value, purpose) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', config.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
  };
  const unpack = (value, purpose) => {
    try {
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.length < 29) return null;
      const decipher = createDecipheriv('aes-256-gcm', config.key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(purpose));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
      );
    } catch {
      return null;
    }
  };
  const cookie = (res, name, value, maxAge) => {
    const item =
      name +
      '=' +
      value +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' +
      maxAge +
      (config.secure ? '; Secure' : '');
    const old = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(Array.isArray(old) ? old : old ? [old] : []), item]);
  };
  const headers = (res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', config.secure ? 'DENY' : 'SAMEORIGIN');
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors " +
        (config.secure ? "'none'" : "'self' http://127.0.0.1:5174") +
        "; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'",
    );
  };
  const send = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  const redirect = (res, path) => {
    res.writeHead(303, { Location: path });
    res.end();
  };
  async function upstream(path, { method = 'GET', body, token, admin = false, auth = false } = {}) {
    const key = admin ? config.service : config.anon;
    let response;
    try {
      response = await request(config.supabase + (auth ? '/auth/v1/' : '/rest/v1/') + path, {
        method,
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + (token || key),
          'Content-Type': 'application/json',
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      fail(503, 'provider_unavailable', 'The account service is unavailable. Please retry.');
    }
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      if (value?.code === 'PT409' || value?.code === '40001')
        fail(
          409,
          'write_conflict',
          'Another device changed this collection. Export your draft, then reload.',
        );
      if (value?.code === '23505')
        fail(409, 'duplicate_reference', 'This transaction reference has already been submitted.');
      if (value?.code === '22023') fail(400, 'invalid_input', 'The submitted data is invalid.');
      if (value?.code === 'P0001')
        fail(409, 'plan_limit', String(value.message || 'The operation cannot be completed.'));
      if (
        auth &&
        (path === 'user' || path.includes('grant_type=refresh_token')) &&
        [400, 401, 403, 422].includes(response.status)
      )
        fail(401, 'session_expired', 'Please sign in again.');
      if (auth && (response.status === 400 || response.status === 401 || response.status === 422))
        fail(
          400,
          'auth_failed',
          'Check your details, confirm your email, or request a new recovery link.',
        );
      if (response.status === 401 || response.status === 403)
        fail(401, 'session_expired', 'Please sign in again.');
      if (response.status === 429)
        fail(429, 'provider_rate_limit', 'Please wait before trying again.');
      fail(
        503,
        'setup_required',
        'The cloud service is not ready. Check project configuration and migrations.',
      );
    }
    return value;
  }
  const db = (table, options) => upstream(table, options);
  const auth = (path, options) => upstream(path, { ...options, auth: true });
  function beginPkce(res, recovery = false) {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    cookie(res, oauthName, pack({ verifier, recovery, until: now() + 3600000 }, 'oauth'), 3600);
    return { code_challenge: challenge, code_challenge_method: 's256' };
  }
  const admin = (table, options) => db(table, { ...options, admin: true });
  const where = (value) => encodeURIComponent(value);
  async function createSession(res, tokens, recovery = false) {
    if (!tokens?.access_token || !tokens?.refresh_token)
      fail(502, 'invalid_session', 'The account service did not provide a session.');
    const user = await auth('user', { token: tokens.access_token });
    if (!user?.id || !user.email_confirmed_at)
      fail(403, 'email_unverified', 'Confirm your email before continuing.');
    const secret = randomBytes(32).toString('base64url');
    const record = {
      id_hash: hash(secret),
      user_id: user.id,
      credentials: pack(
        { ...tokens, expires_at: Math.floor(now() / 1000) + (tokens.expires_in || 3600) },
        'session',
      ),
      recovery,
      expires_at: new Date(now() + 7 * 86400000).toISOString(),
    };
    await admin('paper_sessions', { method: 'POST', body: record });
    cookie(res, sessionName, secret, 7 * 86400);
    return user;
  }
  async function getSession(req, { allowRecovery = false } = {}) {
    const secret = cookies(req)[sessionName];
    if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret))
      fail(401, 'signed_out', 'Sign in to continue.');
    const records = await admin('paper_sessions?id_hash=eq.' + hash(secret) + '&select=*');
    let row = records?.[0];
    if (!row || Date.parse(row.expires_at) <= now())
      fail(401, 'session_expired', 'Please sign in again.');
    if (row.recovery && !allowRecovery)
      fail(403, 'password_reset_required', 'Set your new password first.');
    let tokens = unpack(row.credentials, 'session');
    if (!tokens) fail(401, 'session_expired', 'Please sign in again.');
    if (tokens.expires_at * 1000 <= now() + 60000) {
      let operation = refreshes.get(row.id_hash);
      if (!operation) {
        operation = (async () => {
          const freshRows = await admin('paper_sessions?id_hash=eq.' + row.id_hash + '&select=*');
          const current = freshRows?.[0];
          const previous = current && unpack(current.credentials, 'session');
          if (!previous) fail(401, 'session_expired', 'Please sign in again.');
          if (previous.expires_at * 1000 > now() + 60000) return previous;
          const next = await auth('token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: previous.refresh_token },
          });
          const updated = {
            ...next,
            refresh_token: next.refresh_token || previous.refresh_token,
            expires_at: Math.floor(now() / 1000) + (next.expires_in || 3600),
          };
          if (!updated.access_token) fail(502, 'invalid_session', 'Unable to renew your session.');
          await admin('paper_sessions?id_hash=eq.' + row.id_hash, {
            method: 'PATCH',
            body: { credentials: pack(updated, 'session') },
          });
          return updated;
        })();
        refreshes.set(row.id_hash, operation);
        operation.finally(() => refreshes.delete(row.id_hash)).catch(() => {});
      }
      tokens = await operation;
    }
    const user = await auth('user', { token: tokens.access_token });
    if (!user?.id || user.id !== row.user_id || !user.email_confirmed_at)
      fail(401, 'session_expired', 'Please sign in again.');
    return { row, tokens, user, owner: user.email?.toLowerCase() === config.owner };
  }
  async function account(session) {
    const [profiles, entitlements] = await Promise.all([
      db('paper_profiles?id=eq.' + session.user.id + '&select=*', {
        token: session.tokens.access_token,
      }),
      db('paper_entitlements?user_id=eq.' + session.user.id + '&select=plan,expires_at', {
        token: session.tokens.access_token,
      }),
    ]);
    const entitlement = entitlements?.[0];
    const plan =
      entitlement && Date.parse(entitlement.expires_at) > now() ? entitlement.plan : 'free';
    return {
      user: { id: session.user.id, email: session.user.email },
      profile: profiles?.[0] || null,
      plan,
      expiresAt: plan === 'free' ? null : entitlement.expires_at,
      owner: session.owner,
      requiresPasswordReset: session.row.recovery,
      noteLimit: plans[plan]?.noteLimit || 25,
    };
  }
  async function body(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json'))
      fail(415, 'json_required', 'Send JSON for this operation.');
    if (Number(req.headers['content-length']) > 3200000)
      fail(413, 'too_large', 'This request is too large.');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 3200000) fail(413, 'too_large', 'This request is too large.');
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(400, 'invalid_json', 'Send a JSON object.');
      return value;
    } catch (e) {
      if (e instanceof AppError) throw e;
      fail(400, 'invalid_json', 'Invalid JSON.');
    }
  }
  function rate(req, path) {
    const ip = req.socket.remoteAddress || 'unknown';
    const isAuth = path.startsWith('/api/cloud/auth/') && path !== '/api/cloud/auth/session';
    const key = ip + ':' + (isAuth ? 'auth' : 'api');
    const ttl = isAuth ? 900000 : 60000;
    const cap = isAuth ? 20 : 400;
    let record = limits.get(key);
    if (!record || record.until < now()) {
      record = { until: now() + ttl, count: 0 };
      limits.set(key, record);
    }
    if (++record.count > cap)
      fail(429, 'rate_limited', 'Too many requests. Please wait before retrying.');
    if (limits.size > 10000) {
      for (const [k, v] of limits) if (v.until < now()) limits.delete(k);
      if (limits.size > 10000) fail(503, 'busy', 'Please retry shortly.');
    }
  }
  return async function handler(req, res) {
    headers(res);
    try {
      const url = new URL(req.url || '/', config.origin);
      const path = url.pathname;
      if (path === '/healthz') {
        send(res, 200, { ok: true });
        return;
      }
      if (path.startsWith('/api/cloud/')) {
        const origin = req.headers.origin;
        if (origin && !config.allowed.has(origin))
          fail(403, 'origin_rejected', 'This origin is not allowed.');
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Paper-Account');
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method !== 'GET' && (!origin || !config.allowed.has(origin)))
          fail(403, 'origin_required', 'Open this app directly to make changes.');
        if (req.headers['sec-fetch-site'] === 'cross-site' && !config.allowed.has(origin))
          fail(403, 'origin_rejected', 'This origin is not allowed.');
        rate(req, path);
        if (path === '/api/cloud/config' && req.method === 'GET') {
          send(res, 200, {
            provider: 'supabase',
            paymentProvider: 'manual-upi',
            upiId: config.upi,
            accessDays: config.days,
            plans: Object.values(plans),
            verification: 'Owner verifies actual receipt before granting access.',
          });
          return;
        }
        if (path === '/api/cloud/auth/signup' && req.method === 'POST') {
          const input = await body(req);
          const credentials = { email: email(input.email), password: password(input.password) };
          const pkce = beginPkce(res);
          await auth('signup?redirect_to=' + where(config.origin + '/auth/callback'), {
            method: 'POST',
            body: { ...credentials, ...pkce },
          });
          send(res, 202, {
            message:
              'Check your email and open its confirmation link in this browser. If it already exists, sign in instead.',
          });
          return;
        }
        if (path === '/api/cloud/auth/login' && req.method === 'POST') {
          const input = await body(req);
          const tokens = await auth('token?grant_type=password', {
            method: 'POST',
            body: { email: email(input.email), password: text(input.password, 128) },
          });
          await createSession(res, tokens);
          send(res, 200, { ok: true });
          return;
        }
        if (path === '/api/cloud/auth/google' && req.method === 'POST') {
          await body(req);
          const pkce = beginPkce(res);
          const authorize = new URL(config.supabase + '/auth/v1/authorize');
          authorize.searchParams.set('provider', 'google');
          authorize.searchParams.set('redirect_to', config.origin + '/auth/callback');
          authorize.searchParams.set('code_challenge', pkce.code_challenge);
          authorize.searchParams.set('code_challenge_method', 's256');
          send(res, 200, { url: authorize.toString() });
          return;
        }
        if (path === '/api/cloud/auth/recover' && req.method === 'POST') {
          const input = await body(req);
          const address = email(input.email);
          const pkce = beginPkce(res, true);
          try {
            await auth('recover?redirect_to=' + where(config.origin + '/auth/callback'), {
              method: 'POST',
              body: { email: address, ...pkce },
            });
          } catch (e) {
            if (e.status === 503 || e.status === 429) throw e;
          }
          send(res, 202, { message: 'If an account exists, a recovery email is on its way.' });
          return;
        }
        if (path === '/api/cloud/auth/session' && req.method === 'GET') {
          try {
            const session = await getSession(req, { allowRecovery: true });
            send(res, 200, await account(session));
          } catch (e) {
            if (e.status !== 401) throw e;
            cookie(res, sessionName, '', 0);
            send(res, 200, { user: null, profile: null, plan: 'free', owner: false });
          }
          return;
        }
        const session = await getSession(req, {
          allowRecovery: path === '/api/cloud/auth/password' || path === '/api/cloud/auth/logout',
        });
        if (req.headers['x-paper-account'] && req.headers['x-paper-account'] !== session.user.id)
          fail(
            409,
            'account_changed',
            'Your account changed in another tab. Export any unsaved notes, then reload.',
          );
        if (path === '/api/cloud/auth/password' && req.method === 'POST') {
          const input = await body(req);
          await auth('user', {
            method: 'PUT',
            token: session.tokens.access_token,
            body: { password: password(input.password) },
          });
          await admin('paper_sessions?id_hash=eq.' + session.row.id_hash, {
            method: 'PATCH',
            body: { recovery: false },
          });
          send(res, 200, { ok: true });
          return;
        }
        if (path === '/api/cloud/auth/logout' && req.method === 'POST') {
          await body(req);
          await admin('paper_sessions?id_hash=eq.' + session.row.id_hash, { method: 'DELETE' });
          cookie(res, sessionName, '', 0);
          try {
            await auth('logout?scope=local', {
              method: 'POST',
              token: session.tokens.access_token,
            });
          } catch {
            // The application session is already deleted; provider revocation is best effort.
          }
          send(res, 200, { ok: true });
          return;
        }
        if (path === '/api/cloud/profile' && req.method === 'PUT') {
          const input = await body(req);
          const focus = ['personal', 'work', 'study'].includes(input.focus) ? input.focus : null;
          if (!focus) fail(400, 'invalid_focus', 'Choose Personal, Work, or Study.');
          await db('paper_profiles', {
            method: 'POST',
            token: session.tokens.access_token,
            body: {
              id: session.user.id,
              full_name: text(input.fullName, 100),
              focus,
              onboarding_completed_at: new Date(now()).toISOString(),
            },
          });
          send(res, 200, await account(session));
          return;
        }
        const collection = path.match(/^\/api\/cloud\/collections\/([a-z][a-z0-9-]{0,63})$/);
        if (collection && req.method === 'GET') {
          const rows = await db(
            'paper_collections?user_id=eq.' +
              session.user.id +
              '&collection_key=eq.' +
              collection[1] +
              '&select=data,revision',
            { token: session.tokens.access_token },
          );
          send(res, 200, rows?.[0] || { data: null, revision: 0 });
          return;
        }
        if (collection && req.method === 'PUT') {
          const input = await body(req);
          if (!Number.isSafeInteger(input.revision) || input.revision < 0)
            fail(400, 'invalid_revision', 'Invalid revision.');
          validateCollection(input.data);
          const value = await db('rpc/paper_save_collection', {
            method: 'POST',
            token: session.tokens.access_token,
            body: { p_key: collection[1], p_revision: input.revision, p_data: input.data },
          });
          send(res, 200, value);
          return;
        }
        if (path === '/api/cloud/payments' && req.method === 'GET') {
          const rows = await db(
            'paper_payments?user_id=eq.' +
              session.user.id +
              '&select=id,plan,amount,currency,status,reference,created_at,review_note&order=created_at.desc&limit=50',
            { token: session.tokens.access_token },
          );
          send(res, 200, { payments: rows });
          return;
        }
        if (path === '/api/cloud/payments' && req.method === 'POST') {
          const input = await body(req);
          const plan = plans[input.plan];
          if (!plan || plan.id === 'free') fail(400, 'invalid_plan', 'Select a paid plan.');
          const details = await account(session);
          if (!details.profile?.onboarding_completed_at)
            fail(403, 'onboarding_required', 'Complete onboarding first.');
          if (details.plan === 'pro' && plan.id === 'plus')
            fail(
              409,
              'active_pro',
              'Your Pro pass is active. Wait until it expires before selecting Plus.',
            );
          const existing = await admin(
            'paper_payments?user_id=eq.' +
              session.user.id +
              '&plan=eq.' +
              plan.id +
              '&status=eq.pending&created_at=gt.' +
              where(new Date(now() - 86400000).toISOString()) +
              '&order=created_at.desc&limit=1',
          );
          let payment = existing?.[0];
          if (!payment) {
            payment = {
              id: globalThis.crypto.randomUUID(),
              user_id: session.user.id,
              plan: plan.id,
              amount: plan.amount,
              currency: 'INR',
              status: 'pending',
            };
            const saved = await admin('paper_payments', { method: 'POST', body: payment });
            payment = saved?.[0] || payment;
          }
          send(res, 201, { payment, upiUrl: upiLink(config, payment), accessDays: config.days });
          return;
        }
        const claim = path.match(/^\/api\/cloud\/payments\/([0-9a-f-]+)\/claim$/i);
        if (claim && req.method === 'POST') {
          if (!idPattern.test(claim[1])) fail(400, 'invalid_payment', 'Invalid payment.');
          const input = await body(req);
          const reference = text(input.reference, 35);
          if (!/^[A-Za-z0-9]{8,35}$/.test(reference))
            fail(
              400,
              'invalid_reference',
              'Enter the transaction reference from your UPI app (8–35 letters or digits).',
            );
          const rows = await admin(
            'paper_payments?id=eq.' + claim[1] + '&user_id=eq.' + session.user.id + '&select=*',
          );
          const payment = rows?.[0];
          if (!payment) fail(404, 'not_found', 'Payment not found.');
          if (payment.status === 'submitted' && payment.reference === reference) {
            send(res, 200, { status: 'submitted' });
            return;
          }
          if (payment.status !== 'pending')
            fail(409, 'already_reviewed', 'This payment cannot be changed.');
          const saved = await admin(
            'paper_payments?id=eq.' +
              payment.id +
              '&user_id=eq.' +
              session.user.id +
              '&status=eq.pending',
            {
              method: 'PATCH',
              body: { reference, status: 'submitted', submitted_at: new Date(now()).toISOString() },
            },
          );
          if (!saved?.length)
            fail(409, 'payment_changed', 'This payment has changed. Refresh its status.');
          send(res, 200, {
            status: 'submitted',
            message: 'Pending owner verification. Your plan has not changed yet.',
          });
          return;
        }
        if (path.startsWith('/api/cloud/owner/')) {
          if (!session.owner) fail(403, 'owner_required', 'Owner access is required.');
          if (path === '/api/cloud/owner/payments' && req.method === 'GET') {
            const rows = await admin(
              'paper_payments?status=eq.submitted&select=*&order=submitted_at.asc&limit=100',
            );
            send(res, 200, { payments: rows });
            return;
          }
          const review = path.match(/^\/api\/cloud\/owner\/payments\/([0-9a-f-]+)\/review$/i);
          if (review && req.method === 'POST') {
            if (!idPattern.test(review[1])) fail(400, 'invalid_payment', 'Invalid payment.');
            const input = await body(req);
            if (typeof input.approve !== 'boolean')
              fail(400, 'invalid_review', 'Choose approve or reject.');
            if (input.approve && input.receiptVerified !== true)
              fail(400, 'receipt_required', 'Verify the actual bank receipt before approving.');
            const note = text(input.note, 500);
            const result = await admin('rpc/paper_review_payment', {
              method: 'POST',
              body: {
                p_id: review[1],
                p_actor: session.user.id,
                p_approve: input.approve,
                p_note: note,
                p_days: config.days,
              },
            });
            send(res, 200, result);
            return;
          }
        }
        fail(404, 'not_found', 'This endpoint was not found.');
      }
      if (path === '/auth/callback' && req.method === 'GET') {
        const saved = unpack(cookies(req)[oauthName] || '', 'oauth');
        cookie(res, oauthName, '', 0);
        if (!saved || saved.until < now() || !url.searchParams.get('code')) {
          redirect(res, '/?auth_error=oauth_expired');
          return;
        }
        try {
          const tokens = await auth('token?grant_type=pkce', {
            method: 'POST',
            body: {
              auth_code: text(url.searchParams.get('code'), 2048),
              code_verifier: saved.verifier,
            },
          });
          await createSession(res, tokens, saved.recovery === true);
          redirect(res, '/');
        } catch {
          redirect(res, '/?auth_error=oauth_failed');
        }
        return;
      }
      if (path === '/auth/confirm' && req.method === 'GET') {
        const type = url.searchParams.get('type');
        const tokenHash = url.searchParams.get('token_hash');
        if (!['signup', 'recovery', 'email'].includes(type) || !tokenHash) {
          redirect(res, '/?auth_error=confirmation_invalid');
          return;
        }
        try {
          const tokens = await auth('verify', {
            method: 'POST',
            body: { token_hash: text(tokenHash, 2048), type },
          });
          await createSession(res, tokens, type === 'recovery');
          redirect(res, '/');
        } catch {
          redirect(res, '/?auth_error=confirmation_expired');
        }
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        fail(405, 'method_not_allowed', 'Method not allowed.');
      const file = resolve(config.staticDir, '.' + decodeURIComponent(path));
      if (file !== config.staticDir && !file.startsWith(config.staticDir + sep))
        fail(403, 'invalid_path', 'Invalid path.');
      let target = file;
      try {
        if (!(await stat(target)).isFile()) target = resolve(config.staticDir, 'index.html');
      } catch {
        target = resolve(config.staticDir, 'index.html');
      }
      let data;
      try {
        data = await readFile(target);
      } catch {
        send(res, 503, {
          error: { code: 'build_required', message: 'Build the web app first (npm run build).' },
        });
        return;
      }
      const mime =
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.ico': 'image/x-icon',
        }[extname(target)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      const known = error instanceof AppError;
      if (!res.headersSent)
        send(res, known ? error.status : 500, {
          error: {
            code: known ? error.code : 'internal_error',
            message: known ? error.message : 'The request could not be completed.',
          },
        });
      else res.end();
    }
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const handler = createAppHandler();
    const server = createServer(handler);
    const port = Number(process.env.PORT || 8787);
    server.listen(port, process.env.HOST || '127.0.0.1', () =>
      console.log('Paper cloud app is listening on port ' + port),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
