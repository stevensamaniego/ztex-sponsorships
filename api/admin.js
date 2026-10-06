const { Redis } = require('@upstash/redis');
const { escapeHtml } = require('../lib/security');
const { getSettings, saveSettings, parseLines } = require('../lib/settings');
const {
  checkCredentials, createSessionCookie, clearSessionCookie, createMfaPendingCookie,
  clearMfaPendingCookie, isAuthenticated, isMfaPending,
  clientIp, isLockedOut, recordFailedLogin, clearFailedLogins
} = require('../lib/auth');
const { isEnrolled, beginEnrollment, confirmEnrollment, verifyLoginCode } = require('../lib/mfa');

const redis = Redis.fromEnv();

function parseCookies(req) {
  const list = {};
  const header = req.headers.cookie;
  if (!header) return list;
  header.split(';').forEach(cookie => {
    const [key, ...val] = cookie.trim().split('=');
    try { list[key.trim()] = decodeURIComponent(val.join('=')); } catch { /* ignore bad cookie */ }
  });
  return list;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function page(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} — ZTEX Sponsorships</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; font-family: 'Helvetica Neue', Arial, sans-serif;
           display: flex; align-items: flex-start; justify-content: center;
           min-height: 100vh; padding: 40px 16px; color: #ddd; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
            padding: 40px 48px; max-width: 560px; width: 100%; }
    .logo { font-size: 14px; font-weight: 700; letter-spacing: 3px; color: #fff;
            text-transform: uppercase; margin-bottom: 28px; padding-bottom: 20px;
            border-bottom: 1px solid #2a2a2a; display: flex; justify-content: space-between; align-items: center; }
    .logo span { color: #C41E3A; }
    h1 { color: #fff; font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { color: #777; font-size: 14px; margin-bottom: 28px; }
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 2px;
                     text-transform: uppercase; color: #C41E3A; margin-bottom: 8px; }
    .hint { font-size: 12px; color: #666; margin-bottom: 10px; line-height: 1.5; }
    .field { margin-bottom: 24px; }
    .field label { display: block; font-size: 12px; color: #999; margin-bottom: 7px; font-weight: 500; }
    input, textarea { width: 100%; background: #111; border: 1px solid #333; border-radius: 5px;
      padding: 10px 14px; color: #fff; font-size: 14px; font-family: inherit; outline: none; }
    input:focus, textarea:focus { border-color: #C41E3A; }
    textarea { resize: vertical; min-height: 90px; line-height: 1.6; }
    .btn { width: 100%; padding: 14px; background: #C41E3A; color: #fff; font-size: 15px;
           font-weight: 700; border: none; border-radius: 5px; cursor: pointer; }
    .btn:hover { opacity: 0.9; }
    .link-btn { background: none; border: 1px solid #333; color: #999; font-size: 12px;
                padding: 6px 12px; border-radius: 4px; cursor: pointer; letter-spacing: 0; text-transform: none; }
    .msg { padding: 12px 14px; border-radius: 5px; font-size: 14px; margin-bottom: 24px; }
    .msg.ok { background: #1a7a3c22; border: 1px solid #1a7a3c; color: #6fd394; }
    .msg.err { background: #C41E3A22; border: 1px solid #C41E3A; color: #ff8a9b; }
    .qr { text-align: center; margin: 8px 0 20px; }
    .qr img { border-radius: 8px; width: 220px; height: 220px; }
    .key { font-family: Menlo, Consolas, monospace; font-size: 14px; color: #fff; background: #111;
           border: 1px solid #333; border-radius: 5px; padding: 10px 14px; text-align: center;
           letter-spacing: 1px; margin-bottom: 24px; word-break: break-all; }
    .code { font-size: 22px; letter-spacing: 8px; text-align: center; }
    ol.steps { color: #999; font-size: 13px; line-height: 1.7; margin: 0 0 18px 18px; }
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

function loginPage(error) {
  return page('Admin Login', `
    <div class="logo"><div>ZTEX <span>Construction</span></div></div>
    <h1>Sponsorship Admin</h1>
    <p class="subtitle">Sign in to manage approvers and notification emails.</p>
    ${error ? `<div class="msg err">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="login">
      <div class="field"><label>Username</label><input name="username" autocomplete="username" required autofocus></div>
      <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn" type="submit">Sign In</button>
    </form>`);
}

function codeForm(buttonLabel) {
  return `
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="mfa">
      <div class="field"><label>6-digit code</label>
        <input class="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus></div>
      <button class="btn" type="submit">${buttonLabel}</button>
    </form>
    <form method="POST" action="/admin" style="margin-top:14px;text-align:center;">
      <input type="hidden" name="action" value="logout"><button class="link-btn" type="submit">Cancel</button>
    </form>`;
}

function mfaChallengePage(error) {
  return page('2-Step Verification', `
    <div class="logo"><div>ZTEX <span>Construction</span></div></div>
    <h1>2-Step Verification</h1>
    <p class="subtitle">Enter the 6-digit code from your authenticator app for ZTEX Sponsorships.</p>
    ${error ? `<div class="msg err">${escapeHtml(error)}</div>` : ''}
    ${codeForm('Verify')}`);
}

function mfaEnrollPage({ qr, manualKey }, error) {
  return page('Set Up 2-Step Verification', `
    <div class="logo"><div>ZTEX <span>Construction</span></div></div>
    <h1>Set Up 2-Step Verification</h1>
    <p class="subtitle">Required for the admin account. This is a one-time setup.</p>
    ${error ? `<div class="msg err">${escapeHtml(error)}</div>` : ''}
    <ol class="steps">
      <li>Open Microsoft Authenticator, Google Authenticator, or a similar app.</li>
      <li>Add an account and scan this QR code.</li>
      <li>Enter the 6-digit code the app shows.</li>
    </ol>
    <div class="qr"><img src="${qr}" alt="QR code for authenticator app"></div>
    <p class="hint" style="text-align:center;">Can't scan? Enter this key manually:</p>
    <div class="key">${escapeHtml(manualKey)}</div>
    ${codeForm('Confirm & Sign In')}`);
}

async function mfaPage(error) {
  if (await isEnrolled(redis)) return mfaChallengePage(error);
  return mfaEnrollPage(await beginEnrollment(redis, process.env.ADMIN_USERNAME), error);
}

function settingsPage(settings, message, isError) {
  const lines = list => escapeHtml(list.join('\n'));
  return page('Admin', `
    <div class="logo"><div>ZTEX <span>Construction</span></div>
      <form method="POST" action="/admin"><input type="hidden" name="action" value="logout">
        <button class="link-btn" type="submit">Sign out</button></form>
    </div>
    <h1>Sponsorship Settings</h1>
    <p class="subtitle">Changes apply to new requests and decisions immediately.</p>
    ${message ? `<div class="msg ${isError ? 'err' : 'ok'}">${escapeHtml(message)}</div>` : ''}
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="save">

      <div class="field">
        <p class="section-title">Approvers</p>
        <p class="hint">Names shown in the "Approving / Denying As" list on the approval page. One per line.</p>
        <textarea name="approvers">${lines(settings.approvers)}</textarea>
      </div>

      <div class="field">
        <p class="section-title">New Request Inbox</p>
        <p class="hint">Who receives new sponsorship requests with the Approve / Deny buttons. One email per line.</p>
        <textarea name="requestEmails">${lines(settings.requestEmails)}</textarea>
      </div>

      <div class="field">
        <p class="section-title">Marketing Team</p>
        <p class="hint">Who is notified when a request is approved or denied. One email per line.</p>
        <textarea name="marketingEmails">${lines(settings.marketingEmails)}</textarea>
      </div>

      <button class="btn" type="submit">Save Changes</button>
    </form>`);
}

function send(res, html, status = 200) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  return res.status(status).send(html);
}

module.exports = async (req, res) => {
  const cookies = parseCookies(req);
  const authed = isAuthenticated(cookies);

  if (req.method === 'GET') {
    if (authed) return send(res, settingsPage(await getSettings(redis)));
    if (isMfaPending(cookies)) return send(res, await mfaPage());
    return send(res, loginPage());
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!sameOrigin(req)) return res.status(403).send('Forbidden');

  const body = req.body || {};

  if (body.action === 'login') {
    const ip = clientIp(req);
    if (await isLockedOut(redis, ip)) {
      return send(res, loginPage('Too many failed attempts. Try again in 15 minutes.'), 429);
    }
    if (!checkCredentials(body.username, body.password)) {
      await recordFailedLogin(redis, ip);
      return send(res, loginPage('Incorrect username or password.'), 401);
    }
    // Password OK — the session is only issued after the 2-step code
    res.setHeader('Set-Cookie', createMfaPendingCookie());
    res.setHeader('Location', '/admin');
    return res.status(303).send('');
  }

  if (body.action === 'mfa') {
    if (!isMfaPending(cookies)) return send(res, loginPage('Your sign-in expired. Please start again.'), 401);
    const ip = clientIp(req);
    if (await isLockedOut(redis, ip)) {
      res.setHeader('Set-Cookie', clearMfaPendingCookie());
      return send(res, loginPage('Too many failed attempts. Try again in 15 minutes.'), 429);
    }
    const enrolled = await isEnrolled(redis);
    const ok = enrolled
      ? await verifyLoginCode(redis, body.code)
      : await confirmEnrollment(redis, body.code);
    if (!ok) {
      await recordFailedLogin(redis, ip);
      return send(res, await mfaPage("That code didn't work. Check the app and try the current code."), 401);
    }
    await clearFailedLogins(redis, ip);
    res.setHeader('Set-Cookie', [createSessionCookie(), clearMfaPendingCookie()]);
    res.setHeader('Location', '/admin');
    return res.status(303).send('');
  }

  if (body.action === 'logout') {
    res.setHeader('Set-Cookie', [clearSessionCookie(), clearMfaPendingCookie()]);
    res.setHeader('Location', '/admin');
    return res.status(303).send('');
  }

  if (!authed) return send(res, loginPage('Your session expired. Please sign in again.'), 401);

  if (body.action === 'save') {
    const approvers = parseLines(body.approvers, { label: 'Approvers' });
    const requestEmails = parseLines(body.requestEmails, { label: 'New Request Inbox', email: true });
    const marketingEmails = parseLines(body.marketingEmails, { label: 'Marketing Team', email: true });
    const error = approvers.error || requestEmails.error || marketingEmails.error;
    if (error) {
      const current = await getSettings(redis);
      // Re-show what was typed for the fields that parsed, so nothing is lost
      return send(res, settingsPage({
        approvers: approvers.values || current.approvers,
        requestEmails: requestEmails.values || current.requestEmails,
        marketingEmails: marketingEmails.values || current.marketingEmails
      }, error, true), 400);
    }
    const settings = {
      approvers: approvers.values,
      requestEmails: requestEmails.values,
      marketingEmails: marketingEmails.values
    };
    await saveSettings(redis, settings);
    return send(res, settingsPage(settings, 'Saved.'));
  }

  return res.status(400).send('Invalid request.');
};
