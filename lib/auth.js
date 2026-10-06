const { scryptSync, createHmac, timingSafeEqual } = require('crypto');

// Single admin account. Credentials come from Vercel env vars:
//   ADMIN_USERNAME, ADMIN_PASSWORD_HASH (scrypt$N$r$p$salt$hash, base64), ADMIN_SESSION_SECRET
const COOKIE = 'ztex_admin';
const MFA_COOKIE = 'ztex_admin_mfa';
const SESSION_SECONDS = 60 * 60 * 8;
const MFA_PENDING_SECONDS = 60 * 5;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_SECONDS = 60 * 15;

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
  });
  return timingSafeEqual(actual, expected);
}

function checkCredentials(username, password) {
  const { ADMIN_USERNAME, ADMIN_PASSWORD_HASH } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) return false;
  const userOk = safeEqual(String(username || '').toLowerCase(), ADMIN_USERNAME.toLowerCase());
  const passOk = verifyPassword(password, ADMIN_PASSWORD_HASH);
  return userOk && passOk;
}

function sign(payload) {
  return createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}

// Signed cookie values carry a purpose so a password-only "mfa" cookie can
// never be used as a full session.
function makeToken(purpose, seconds) {
  const expires = Date.now() + seconds * 1000;
  const payload = `${purpose}.${process.env.ADMIN_USERNAME}.${expires}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function readToken(raw, purpose) {
  if (!process.env.ADMIN_SESSION_SECRET || !process.env.ADMIN_USERNAME || !raw) return false;
  const [encoded, sig] = raw.split('.');
  if (!encoded || !sig) return false;
  const payload = Buffer.from(encoded, 'base64url').toString();
  if (!safeEqual(sig, sign(payload))) return false;
  const first = payload.indexOf('.');
  const last = payload.lastIndexOf('.');
  if (first < 0 || last <= first) return false;
  const tokenPurpose = payload.slice(0, first);
  const user = payload.slice(first + 1, last);
  const expires = Number(payload.slice(last + 1));
  return tokenPurpose === purpose && user === process.env.ADMIN_USERNAME &&
    Number.isFinite(expires) && expires > Date.now();
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function createSessionCookie() {
  return cookie(COOKIE, makeToken('session', SESSION_SECONDS), SESSION_SECONDS);
}

function clearSessionCookie() {
  return cookie(COOKIE, '', 0);
}

// Issued after a correct password; only lets the user reach the 2-step code screen.
function createMfaPendingCookie() {
  return cookie(MFA_COOKIE, makeToken('mfa', MFA_PENDING_SECONDS), MFA_PENDING_SECONDS);
}

function clearMfaPendingCookie() {
  return cookie(MFA_COOKIE, '', 0);
}

function isAuthenticated(cookies) {
  return readToken(cookies[COOKIE], 'session');
}

function isMfaPending(cookies) {
  return readToken(cookies[MFA_COOKIE], 'mfa');
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

async function isLockedOut(redis, ip) {
  const count = Number(await redis.get(`admin-fail:${ip}`)) || 0;
  return count >= MAX_FAILED_LOGINS;
}

async function recordFailedLogin(redis, ip) {
  const key = `admin-fail:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, LOCKOUT_SECONDS);
}

async function clearFailedLogins(redis, ip) {
  await redis.del(`admin-fail:${ip}`);
}

module.exports = {
  checkCredentials,
  createSessionCookie,
  clearSessionCookie,
  createMfaPendingCookie,
  clearMfaPendingCookie,
  isAuthenticated,
  isMfaPending,
  clientIp,
  isLockedOut,
  recordFailedLogin,
  clearFailedLogins
};
