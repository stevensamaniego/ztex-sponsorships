const nodemailer = require('nodemailer');
const { Redis } = require('@upstash/redis');

const redis = Redis.fromEnv();

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: 'timeclock@ztexconstruction.com',
      pass: process.env.SMTP_PASSWORD
    },
    tls: { ciphers: 'SSLv3' }
  });
}

function buildMarketingEmail(submission, approved, adjustedAmount, adjustedTier, bossNotes, approverName) {
  const { orgName, contactName, email, phone, eventName, eventDate, sponsorshipTier, sponsorshipAmount } = submission;
  const finalAmount = adjustedAmount || sponsorshipAmount;
  const finalTier = adjustedTier || sponsorshipTier;
  const displayAmount = finalAmount ? `$${finalAmount}` : 'Not specified';
  const date = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified';
  const statusColor = approved ? '#1a7a3c' : '#C41E3A';
  const statusLabel = approved ? '✅ APPROVED' : '❌ DENIED';
  const statusMessage = approved
    ? 'A sponsorship request has been <strong>approved</strong> by leadership. Please proceed with the sponsorship process and follow up with the contact below.'
    : 'A sponsorship request has been <strong>denied</strong> by leadership. No further action is required.';

  const amountChanged = adjustedAmount && adjustedAmount !== sponsorshipAmount;
  const tierChanged = adjustedTier && adjustedTier !== sponsorshipTier;

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
            <p style="color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:10px 0 0;">Sponsorship Decision</p>
          </td>
        </tr>

        <tr>
          <td style="background:${statusColor};padding:16px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px;">${statusLabel}</span>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.7;">${statusMessage}</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td colspan="2" style="background:#f8f8f8;border-left:3px solid #C41E3A;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C41E3A;">Request Details</td></tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;width:40%;border-bottom:1px solid #f0f0f0;">Organization</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;font-weight:600;border-bottom:1px solid #f0f0f0;">${orgName}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Contact</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${contactName}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Email</td>
                <td style="padding:10px 14px;font-size:14px;border-bottom:1px solid #f0f0f0;"><a href="mailto:${email}" style="color:#C41E3A;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Phone</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${phone}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Event</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${eventName}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Event Date</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${date}</td>
              </tr>
              ${approved ? `
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Approved Amount</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;font-weight:700;border-bottom:1px solid #f0f0f0;">
                  ${displayAmount}
                  ${amountChanged ? `<span style="font-size:11px;color:#888;font-weight:400;margin-left:6px;">(requested: $${sponsorshipAmount})</span>` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Approved Tier</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">
                  ${finalTier}
                  ${tierChanged ? `<span style="font-size:11px;color:#888;font-weight:400;margin-left:6px;">(requested: ${sponsorshipTier})</span>` : ''}
                </td>
              </tr>` : ''}
            </table>

            ${bossNotes ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              <tr><td style="background:#f8f8f8;border-left:3px solid #D4AF37;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b8960a;">Notes from Leadership</td></tr>
              <tr><td style="padding:14px;font-size:14px;color:#444;line-height:1.7;">${bossNotes}</td></tr>
            </table>` : ''}

            ${approverName ? `
            <p style="margin:24px 0 0;font-size:13px;color:#aaa;border-top:1px solid #f0f0f0;padding-top:16px;">
              Decision made by: <strong style="color:#444;">${approverName}</strong>
            </p>` : ''}

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

function confirmationPage(approved, orgName) {
  const color = approved ? '#1a7a3c' : '#C41E3A';
  const label = approved ? '✅ Approved' : '❌ Denied';
  const msg = approved
    ? 'The marketing team has been notified and will proceed with this sponsorship.'
    : 'The marketing team has been notified that this request was denied.';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Recorded</title>
  <style>
    body { margin: 0; padding: 0; background: #111; font-family: 'Helvetica Neue', Arial, sans-serif;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 48px 56px;
            text-align: center; max-width: 480px; }
    .badge { display: inline-block; background: ${color}22; border: 1px solid ${color}; color: ${color};
             font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
             padding: 6px 18px; border-radius: 100px; margin-bottom: 24px; }
    h1 { color: #fff; font-size: 28px; font-weight: 700; margin: 0 0 12px; }
    p { color: #999; font-size: 15px; line-height: 1.6; margin: 0 0 32px; }
    .org { color: #D4AF37; font-weight: 600; }
    a { display: inline-block; padding: 12px 28px; background: #C41E3A; color: #fff;
        font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${label}</div>
    <h1>Action Recorded</h1>
    <p>Request from <span class="org">${orgName}</span> has been marked as <strong style="color:#fff;">${label}</strong>.<br><br>${msg}</p>
    <a href="https://sponsorships.ztexconstruction.com">Back to Portal</a>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const { type, data, adjustedAmount, adjustedTier, bossNotes, approverName } = req.body;

  if (!type || !data) return res.status(400).send('Invalid request.');

  let submission;
  try {
    submission = JSON.parse(Buffer.from(decodeURIComponent(data), 'base64').toString());
  } catch {
    return res.status(400).send('Invalid data.');
  }

  const approved = type === 'approve';
  const marketingEmail = process.env.MARKETING_EMAIL || 'steven@ztexconstruction.com, bchavez@ztexconstruction.com';

  // Check + lock submission to prevent double action
  if (submission.submissionId) {
    const key = `submission:${submission.submissionId}`;
    const existing = await redis.get(key);
    if (existing) {
      const { approver, action } = typeof existing === 'string' ? JSON.parse(existing) : existing;
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Already Handled</title>
        <style>body{margin:0;background:#111;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;}
        .c{background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:48px;text-align:center;max-width:480px;}
        h1{color:#fff;margin:0 0 12px;}p{color:#999;font-size:15px;line-height:1.6;margin:0;}.g{color:#D4AF37;font-weight:600;}</style></head>
        <body><div class="c"><h1>Already Handled</h1><p>This request was already <strong style="color:#fff;">${action}d</strong> by <span class="g">${approver}</span>. No further action needed.</p></div></body></html>`);
    }
    // Lock it — store for 90 days
    await redis.set(key, JSON.stringify({ approver: approverName || 'Unknown', action: type }), { ex: 60 * 60 * 24 * 90 });
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: '"ZTEX Sponsorships" <sponsorships@ztexconstruction.com>',
      to: marketingEmail,
      subject: approved
        ? `✅ Sponsorship Approved — ${submission.orgName}`
        : `❌ Sponsorship Denied — ${submission.orgName}`,
      html: buildMarketingEmail(submission, approved, adjustedAmount, adjustedTier, bossNotes, approverName)
    });

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(confirmationPage(approved, submission.orgName));

  } catch (err) {
    console.error('Confirm error:', err);
    return res.status(500).send('Failed to send notification. Please try again.');
  }
};
