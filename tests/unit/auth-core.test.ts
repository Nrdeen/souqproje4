import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSaudiMobile, validatePassword } from '../../server/auth/phone';
import { parseCookies, serializeClearCookie, serializeSessionCookie } from '../../server/auth/cookies';
import { SessionManager, hashToken, type SessionRecord } from '../../server/auth/sessions';
import { checkMutationOrigin, csrfTokenFor, verifyCsrfToken } from '../../server/auth/csrf';
import { RateLimiter } from '../../server/auth/rateLimit';
import { loadConfig } from '../../server/config';

// ---------- phone & password policy
test('Saudi mobile numbers are normalised to 05XXXXXXXX', () => {
  for (const v of ['0504829104', '504829104', '+966504829104', '00966504829104', '966 50 482 9104', '٠٥٠٤٨٢٩١٠٤']) {
    assert.equal(normalizeSaudiMobile(v), '0504829104', v);
  }
  for (const v of ['', '0404829104', '05048291', '050482910412', 'abc', null, undefined, 123, '0504829104; DROP']) {
    assert.equal(normalizeSaudiMobile(v as any), null, String(v));
  }
});

test('password policy rejects short, repeated, common and phone-number passwords', () => {
  assert.ok(validatePassword('short'));
  assert.ok(validatePassword('aaaaaaaaaaaa'));
  assert.ok(validatePassword('password123'));
  assert.ok(validatePassword('0504829104', '0504829104'));
  assert.ok(validatePassword('x'.repeat(129)));
  assert.equal(validatePassword('غنم-الصحراء-2026-قوي', '0504829104'), null);
  assert.equal(validatePassword('correct horse battery', '0504829104'), null);
});

// ---------- cookies
test('session cookie carries HttpOnly, SameSite and (in production) Secure', () => {
  const prod = serializeSessionCookie('__Host-sid', 'tok', { secure: true, maxAgeMs: 60_000 });
  assert.match(prod, /HttpOnly/);
  assert.match(prod, /Secure/);
  assert.match(prod, /SameSite=Lax/);
  assert.match(prod, /Path=\//);
  assert.doesNotMatch(prod, /Domain=/); // required by the __Host- prefix
  assert.match(prod, /Max-Age=60/);
  assert.doesNotMatch(serializeSessionCookie('sid', 'tok', { secure: false }), /Secure/);
  assert.match(serializeClearCookie('sid', true), /Max-Age=0/);
});

test('cookie parsing: first value wins, malformed input is tolerated', () => {
  assert.deepEqual(parseCookies('a=1; b=2; a=3'), { a: '1', b: '2' });
  assert.deepEqual(parseCookies(undefined), {});
  assert.equal(parseCookies('x=%E0%A4%A')['x'], '%E0%A4%A');
});

// ---------- sessions
function makeSessions(overrides: Partial<ConstructorParameters<typeof SessionManager>[0]> = {}) {
  let list: SessionRecord[] = [];
  let clock = 1_000_000;
  const revoked: string[] = [];
  let persists = 0;
  const mgr = new SessionManager({
    getSessions: () => list,
    setSessions: (l) => {
      list = l;
    },
    persist: () => {
      persists++;
    },
    idleMs: 10_000,
    absoluteMs: 60_000,
    maxPerUser: 3,
    now: () => clock,
    onRevoked: (ids) => revoked.push(...ids),
    ...overrides,
  });
  return { mgr, advance: (ms: number) => (clock += ms), list: () => list, revoked, persists: () => persists };
}

test('sessions: only a hash of the token is stored; token validates to its user', () => {
  const { mgr, list } = makeSessions();
  const { token, session } = mgr.create('u1');
  assert.notEqual(session.id, token);
  assert.equal(session.id, hashToken(token));
  assert.ok(!JSON.stringify(list()).includes(token));
  assert.equal(mgr.validate(token)?.userId, 'u1');
  assert.equal(mgr.validate('x'.repeat(43)), null);
  assert.equal(mgr.validate(undefined), null);
});

test('sessions: idle timeout and absolute timeout end the session', () => {
  const { mgr, advance, revoked } = makeSessions();
  const a = mgr.create('u1');
  advance(9_000);
  assert.ok(mgr.validate(a.token)); // still within idle window (not touched yet: <60s)
  advance(11_000);
  assert.equal(mgr.validate(a.token), null); // idle exceeded
  assert.ok(revoked.includes(a.session.id));

  const { mgr: m2, advance: adv2 } = makeSessions({ idleMs: 1_000_000, absoluteMs: 5_000 });
  const b = m2.create('u2');
  adv2(5_001);
  assert.equal(m2.validate(b.token), null); // absolute lifetime exceeded
});

test('sessions: revoke, revoke-all (except current), per-user cap, sweep', () => {
  const { mgr, list, advance, revoked } = makeSessions();
  const s = [mgr.create('u1'), mgr.create('u1'), mgr.create('u1')];
  mgr.create('u1'); // 4th -> oldest dropped
  assert.equal(list().filter((x) => x.userId === 'u1').length, 3);
  assert.equal(mgr.validate(s[0].token), null);

  assert.equal(mgr.revoke(s[1].session.id), true);
  assert.equal(mgr.validate(s[1].token), null);
  assert.equal(mgr.revoke(s[1].session.id), false);

  mgr.create('u2');
  assert.equal(mgr.revokeAllForUser('u1', s[2].session.id) >= 1, true);
  assert.ok(mgr.validate(s[2].token));
  assert.equal(list().some((x) => x.userId === 'u2'), true);

  advance(100_000);
  assert.ok(mgr.sweep() >= 1);
  assert.equal(list().length, 0);
  assert.ok(revoked.length >= 4);
});

test('sessions: isAlive never extends a session', () => {
  const { mgr, advance } = makeSessions();
  const a = mgr.create('u1');
  advance(9_000);
  assert.equal(mgr.isAlive(a.session.id), true);
  advance(2_000);
  assert.equal(mgr.isAlive(a.session.id), false);
});

// ---------- csrf & origin
test('CSRF tokens are bound to the session and the secret', () => {
  const secret = 's'.repeat(40);
  const t = csrfTokenFor('session-A', secret);
  assert.equal(verifyCsrfToken('session-A', t, secret), true);
  assert.equal(verifyCsrfToken('session-B', t, secret), false);
  assert.equal(verifyCsrfToken('session-A', t, 'other'.repeat(10)), false);
  assert.equal(verifyCsrfToken('session-A', '', secret), false);
  assert.equal(verifyCsrfToken('session-A', undefined, secret), false);
  assert.equal(verifyCsrfToken('session-A', t + 'x', secret), false);
});

test('mutation origin check: allow-list, referer fallback, cross-site and missing headers rejected', () => {
  const allowed = ['https://souq.example.com'];
  assert.equal(checkMutationOrigin({ origin: 'https://souq.example.com' }, allowed).ok, true);
  assert.equal(checkMutationOrigin({ origin: 'https://evil.example' }, allowed).ok, false);
  assert.equal(checkMutationOrigin({ origin: 'null' }, allowed).ok, false);
  assert.equal(checkMutationOrigin({}, allowed).ok, false);
  assert.equal(checkMutationOrigin({ referer: 'https://souq.example.com/page?x=1' }, allowed).ok, true);
  assert.equal(checkMutationOrigin({ referer: 'https://evil.example/souq.example.com' }, allowed).ok, false);
  assert.equal(checkMutationOrigin({ origin: 'https://souq.example.com', secFetchSite: 'cross-site' }, allowed).ok, false);
});

// ---------- rate limiting
test('rate limiter blocks after max hits, reports Retry-After, resets and expires', () => {
  let t = 0;
  const rl = new RateLimiter({ max: 3, windowMs: 1000, now: () => t });
  for (let i = 0; i < 3; i++) rl.hit('k');
  const blocked = rl.check('k');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 1000);
  assert.equal(rl.check('other').allowed, true);
  rl.reset('k');
  assert.equal(rl.check('k').allowed, true);
  for (let i = 0; i < 3; i++) rl.hit('k');
  t = 1001;
  assert.equal(rl.check('k').allowed, true);
});

// ---------- config
test('production config refuses to start without secrets/origins and uses __Host- Secure cookies', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET|ALLOWED_ORIGINS|APP_URL/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_URL: 'https://a.example' }), /SESSION_SECRET/);
  const cfg = loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(40),
    APP_URL: 'https://a.example/app',
    DEMO_ACCOUNTS: 'true',
  });
  assert.equal(cfg.cookieName, '__Host-sid');
  assert.equal(cfg.cookieSecure, true);
  assert.deepEqual(cfg.allowedOrigins, ['https://a.example']);
  assert.equal(cfg.demoAccounts, false); // never in production
  const dev = loadConfig({ NODE_ENV: 'development', DEMO_ACCOUNTS: 'true' });
  assert.equal(dev.demoAccounts, true);
  assert.equal(dev.cookieSecure, false);
});
