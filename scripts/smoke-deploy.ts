/**
 * Production smoke test runner.
 *
 * Usage:
 *   DEPLOY_URL=https://your-app.vercel.app AUTH_COOKIE="next-auth.session-token=..." npm.cmd exec -- tsx scripts/smoke-deploy.ts
 *
 * If you don't have an auth cookie, you can still verify that the server is up and auth redirects work.
 */
type CheckResult = { ok: boolean; name: string; status?: number; note?: string };

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

async function check(
  name: string,
  url: string,
  init?: RequestInit,
  expect?: (res: Response) => Promise<{ ok: boolean; note?: string } | void> | ({ ok: boolean; note?: string } | void)
): Promise<CheckResult> {
  try {
    const res = await fetch(url, init);
    const expected = expect ? await expect(res) : undefined;
    const ok = expected ? expected.ok : res.ok;
    const note = expected?.note;
    return { ok, name, status: res.status, note };
  } catch (e) {
    return { ok: false, name, note: String(e) };
  }
}

function print(results: CheckResult[]) {
  const lines = results.map((r) => {
    const s = r.status != null ? `HTTP ${r.status}` : 'NO_HTTP';
    const ok = r.ok ? 'OK' : 'FAIL';
    const note = r.note ? ` — ${r.note}` : '';
    return `${ok} ${s} ${r.name}${note}`;
  });
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

async function main() {
  const base = requiredEnv('DEPLOY_URL');
  const cookie = process.env.AUTH_COOKIE?.trim();
  const headers: HeadersInit = cookie ? { cookie } : {};

  const results: CheckResult[] = [];

  // Public/unauth entry
  results.push(
    await check('GET / (should load or redirect)', joinUrl(base, '/'), { redirect: 'manual' })
  );

  // Session endpoint (200 even when null)
  results.push(
    await check(
      'GET /api/auth/session',
      joinUrl(base, '/api/auth/session'),
      { headers },
      async (res) => {
        if (res.status !== 200) return { ok: false, note: 'expected 200' };
        return { ok: true };
      }
    )
  );

  // Auth-gated API should be 401/403 without cookie, 200 with cookie
  results.push(
    await check('GET /api/records', joinUrl(base, '/api/records'), { headers }, async (res) => {
      if (cookie) {
        if (res.status !== 200) return { ok: false, note: 'expected 200 with AUTH_COOKIE' };
        return { ok: true };
      }
      if (![401, 403].includes(res.status)) return { ok: false, note: 'expected 401/403 without AUTH_COOKIE' };
      return { ok: true };
    })
  );

  // PDF endpoint should not crash; likely 401/403 (no cookie) or 503 (no PDF_BASE_PATH)
  results.push(
    await check('GET /api/pdf?id=1', joinUrl(base, '/api/pdf?id=1'), { headers }, async (res) => {
      if (!cookie && ![401, 403].includes(res.status)) return { ok: false, note: 'expected 401/403 without AUTH_COOKIE' };
      if (cookie && ![200, 404, 503].includes(res.status)) return { ok: false, note: 'expected 200/404/503 with AUTH_COOKIE' };
      return { ok: true };
    })
  );

  print(results);

  if (results.some((r) => !r.ok)) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});

