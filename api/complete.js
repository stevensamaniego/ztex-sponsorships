const { Redis } = require('@upstash/redis');
const { isValidToken, escapeHtml, parseStored } = require('../lib/security');
const { getSettings, canComplete } = require('../lib/settings');
const { ledgerKey, recordCompletion } = require('../lib/ledger');
const { tierLabel } = require('../lib/tiers');
const { formatEventWhen } = require('../lib/calendar');
const { createTransporter } = require('../lib/mail');
const { msConfig, parseCookies, readSession, loginUrl, messagePage, sendPage, notConfiguredPage } = require('../lib/approver');

// "Mark as Completed" link in the approved marketing email. Marketing (or an approver)
// signs in with Microsoft, adds completion notes, and the approvers are emailed.
// The request is looked up in the ledger (the pending record is gone once decided),
// so the link never expires. `completed:<token>` is the atomic claim (no TTL).
const redis = Redis.fromEnv();
const NOTES_MAX = 5000;
const TZ = 'America/Denver';

function completedKey(token) {
  return `completed:${token}`;
}

function formatMoney(value) {
  const n = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '';
}

function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-US', { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Mountain Time';
}

function oneLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

// What was approved, after any adjustment by the approver. Unescaped; callers escape.
function approvedDetails(r) {
  return {
    amount: formatMoney(r.adjustedAmount || r.sponsorshipAmount),
    tier: r.adjustedTier ? tierLabel(r.adjustedTier, r.adjustedTierOther) : tierLabel(r.sponsorshipTier, r.sponsorshipTierOther),
    approver: r.approver ? (r.approverEmail ? `${r.approver} (${r.approverEmail})` : r.approver) : ''
  };
}

function completionForm(token, r, session) {
  const e = escapeHtml;
  const { amount, tier, approver } = approvedDetails(r);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Mark Sponsorship Completed</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; font-family: 'Helvetica Neue', Arial, sans-serif;
           display: flex; align-items: flex-start; justify-content: center;
           min-height: 100vh; padding: 40px 16px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
            padding: 40px 48px; max-width: 560px; width: 100%; }
    .logo { font-size: 14px; font-weight: 700; letter-spacing: 3px; color: #fff;
            text-transform: uppercase; margin-bottom: 28px; padding-bottom: 20px;
            border-bottom: 1px solid #2a2a2a; }
    .logo span { color: #C41E3A; }
    h1 { color: #fff; font-size: 22px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { color: #777; font-size: 14px; margin-bottom: 28px; }
    .info-grid { background: #111; border-radius: 6px; padding: 16px 20px;
                 margin-bottom: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .info-item label { display: block; font-size: 11px; color: #555;
                       text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px; }
    .info-item span { font-size: 14px; color: #ddd; font-weight: 500; }
    .info-item .notes { white-space: pre-wrap; font-weight: 400; color: #bbb; line-height: 1.5; }
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 2px;
                     text-transform: uppercase; color: #C41E3A; margin-bottom: 16px; }
    .field { margin-bottom: 18px; }
    .field label { display: block; font-size: 12px; color: #999; margin-bottom: 7px;
                   font-weight: 500; letter-spacing: 0.5px; }
    .field textarea {
      width: 100%; background: #111; border: 1px solid #333; border-radius: 5px;
      padding: 10px 14px; color: #fff; font-size: 14px; font-family: inherit;
      transition: border-color 0.2s; outline: none; resize: vertical; min-height: 120px; line-height: 1.6; }
    .field textarea:focus { border-color: #C41E3A; }
    .btn { width: 100%; padding: 14px; background: #1a7a3c; color: #fff;
           font-size: 15px; font-weight: 700; border: none; border-radius: 5px;
           cursor: pointer; margin-top: 8px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .divider { border: none; border-top: 1px solid #2a2a2a; margin: 24px 0; }
    .signer { font-size: 14px; color: #999; }
    .signer strong { color: #fff; }
    @media (max-width: 480px) { .card { padding: 28px 20px; } .info-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ZTEX <span>Construction</span></div>
    <h1>🏁 Mark Sponsorship Completed</h1>
    <p class="subtitle">Record that this approved sponsorship has been processed. Leadership will be notified.</p>

    <div class="info-grid">
      <div class="info-item"><label>Organization</label><span>${e(r.orgName)}</span></div>
      <div class="info-item"><label>Contact</label><span>${e(r.contactName)}${r.email ? `<br><span style="font-weight:400;color:#999;">${e(r.email)}</span>` : ''}</span></div>
      <div class="info-item"><label>Event</label><span>${e(r.eventName)}</span></div>
      <div class="info-item"><label>Event Date &amp; Time</label><span>${e(formatEventWhen(r.eventDate, r.eventTime)) || 'Not specified'}</span></div>
      <div class="info-item"><label>Approved Amount</label><span>${e(amount) || 'Not specified'}</span></div>
      <div class="info-item"><label>Approved Tier</label><span>${e(tier) || 'Not specified'}</span></div>
      <div class="info-item" style="grid-column:1 / -1;"><label>Approved By</label><span>${e(approver) || 'Not recorded'}${r.decidedAt ? `<span style="font-weight:400;color:#999;"> on ${e(fmtDate(r.decidedAt))}</span>` : ''}</span></div>
      ${r.bossNotes ? `<div class="info-item" style="grid-column:1 / -1;"><label>Notes from Leadership</label><span class="notes">${e(r.bossNotes)}</span></div>` : ''}
    </div>

    <form method="POST" action="/api/complete">
      <input type="hidden" name="id" value="${token}">

      <p class="section-title">Your Signature</p>
      <div class="field">
        <p class="signer">Completing as <strong>${e(session.name)}</strong> (${e(session.email)})</p>
      </div>

      <hr class="divider">
      <p class="section-title">Completion Notes</p>
      <div class="field">
        <label>Completion Notes <span style="color:#555;font-weight:400;">(optional)</span></label>
        <textarea name="completionNotes" maxlength="${NOTES_MAX}" placeholder="What was delivered, payment/check details, logo placement, anything leadership should know..."></textarea>
      </div>

      <button type="submit" class="btn">Confirm Completion</button>
    </form>
  </div>
</body>
</html>`;
}

function statusPage({ badge, color, title, body }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Arial,sans-serif;
           display:flex;align-items:center;justify-content:center;min-height:100vh; }
    .card { background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:48px 56px;
            text-align:center;max-width:480px; }
    .badge { display:inline-block;background:${color}22;border:1px solid ${color};color:${color};
             font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
             padding:6px 18px;border-radius:100px;margin-bottom:24px; }
    h1 { color:#fff;font-size:24px;font-weight:700;margin:0 0 12px; }
    p { color:#999;font-size:15px;line-height:1.6;margin:0; }
    .who { color:#D4AF37;font-weight:600; }
    a { display:inline-block;margin-top:28px;padding:12px 28px;background:#C41E3A;color:#fff;
        font-size:13px;font-weight:600;text-decoration:none;border-radius:4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${badge}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}

function alreadyCompletedPage(rawOrgName, rawCompletedBy, completedAt) {
  const when = fmtDate(completedAt);
  return statusPage({
    badge: 'Already Completed', color: '#1a7a3c', title: 'Already Completed',
    body: `This sponsorship for <span class="who">${escapeHtml(rawOrgName)}</span> was already marked completed${rawCompletedBy ? ` by <span class="who">${escapeHtml(rawCompletedBy)}</span>` : ''}${when ? ` on ${escapeHtml(when)}` : ''}.<br><br>No further action is needed.`
  });
}

function completedPage(rawOrgName) {
  return statusPage({
    badge: '🏁 Completed', color: '#1a7a3c', title: 'Completion Recorded',
    body: `The sponsorship for <span class="org who">${escapeHtml(rawOrgName)}</span> has been marked as <strong style="color:#fff;">completed</strong>.<br><br>The approvers have been notified.<br><a href="https://sponsorships.ztexconstruction.com">Back to Portal</a>`
  });
}

// Email to the approvers (CC the person who completed it).
function buildCompletionEmail(r, completion) {
  const e = escapeHtml;
  const { amount, tier, approver } = approvedDetails(r);
  const notes = e(completion.completionNotes);
  const row = (label, value, extra = '') => `
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;width:40%;border-bottom:1px solid #f0f0f0;">${label}</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;${extra}">${value}</td>
              </tr>`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">ZTEX CONSTRUCTION</span>
            <p style="color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:10px 0 0;">Sponsorship Completed</p>
          </td>
        </tr>

        <tr>
          <td style="background:#1a7a3c;padding:16px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">🏁 COMPLETED</span>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.7;">The marketing team has finished processing this sponsorship.</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td colspan="2" style="background:#f8f8f8;border-left:3px solid #C41E3A;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C41E3A;">Request Details</td></tr>
              ${row('Organization', e(r.orgName), 'font-weight:600;')}
              ${row('Contact', e(r.contactName))}
              ${row('Email', r.email ? `<a href="mailto:${e(r.email)}" style="color:#C41E3A;">${e(r.email)}</a>` : '')}
              ${row('Phone', e(r.phone))}
              ${row('Event', e(r.eventName))}
              ${row('Event Date &amp; Time', e(formatEventWhen(r.eventDate, r.eventTime)) || 'Not specified')}
              ${row('Approved Amount', e(amount) || 'Not specified', 'font-weight:700;')}
              ${row('Approved Tier', e(tier) || 'Not specified')}
              ${row('Approved By', e(approver) || 'Not recorded')}
            </table>

            ${notes ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              <tr><td style="background:#f8f8f8;border-left:3px solid #D4AF37;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b8960a;">Completion Notes</td></tr>
              <tr><td style="padding:14px;font-size:14px;color:#444;line-height:1.7;white-space:pre-wrap;">${notes}</td></tr>
            </table>` : ''}

            <p style="margin:24px 0 0;font-size:13px;color:#aaa;border-top:1px solid #f0f0f0;padding-top:16px;">
              Completed by: <strong style="color:#444;">${e(completion.completedBy)} (${e(completion.completedByEmail)})</strong> on ${e(fmtDateTime(completion.completedAt))}
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#1a1a1a;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#666;font-size:11px;">© 2026 ZTEX Construction, Inc. — Sponsorship Portal Notification</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendCompletionEmail(transporter, settings, r, completion) {
  const completer = String(completion.completedByEmail || '').toLowerCase();
  const to = settings.approvers.filter(a => a !== completer);
  // The approvers get the notice; the person who completed it gets a copy. With no
  // approvers configured, the copy still goes out so the completion isn't silent.
  const mail = {
    from: '"ZTEX Sponsorships" <sponsorships@ztexconstruction.com>',
    to: (to.length ? to : [completer]).join(', '),
    subject: `🏁 Sponsorship Completed — ${oneLine(r.orgName)}`,
    html: buildCompletionEmail(r, completion)
  };
  if (to.length && completer) mail.cc = completer;
  await transporter.sendMail(mail);
  return { to: to.length ? to.length : 1 };
}

function html(res, body, status = 200) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(body);
}

// Pages for anything other than an approved, not-yet-completed request.
function statusGate(res, id, entry, claim) {
  const completedBy = (c => c && (c.completedByEmail ? `${c.completedBy} (${c.completedByEmail})` : c.completedBy))(claim || entry);
  if (claim || (entry && entry.status === 'completed')) {
    return html(res, alreadyCompletedPage(entry ? entry.orgName : (claim && claim.orgName), completedBy, (claim || entry).completedAt));
  }
  if (!entry) return sendPage(res, messagePage('Request not found', 'This completion link doesn\'t match any sponsorship request.', 404));
  if (entry.status === 'denied') {
    return sendPage(res, messagePage('Request was denied',
      `The sponsorship request from ${entry.orgName || 'this organization'} was denied, so there is nothing to complete.`, 409));
  }
  if (entry.status !== 'approved') {
    return sendPage(res, messagePage('Not approved yet',
      `The sponsorship request from ${entry.orgName || 'this organization'} hasn't been approved. It can be marked completed once an approver approves it.`, 409));
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('Method not allowed');
  const id = req.method === 'POST' ? (req.body || {}).id : (req.query || {}).id;
  if (!isValidToken(id)) return res.status(400).send('Invalid link.');

  // Same Microsoft sign-in as the approve/deny pages
  if (!msConfig()) return sendPage(res, notConfiguredPage());
  const session = readSession(parseCookies(req));
  if (!session) {
    if (req.method === 'POST') {
      return sendPage(res, messagePage('Sign-in required',
        'Your sign-in expired. Please open the "Mark as Completed" link from the email again.', 401));
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', loginUrl(`/api/complete?id=${id}`));
    return res.status(302).send('');
  }
  const settings = await getSettings(redis);
  if (!canComplete(settings, session.email)) {
    return sendPage(res, messagePage('Not authorized',
      `Signed in as ${session.email}, which isn't on the marketing team or an approver for sponsorship requests.`, 403));
  }

  const [stored, claimed] = await redis.mget(ledgerKey(id), completedKey(id));
  const entry = stored ? parseStored(stored) : null;
  const gate = statusGate(res, id, entry, claimed ? parseStored(claimed) : null);
  if (gate) return gate;

  if (req.method === 'GET') return html(res, completionForm(id, entry, session));

  // POST: identity comes only from the session; the form carries just the notes
  const completionNotes = typeof req.body.completionNotes === 'string' ? req.body.completionNotes.trim().slice(0, NOTES_MAX) : '';
  const completion = {
    completedBy: session.name, completedByEmail: session.email, completedAt: Date.now(),
    completionNotes, orgName: entry.orgName
  };

  // Atomically claim the completion so two people can't both record it
  const key = completedKey(id);
  const ok = await redis.set(key, JSON.stringify(completion), { nx: true });
  if (!ok) {
    const existing = parseStored(await redis.get(key));
    return statusGate(res, id, entry, existing || completion);
  }

  try {
    await sendCompletionEmail(createTransporter(), settings, entry, completion);
  } catch (err) {
    // Release the claim so marketing can retry once email works again
    await redis.del(key);
    console.error('Completion email failed:', err);
    return res.status(500).send('Failed to send notification. Please try again.');
  }

  try {
    await recordCompletion(redis, id, completion, completion.completedAt);
  } catch (err) {
    // The completion is claimed and emailed; the claim key keeps it from being redone
    console.error('Ledger completion update failed:', err);
  }
  return html(res, completedPage(entry.orgName));
};

module.exports.completedKey = completedKey;
