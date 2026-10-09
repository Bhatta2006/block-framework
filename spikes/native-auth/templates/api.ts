import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { betterAuth } from 'better-auth';
import { expo } from '@better-auth/expo';
import { getMigrations } from 'better-auth/db/migration';
import Database from 'better-sqlite3';

export async function createApi({
  databasePath,
  baseURL,
  secret,
}: {
  databasePath: string;
  baseURL: string;
  secret: string;
}) {
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  const options = {
    database,
    baseURL,
    secret,
    emailAndPassword: { enabled: true },
    trustedOrigins: [baseURL, 'blockfw-spike://', 'exp://*'],
    plugins: [expo()],
    advanced: { useSecureCookies: baseURL.startsWith('https://') },
  };
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  const auth = betterAuth(options);
  const app = new Hono();
  app.use(
    '*',
    cors({
      origin: [baseURL, 'blockfw-spike://'],
      credentials: true,
      allowHeaders: ['Content-Type', 'Cookie', 'expo-origin'],
    }),
  );
  app.get('/healthz', (c) => c.json({ ok: true }));
  app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
  app.get('/api/private', async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return session
      ? c.json({ authenticated: true, userId: session.user.id, email: session.user.email })
      : c.json({ error: 'Unauthorized' }, 401);
  });
  return { app, database };
}
