const { createHash, createHmac, randomBytes, timingSafeEqual } = require('crypto');
const { escapeHtml } = require('./security');

// Microsoft Entra ID (Azure AD) sign-in for approvers.
// OIDC authorization-code flow with PKCE (S256), confidential client.
// Env: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET; cookies are signed with
// ADMIN_SESSION_SECRET using purposes distinct from the admin cookies, so an
// approver cookie can never act as an admin cookie (or the reverse).
const BASE_URL = 'https://sponsorships.ztexconstruction.com';
const REDIRECT_URI = `${BASE_URL}/api/auth/callback`;
const DOMAIN_HINT = 'ztexconstruction.com';
const FLOW_COOKIE = 'ztex_oidc_flow';
const SESSION_COOKIE = 'ztex_approver';
const FLOW_SECONDS = 60 * 10;
const SESSION_SECONDS = 60 * 60 * 8;
const PURPOSE_FLOW = 'approver-oidc-flow';
const PURPOSE_SESSION = 'approver';

function msConfig() {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, ADMIN_SESSION_SECRET } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !ADMIN_SESSION_SECRET) return null;
  return { tenant: MS_TENANT_ID, clientId: MS_CLIENT_ID, clientSecret: MS_CLIENT_SECRET };
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function parseCookies(req) {
  const list = {};
  const header = req.headers && req.headers.cookie;
  if (!header) return list;
  header.split(';').forEach(c => {
    const [key, ...val] = c.trim().split('=');
    try { list[key.trim()] = decodeURIComponent(val.join('=')); } catch { /* ignore bad cookie */ }
  });
  return list;
}

// Signed value: base64url(JSON payload) + "." + HMAC. The payload carries its
// purpose and expiry; JSON means dots/@ in emails can't break parsing.
function sign(encoded) {
  return createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(encoded).digest('base64url');
}

function seal(purpose, data, seconds) {
  const encoded = Buffer.from(JSON.stringify({ ...data, purpose, exp: Date.now() + seconds * 1000 })).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function unseal(raw, purpose) {
  if (!process.env.ADMIN_SESSION_SECRET || !raw || typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!safeEqual(parts[1], sign(parts[0]))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch { return null; }
  if (!data || typeof data !== 'object' || data.purpose !== purpose) return null;
  if (!Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
  return data;
}

function cookie(name, value, maxAge, path) {
  return `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const createFlowCookie = flow => cookie(FLOW_COOKIE, seal(PURPOSE_FLOW, flow, FLOW_SECONDS), FLOW_SECONDS, '/api/auth');
const clearFlowCookie = () => cookie(FLOW_COOKIE, '', 0, '/api/auth');
const readFlow = cookies => unseal(cookies[FLOW_COOKIE], PURPOSE_FLOW);

function createSessionCookie(email, name) {
  return cookie(SESSION_COOKIE, seal(PURPOSE_SESSION, { email, name }, SESSION_SECONDS), SESSION_SECONDS, '/');
}

// Returns { email, name } or null.
function readSession(cookies) {
  const data = unseal(cookies[SESSION_COOKIE], PURPOSE_SESSION);
  if (!data || typeof data.email !== 'string' || !data.email) return null;
  return { email: data.email.toLowerCase(), name: typeof data.name === 'string' && data.name ? data.name : data.email };
}

// Only allow coming back to an approve/deny review page on this site.
function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 512) return '/';
  if (!value.startsWith('/api/action?') || /[\\\s\u0000-\u001f]/.test(value)) return '/';
  return value;
}

function loginUrl(returnTo) {
  return `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

// Build the authorize redirect + the flow state to remember in a cookie.
function beginLogin(config, returnTo) {
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    domain_hint: DOMAIN_HINT
  });
  const url = `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize?${params}`;
  return { url, flow: { state, nonce, verifier, returnTo: safeReturnTo(returnTo) } };
}

async function redeemCode(config, code, verifier) {
  const resp = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      scope: 'openid profile email'
    }).toString()
  });
  let body = {};
  try { body = await resp.json(); } catch { /* non-JSON error */ }
  if (!resp.ok || !body.id_token) {
    throw new Error(`token endpoint ${resp.status}: ${body.error || 'no id_token'}`);
  }
  return body.id_token;
}

// The ID token came straight from the token endpoint over TLS to this
// confidential client, so per OIDC Core 3.1.3.7 the TLS server validation
// stands in for signature checking. Claims are still validated.
// Returns { email, name } or throws.
function validateIdToken(config, idToken, expectedNonce) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed id_token');
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch { throw new Error('malformed id_token'); }
  if (claims.iss !== `https://login.microsoftonline.com/${config.tenant}/v2.0`) throw new Error('wrong issuer');
  const audOk = Array.isArray(claims.aud) ? claims.aud.length === 1 && claims.aud[0] === config.clientId : claims.aud === config.clientId;
  if (!audOk) throw new Error('wrong audience');
  if (claims.tid !== config.tenant) throw new Error('wrong tenant');
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, expectedNonce)) throw new Error('nonce mismatch');
  if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('token expired');
  const email = String(claims.preferred_username || claims.email || '').trim().toLowerCase();
  if (!email) throw new Error('no username in id_token');
  const name = String(claims.name || '').trim() || email;
  return { email, name };
}

function messagePage(title, message, status = 200) {
  return {
    status,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)} — ZTEX Sponsorships</title>
  <style>
    body { margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Arial,sans-serif;
           display:flex;align-items:center;justify-content:center;min-height:100vh; }
    .card { background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:48px 56px;
            text-align:center;max-width:480px; }
    h1 { color:#fff;font-size:24px;font-weight:700;margin:0 0 12px; }
    p { color:#999;font-size:15px;line-height:1.6;margin:0; }
  </style>
</head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body>
</html>`
  };
}

function sendPage(res, page) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(page.status).send(page.html);
}

const notConfiguredPage = () => messagePage('Sign-in unavailable',
  "Approver sign-in isn't configured yet. Please contact the site administrator.", 503);

module.exports = {
  REDIRECT_URI,
  msConfig,
  parseCookies,
  createFlowCookie,
  clearFlowCookie,
  readFlow,
  createSessionCookie,
  readSession,
  safeReturnTo,
  loginUrl,
  beginLogin,
  redeemCode,
  validateIdToken,
  safeEqual,
  messagePage,
  sendPage,
  notConfiguredPage
};
