const { Redis } = require('@upstash/redis');
const { escapeHtml } = require('../lib/security');
const { getSettings, saveSettings, parseLines } = require('../lib/settings');
const {
  checkCredentials, createSessionCookie, clearSessionCookie, createMfaPendingCookie,
  clearMfaPendingCookie, isAuthenticated, isMfaPending,
  clientIp, isLockedOut, recordFailedLogin, clearFailedLogins
} = require('../lib/auth');
const { isEnrolled, beginEnrollment, confirmEnrollment, verifyLoginCode } = require('../lib/mfa');
const { Readable } = require('stream');
const { get: getBlob } = require('@vercel/blob');
const { listRequests, ledgerKey } = require('../lib/ledger');
const { isUploadPath } = require('../lib/files');
const { isValidToken, parseStored } = require('../lib/security');
const { tierLabel } = require('../lib/tiers');
const { formatEventWhen } = require('../lib/calendar');

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

function page(title, body, size) {
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
                padding: 6px 12px; border-radius: 4px; cursor: pointer; letter-spacing: 0; text-transform: none; white-space: nowrap; }
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
    .card.wide { max-width: 1080px; padding: 32px 36px; }
    .card.mid { max-width: 680px; }
    .topbar { display: flex; align-items: center; gap: 18px; }
    .tabs { display: flex; gap: 4px; }
    .tab { white-space: nowrap; color: #888; font-size: 12px; font-weight: 600; letter-spacing: 1px; text-decoration: none;
           padding: 7px 12px; border-radius: 4px; }
    .tab:hover { color: #fff; }
    .tab.on { color: #fff; background: #2a2a2a; }
    .tab .count { background: #D4AF37; color: #111; border-radius: 100px; padding: 1px 7px; margin-left: 6px; font-size: 11px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat { display: block; text-decoration: none; background: #141414; border: 1px solid #2a2a2a;
            border-radius: 8px; padding: 16px 18px; border-top: 3px solid var(--c); }
    .stat:hover, .stat.on { border-color: var(--c); }
    .stat .n { font-size: 28px; font-weight: 700; color: #fff; }
    .stat .l { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #888; margin-top: 2px; }
    .stat .s { font-size: 12px; color: #aaa; margin-top: 6px; }
    .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .toolbar form { flex: 1; min-width: 220px; display: flex; gap: 8px; }
    .toolbar input { padding: 8px 12px; font-size: 13px; }
    .small-btn { white-space: nowrap; background: #222; border: 1px solid #333; color: #ccc; font-size: 12px;
                 padding: 8px 12px; border-radius: 5px; cursor: pointer; text-decoration: none; font-family: inherit; }
    .small-btn:hover { color: #fff; border-color: #555; }
    .pill { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
            padding: 4px 10px; border-radius: 100px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent);
            border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); }
    .s-pending { --c: #D4AF37; } .s-approved { --c: #3fbf6f; } .s-denied { --c: #e0435a; } .s-expired { --c: #777; } .s-all { --c: #aaa; }
    .ledger { border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; }
    .ledger-head, .ledger summary { display: grid; grid-template-columns: 104px minmax(0,2.2fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.3fr) 14px;
            gap: 14px; align-items: center; padding: 12px 16px; }
    .ledger-head { background: #141414; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #777; font-weight: 700; }
    .ledger details { border-top: 1px solid #242424; }
    .ledger summary { cursor: pointer; list-style: none; font-size: 13px; }
    .ledger summary::-webkit-details-marker { display: none; }
    .ledger summary:hover { background: #202020; }
    .ledger details[open] summary { background: #202020; }
    .ledger summary::after { content: '›'; color: #666; font-size: 18px; transition: transform .15s; }
    .ledger details[open] summary::after { transform: rotate(90deg); }
    .org { color: #fff; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sub { color: #888; font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .amt { color: #fff; font-weight: 600; }
    .amt .was { color: #777; font-weight: 400; font-size: 11px; text-decoration: line-through; margin-left: 4px; }
    .detail { padding: 6px 16px 20px 134px; background: #181818; display: grid; grid-template-columns: 1fr 1fr; gap: 18px 32px; }
    .detail h4 { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #C41E3A; margin: 14px 0 8px; }
    .detail dl { display: grid; grid-template-columns: 120px 1fr; gap: 6px 12px; font-size: 13px; }
    .detail dt { color: #777; } .detail dd { color: #ddd; overflow-wrap: anywhere; }
    .detail dd a { color: #e0435a; }
    .detail .full { grid-column: 1 / -1; }
    .detail .text { font-size: 13px; color: #ccc; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
    .empty { padding: 48px 16px; text-align: center; color: #777; font-size: 14px; }
    .foot { color: #666; font-size: 12px; margin-top: 12px; }
    @media (max-width: 760px) {
      .card.wide, .card.mid { padding: 22px 16px; }
      .logo { flex-wrap: wrap; gap: 14px; }
      .topbar { width: 100%; justify-content: space-between; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .ledger-head { display: none; }
      .ledger summary { grid-template-columns: 1fr auto; gap: 6px 12px; }
      .ledger summary > .c-org { grid-column: 1 / -1; order: -1; }
      .ledger summary > .c-date, .ledger summary > .c-by { display: none; }
      .ledger summary::after { display: none; }
      .detail { padding: 6px 16px 18px; grid-template-columns: 1fr; }
      .detail dl { grid-template-columns: 100px 1fr; }
    }
  </style>
</head>
<body><div class="card${size ? ' ' + size : ''}">${body}</div></body>
</html>`;
}

function loginPage(error) {
  return page('Admin Login', `
    <div class="logo"><div>ZTEX <span>Construction</span></div></div>
    <h1>Sponsorship Admin</h1>
    <p class="subtitle">Sign in to review requests and manage settings.</p>
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

function topbar(active, pendingCount) {
  const tab = (key, label, extra = '') =>
    `<a class="tab${active === key ? ' on' : ''}" href="/admin${key === 'requests' ? '' : '?view=' + key}">${label}${extra}</a>`;
  return `
    <div class="logo"><div>ZTEX <span>Construction</span></div>
      <div class="topbar">
        <nav class="tabs">
          ${tab('requests', 'REQUESTS', pendingCount ? `<span class="count">${pendingCount}</span>` : '')}
          ${tab('settings', 'SETTINGS')}
        </nav>
        <form method="POST" action="/admin"><input type="hidden" name="action" value="logout">
          <button class="link-btn" type="submit">Sign out</button></form>
      </div>
    </div>`;
}

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', denied: 'Denied', expired: 'Expired' };
const TZ = 'America/Denver';

function parseMoney(v) {
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function money(n) {
  return n === null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtShortDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtEventDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

// Requested vs. final amount; approved requests may have been adjusted by the approver.
function amounts(r) {
  const requested = parseMoney(r.sponsorshipAmount);
  const adjusted = parseMoney(r.adjustedAmount);
  const final = r.status === 'approved' ? (adjusted ?? requested) : requested;
  return { requested, final, changed: r.status === 'approved' && adjusted !== null && adjusted !== requested };
}

function matchesQuery(r, q) {
  if (!q) return true;
  const hay = [r.orgName, r.contactName, r.email, r.phone, r.eventName, r.approver, r.approverEmail]
    .filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(term => hay.includes(term));
}

function ledgerRow(r) {
  const { requested, final, changed } = amounts(r);
  const tier = r.status === 'approved' && r.adjustedTier ? tierLabel(r.adjustedTier, r.adjustedTierOther) : tierLabel(r.sponsorshipTier, r.sponsorshipTierOther);
  const field = (label, value) => `<dt>${label}</dt><dd>${value || '—'}</dd>`;
  const e = escapeHtml;
  return `
    <details>
      <summary>
        <span><span class="pill s-${r.status}">${STATUS_LABELS[r.status] || e(r.status)}</span></span>
        <span class="c-org"><div class="org">${e(r.orgName) || '(no name)'}</div><div class="sub">${e(r.eventName) || '—'}</div></span>
        <span class="amt">${money(final)}${changed ? `<span class="was">${money(requested)}</span>` : ''}</span>
        <span class="c-date"><div>${fmtShortDate(r.submittedAt)}</div><div class="sub">Event ${fmtEventDate(r.eventDate)}</div></span>
        <span class="c-by"><div>${r.approver ? e(r.approver) : '<span class="sub">—</span>'}</div>${r.decidedAt ? `<div class="sub">${fmtShortDate(r.decidedAt)}</div>` : ''}</span>
      </summary>
      <div class="detail">
        <div>
          <h4>Contact</h4>
          <dl>
            ${field('Organization', e(r.orgName))}
            ${field('Contact', e(r.contactName))}
            ${field('Email', r.email ? `<a href="mailto:${e(r.email)}">${e(r.email)}</a>` : '')}
            ${field('Phone', r.phone ? `<a href="tel:${e(String(r.phone).replace(/[^0-9+]/g, ''))}">${e(r.phone)}</a>` : '')}
          </dl>
          <h4>Request</h4>
          <dl>
            ${field('Event', e(r.eventName))}
            ${field('Event date', e(formatEventWhen(r.eventDate, r.eventTime, { weekday: false })) || '—')}
            ${field('Amount', money(requested))}
            ${field('Tier', e(tierLabel(r.sponsorshipTier, r.sponsorshipTierOther)))}
            ${field('Submitted', fmtDateTime(r.submittedAt))}
            ${field('Attachments', (r.files || []).map(f => typeof f === 'string' || !f.pathname
              ? e(f.name || f)
              : `<a href="/admin?download=${encodeURIComponent(r.id)}&amp;file=${encodeURIComponent(f.pathname)}">${e(f.name)}</a>`).join('<br>'))}
          </dl>
        </div>
        <div>
          <h4>Decision</h4>
          <dl>
            ${field('Status', `<span class="pill s-${r.status}">${STATUS_LABELS[r.status] || e(r.status)}</span>`)}
            ${field('Decided by', r.approver ? `${e(r.approver)}${r.approverEmail ? `<br><span class="sub">${e(r.approverEmail)}</span>` : ''}` : '')}
            ${field('Decided', fmtDateTime(r.decidedAt))}
            ${r.status === 'approved' ? field('Approved amount', money(final)) + field('Approved tier', e(tier))
              + field('Calendar invite', !r.invite ? '' : r.invite.sent ? `Sent to ${r.invite.to} people` : `<span style="color:#e0435a;">Not sent (${e(r.invite.reason)})</span>`) : ''}
          </dl>
          ${r.bossNotes ? `<h4>Notes from leadership</h4><div class="text">${e(r.bossNotes)}</div>` : ''}
          ${r.status === 'pending' ? `<p class="foot">Waiting on an approver. They act from the Approve / Deny buttons in the request email. ${r.reminders
            ? `Reminders sent: ${r.reminders.count} (last ${fmtShortDate(r.reminders.lastAt)}).`
            : 'Approvers are reminded after 5 days, then every 5 days.'}</p>` : ''}
          ${r.status === 'expired' ? '<p class="foot">No decision was made before the approve/deny links expired (90 days).</p>' : ''}
        </div>
        ${r.description ? `<div class="full"><h4>Description</h4><div class="text">${e(r.description)}</div></div>` : ''}
        ${r.additionalNotes ? `<div class="full"><h4>Additional notes</h4><div class="text">${e(r.additionalNotes)}</div></div>` : ''}
      </div>
    </details>`;
}

function requestsPage(rows, { status, q }) {
  const count = s => rows.filter(r => r.status === s).length;
  const approvedTotal = rows.filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (amounts(r).final || 0), 0);
  const pendingTotal = rows.filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + (amounts(r).final || 0), 0);
  const filtered = rows.filter(r => (!status || r.status === status) && matchesQuery(r, q));

  const qs = s => {
    const p = new URLSearchParams();
    if (s) p.set('status', s);
    if (q) p.set('q', q);
    const str = p.toString();
    return '/admin' + (str ? '?' + str : '');
  };
  const stat = (s, label, sub) => `
    <a class="stat s-${s || 'all'}${(status || '') === (s || '') ? ' on' : ''}" href="${qs(s)}">
      <div class="n">${s ? count(s) : rows.length}</div><div class="l">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}
    </a>`;
  const exportParams = new URLSearchParams({ export: 'csv' });
  if (status) exportParams.set('status', status);
  if (q) exportParams.set('q', q);

  return page('Requests', `
    ${topbar('requests', count('pending'))}
    <h1>Sponsorship Requests</h1>
    <p class="subtitle">Every request submitted through the portal and what happened to it. Click a row for full details.</p>
    <div class="stats">
      ${stat('pending', 'Pending', pendingTotal ? `${money(pendingTotal)} requested` : 'Nothing waiting')}
      ${stat('approved', 'Approved', `${money(approvedTotal)} committed`)}
      ${stat('denied', 'Denied')}
      ${stat('', 'All requests', count('expired') ? `${count('expired')} expired` : '')}
    </div>
    <div class="toolbar">
      <form method="GET" action="/admin">
        ${status ? `<input type="hidden" name="status" value="${escapeHtml(status)}">` : ''}
        <input name="q" value="${escapeHtml(q)}" placeholder="Search organization, contact, event, approver…">
        <button class="small-btn" type="submit">Search</button>
        ${q ? `<a class="small-btn" href="${status ? '/admin?status=' + status : '/admin'}">Clear</a>` : ''}
      </form>
      <a class="small-btn" href="/admin?${exportParams}">Export CSV</a>
    </div>
    <div class="ledger">
      <div class="ledger-head"><span>Status</span><span>Organization / Event</span><span>Amount</span><span>Submitted</span><span>Decided by</span><span></span></div>
      ${filtered.length ? filtered.map(ledgerRow).join('') : `<div class="empty">${rows.length ? 'No requests match this filter.' : 'No requests yet. New submissions will appear here.'}</div>`}
    </div>
    <p class="foot">Showing ${filtered.length} of ${rows.length}. Times are Mountain Time.</p>`, 'wide');
}

function csvCell(v) {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet apps from running it as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function requestsCsv(rows) {
  const cols = [
    ['Status', r => STATUS_LABELS[r.status] || r.status],
    ['Submitted', r => r.submittedAt ? new Date(r.submittedAt).toISOString() : ''],
    ['Organization', r => r.orgName], ['Contact', r => r.contactName], ['Email', r => r.email], ['Phone', r => r.phone],
    ['Event', r => r.eventName], ['Event Date', r => r.eventDate], ['Event Time', r => r.eventTime],
    ['Requested Amount', r => amounts(r).requested ?? ''], ['Requested Tier', r => tierLabel(r.sponsorshipTier, r.sponsorshipTierOther)],
    ['Approved Amount', r => r.status === 'approved' ? amounts(r).final ?? '' : ''],
    ['Approved Tier', r => r.status !== 'approved' ? '' : r.adjustedTier ? tierLabel(r.adjustedTier, r.adjustedTierOther) : tierLabel(r.sponsorshipTier, r.sponsorshipTierOther)],
    ['Decided By', r => r.approver], ['Decided By Email', r => r.approverEmail],
    ['Decided', r => r.decidedAt ? new Date(r.decidedAt).toISOString() : ''],
    ['Leadership Notes', r => r.bossNotes], ['Description', r => r.description],
    ['Additional Notes', r => r.additionalNotes], ['Attachments', r => (r.files || []).map(f => (f && f.name) || f).join('; ')]
  ];
  return [cols.map(c => c[0]), ...rows.map(r => cols.map(c => c[1](r)))]
    .map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function cleanupNote(last) {
  const when = 'Unused attachments (files from abandoned forms) are deleted automatically on the 1st of January, April, July and October.';
  if (!last) return `${when} It hasn't run yet.`;
  const mb = (last.freedBytes / 1048576).toFixed(1);
  return `${when} Last run ${fmtDateTime(last.ranAt)}: ${last.deleted} file${last.deleted === 1 ? '' : 's'} removed (${mb} MB), ${last.kept} kept.`;
}

async function lastCleanup() {
  const v = await redis.get('cleanup:last');
  return v ? parseStored(v) : null;
}

function settingsPage(settings, message, isError, last) {
  const lines = list => escapeHtml(list.join('\n'));
  return page('Admin', `
    ${topbar('settings')}
    <h1>Sponsorship Settings</h1>
    <p class="subtitle">Changes apply to new requests and decisions immediately.</p>
    ${message ? `<div class="msg ${isError ? 'err' : 'ok'}">${escapeHtml(message)}</div>` : ''}
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="save">

      <div class="field">
        <p class="section-title">Approvers (Microsoft 365 emails)</p>
        <p class="hint">People allowed to approve or deny. They sign in with their ZTEX Microsoft account. One email per line.</p>
        ${settings.approvers.length ? '' : '<div class="msg err">No approvers are set, so nobody can approve or deny requests. Add at least one Microsoft 365 email.</div>'}
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
    </form>
    <p class="foot">${escapeHtml(cleanupNote(last))}</p>`, 'mid');
}

// Reminder history for pending requests (kept in reminder:<id>, written by api/reminders.js).
async function attachReminders(rows) {
  const pending = rows.filter(r => r.status === 'pending');
  if (!pending.length) return;
  const values = await redis.mget(...pending.map(r => `reminder:${r.id}`));
  pending.forEach((r, i) => { if (values[i]) r.reminders = parseStored(values[i]); });
}

// Streams one of a request's stored attachments. The file must belong to that ledger entry.
async function downloadFile(res, id, pathname) {
  if (!isValidToken(id) || !isUploadPath(pathname)) return res.status(400).send('Invalid request.');
  const stored = await redis.get(ledgerKey(id));
  const file = stored && (parseStored(stored).files || []).find(f => f && f.pathname === pathname);
  if (!file) return res.status(404).send('File not found.');
  const result = await getBlob(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) return res.status(404).send('File not found.');
  const ascii = String(file.name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200);
  Readable.fromWeb(result.stream).pipe(res);
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
    if (authed) {
      const query = req.query || {};
      if (query.download) return downloadFile(res, query.download, query.file);
      if (query.view === 'settings') return send(res, settingsPage(await getSettings(redis), '', false, await lastCleanup()));
      const status = STATUS_LABELS[query.status] ? query.status : '';
      const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
      const rows = await listRequests(redis);
      await attachReminders(rows);
      if (query.export === 'csv') {
        const filtered = rows.filter(r => (!status || r.status === status) && matchesQuery(r, q));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="sponsorship-requests-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send('﻿' + requestsCsv(filtered));
      }
      return send(res, requestsPage(rows, { status, q }));
    }
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
    const approvers = parseLines(body.approvers, { label: 'Approvers', email: true, lowercase: true });
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
      }, error, true, await lastCleanup()), 400);
    }
    const settings = {
      approvers: approvers.values,
      requestEmails: requestEmails.values,
      marketingEmails: marketingEmails.values
    };
    await saveSettings(redis, settings);
    return send(res, settingsPage(settings, 'Saved.', false, await lastCleanup()));
  }

  return res.status(400).send('Invalid request.');
};
