try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local missing — Supabase env will be absent and tests will skip
  // themselves with a clear message.
}

delete process.env.DEV_USER_ID;
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
