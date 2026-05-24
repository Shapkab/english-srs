try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local missing — Supabase env will be absent and tests will skip
  // themselves with a clear message.
}

delete process.env.DEV_USER_ID;
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

// F4: print one consolidated skip-notice for the integration suites instead
// of one per-suite. When Supabase env is missing, all integration suites
// `describe.skip` themselves AND emit identical "[tests] Skipping ..." lines.
// We keep the describe.skip logic intact (so the suites still self-skip) but
// suppress those duplicate console.warn lines after one consolidated warning.
const haveSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

if (!haveSupabase) {
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Integration suites require NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; they will self-skip in this run.',
  );

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[tests] Skipping')) {
      return;
    }
    originalWarn(...args);
  };
}
