import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApi } from './.generated/server/api.ts';
const directory = mkdtempSync(join(tmpdir(), 'blockfw-auth-'));
const options = {
  databasePath: join(directory, 'auth.sqlite'),
  baseURL: 'http://127.0.0.1:8788',
  secret: randomBytes(32).toString('hex'),
};
let api;
try {
  api = await createApi(options);
  const request = (path, body, cookie = '') =>
    api.app.request(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'blockfw-spike://',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await request('/api/private')).status, 401);
  const password = randomBytes(12).toString('hex');
  const signup = await request('/api/auth/sign-up/email', {
    name: 'Spike',
    email: 'device@example.test',
    password,
  });
  assert.equal(signup.status, 200, await signup.clone().text());
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.ok(cookie);
  assert.equal((await request('/api/private', null, cookie)).status, 200);
  assert.equal(
    (await request('/api/private', null, 'better-auth.session_token=invalid')).status,
    401,
  );
  const foreign = await api.app.request('/api/auth/sign-out', {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(foreign.status, 403);
  api.database.close();
  api = await createApi(options);
  assert.equal((await request('/api/private', null, cookie)).status, 200);
  assert.equal((await request('/api/auth/sign-out', {}, cookie)).status, 200);
  assert.equal((await request('/api/private', null, cookie)).status, 401);
  const denied = await request('/api/auth/sign-in/email', {
    email: 'device@example.test',
    password: 'incorrect-test-password',
  });
  assert.equal(denied.status, 401);
  const login = await request('/api/auth/sign-in/email', {
    email: 'device@example.test',
    password,
  });
  assert.equal(login.status, 200);
  const loginCookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.equal((await request('/api/private', null, loginCookie)).status, 200);
  console.log(
    'Generated Hono/Better Auth: signup/login, incorrect password, protected 401/200, invalid session, origin rejection, persistent DB restart and logout passed',
  );
} finally {
  api?.database.close();
  rmSync(directory, { recursive: true, force: true });
}
