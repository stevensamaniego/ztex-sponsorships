const { Redis } = require('@upstash/redis');
const { isValidToken, pendingKey, decisionKey, escapeHtml, parseStored } = require('../lib/security');
const { getSettings, isApprover } = require('../lib/settings');
const { msConfig, parseCookies, readSession, loginUrl, messagePage, sendPage, notConfiguredPage } = require('../lib/approver');

const redis = Redis.fromEnv();

const TIERS = [
  'Bronze', 'Silver', 'Gold', 'Platinum', 'Title Sponsor', 'In-Kind', 'Other'
];

function reviewForm(type, token, submission, session) {
  const orgName = escapeHtml(submission.orgName);
  const contactName = escapeHtml(submission.contactName);
  const email = escapeHtml(submission.email);
  const eventName = escapeHtml(submission.eventName);
  const { sponsorshipTier } = submission;
  const amount = escapeHtml(submission.sponsorshipAmount || '');
  const isApprove = type === 'approve';
  const actionLabel = isApprove ? 'Confirm Approval' : 'Confirm Denial';
  const actionColor = isApprove ? '#1a7a3c' : '#C41E3A';
  const tierOptions = TIERS.map(t => `<option value="${t}"${t === sponsorshipTier ? ' selected' : ''}>${t}</option>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isApprove ? 'Approve' : 'Deny'} Sponsorship Request</title>
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
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 2px;
                     text-transform: uppercase; color: #C41E3A; margin-bottom: 16px; }
    .field { margin-bottom: 18px; }
    .field label { display: block; font-size: 12px; color: #999; margin-bottom: 7px;
                   font-weight: 500; letter-spacing: 0.5px; }
    .field input, .field select, .field textarea {
      width: 100%; background: #111; border: 1px solid #333; border-radius: 5px;
      padding: 10px 14px; color: #fff; font-size: 14px; font-family: inherit;
      transition: border-color 0.2s; outline: none; }
    .field input:focus, .field select, .field textarea:focus { border-color: #C41E3A; }
    .field select option { background: #1a1a1a; }
    .field textarea { resize: vertical; min-height: 100px; line-height: 1.6; }
    .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .btn { width: 100%; padding: 14px; background: ${actionColor}; color: #fff;
           font-size: 15px; font-weight: 700; border: none; border-radius: 5px;
           cursor: pointer; margin-top: 8px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .divider { border: none; border-top: 1px solid #2a2a2a; margin: 24px 0; }
    .signer { font-size: 14px; color: #999; }
    .signer strong { color: #fff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ZTEX <span>Construction</span></div>
    <h1>${isApprove ? '✅ Approve Request' : '❌ Deny Request'}</h1>
    <p class="subtitle">${isApprove ? 'Review and adjust details before confirming approval.' : 'Add any notes for the marketing team before confirming denial.'}</p>

    <div class="info-grid">
      <div class="info-item"><label>Organization</label><span>${orgName}</span></div>
      <div class="info-item"><label>Contact</label><span>${contactName}</span></div>
      <div class="info-item"><label>Event</label><span>${eventName}</span></div>
      <div class="info-item"><label>Email</label><span>${email}</span></div>
    </div>

    <form method="POST" action="/api/confirm">
      <input type="hidden" name="id" value="${token}">
      <input type="hidden" name="type" value="${type}">

      <p class="section-title">Your Signature</p>
      <div class="field">
        <p class="signer">Signing as <strong>${escapeHtml(session.name)}</strong> (${escapeHtml(session.email)})</p>
      </div>

      ${isApprove ? `
      <hr class="divider">
      <p class="section-title">Adjust Sponsorship <span style="font-weight:400;color:#555;text-transform:none;letter-spacing:0;font-size:11px;">(optional)</span></p>
      <div class="field-row">
        <div class="field">
          <label>Sponsorship Amount ($)</label>
          <input type="text" name="adjustedAmount" value="${amount}" placeholder="0.00">
        </div>
        <div class="field">
          <label>Sponsorship Tier</label>
          <select name="adjustedTier">${tierOptions}</select>
        </div>
      </div>
      ` : ''}

      <hr class="divider">
      <p class="section-title">Notes for Marketing Team</p>
      <div class="field">
        <label>Additional Notes <span style="color:#555;font-weight:400;">(optional)</span></label>
        <textarea name="bossNotes" placeholder="Any instructions or context for the marketing team..."></textarea>
      </div>

      <button type="submit" class="btn">${actionLabel}</button>
    </form>
  </div>
</body>
</html>`;
}

function alreadyHandledPage(rawOrgName, rawHandledBy, action) {
  const orgName = escapeHtml(rawOrgName);
  const handledBy = escapeHtml(rawHandledBy);
  const color = action === 'approve' ? '#1a7a3c' : '#C41E3A';
  const label = action === 'approve' ? 'Approved' : 'Denied';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Already Handled</title>
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
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Already ${label}</div>
    <h1>Request Already Handled</h1>
    <p>This sponsorship request for <span class="who">${orgName}</span> has already been <strong style="color:#fff;">${label.toLowerCase()}</strong> by <span class="who">${handledBy}</span>.<br><br>No further action is needed.</p>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const { type, id } = req.query;

  if ((type !== 'approve' && type !== 'deny') || !isValidToken(id)) {
    return res.status(400).send('Invalid or expired link.');
  }

  // Approvers must be signed in with their ZTEX Microsoft account
  if (!msConfig()) return sendPage(res, notConfiguredPage());
  const session = readSession(parseCookies(req));
  if (!session) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', loginUrl(`/api/action?type=${type}&id=${id}`));
    return res.status(302).send('');
  }
  const settings = await getSettings(redis);
  if (!settings.approvers.length) {
    return sendPage(res, messagePage('No approvers yet',
      'No approvers are configured yet. An administrator needs to add approver emails in /admin.', 503));
  }
  if (!isApprover(settings, session.email)) {
    return sendPage(res, messagePage('Not an approver',
      `Signed in as ${session.email}, which isn't an approver for sponsorship requests.`, 403));
  }

  // Already decided?
  const existing = await redis.get(decisionKey(id));
  if (existing) {
    const { approver, approverEmail, action, orgName } = parseStored(existing);
    res.setHeader('Content-Type', 'text/html');
    const handledBy = approverEmail ? `${approver} (${approverEmail})` : approver;
    return res.status(200).send(alreadyHandledPage(orgName, handledBy, action));
  }

  const stored = await redis.get(pendingKey(id));
  if (!stored) return res.status(404).send('This link is invalid or has expired.');
  const submission = parseStored(stored);

  // Show the review/edit form
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(reviewForm(type, id, submission, session));
};
