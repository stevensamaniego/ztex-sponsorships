const nodemailer = require('nodemailer');

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb'
    }
  }
};

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: 'timeclock@ztexconstruction.com',
      pass: process.env.SMTP_PASSWORD
    },
    tls: {
      ciphers: 'SSLv3'
    }
  });
}

function buildBossEmail(data, approveUrl, denyUrl) {
  const {
    orgName, contactName, email, phone,
    eventName, eventDate, sponsorshipAmount, sponsorshipTier,
    description, additionalNotes
  } = data;

  const tier = sponsorshipTier || 'Not specified';
  const amount = sponsorshipAmount ? `$${sponsorshipAmount}` : 'Not specified';
  const date = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
            <div style="display:inline-block;border-bottom:2px solid #C41E3A;padding-bottom:12px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">ZTEX CONSTRUCTION</span>
            </div>
            <p style="color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:10px 0 0;">New Sponsorship Request</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">A new sponsorship request has been submitted. Please review the details below and take action.</p>

            <!-- Org Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td colspan="2" style="background:#f8f8f8;border-left:3px solid #C41E3A;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C41E3A;">Organization</td></tr>
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
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;"><a href="mailto:${email}" style="color:#C41E3A;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;">Phone</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;">${phone}</td>
              </tr>
            </table>

            <!-- Event Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td colspan="2" style="background:#f8f8f8;border-left:3px solid #C41E3A;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C41E3A;">Event / Sponsorship Details</td></tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;width:40%;border-bottom:1px solid #f0f0f0;">Event Name</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;font-weight:600;border-bottom:1px solid #f0f0f0;">${eventName}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Event Date</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${date}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0;">Amount Requested</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;font-weight:600;border-bottom:1px solid #f0f0f0;">${amount}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;font-size:13px;color:#888;">Sponsorship Tier</td>
                <td style="padding:10px 14px;font-size:14px;color:#222;">${tier}</td>
              </tr>
            </table>

            <!-- Description -->
            ${description ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td style="background:#f8f8f8;border-left:3px solid #C41E3A;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C41E3A;">Description</td></tr>
              <tr><td style="padding:14px;font-size:14px;color:#444;line-height:1.7;">${description}</td></tr>
            </table>` : ''}

            <!-- Additional Notes -->
            ${additionalNotes ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td style="background:#f8f8f8;border-left:3px solid #C41E3A;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C41E3A;">Additional Notes</td></tr>
              <tr><td style="padding:14px;font-size:14px;color:#444;line-height:1.7;">${additionalNotes}</td></tr>
            </table>` : ''}

            <!-- Action Buttons -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
              <tr>
                <td style="padding:20px;background:#f8f8f8;border-radius:6px;text-align:center;">
                  <p style="margin:0 0 18px;font-size:13px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Take Action</p>
                  <a href="${approveUrl}" style="display:inline-block;padding:14px 36px;background:#1a7a3c;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:4px;margin:0 8px;">✅ Approve</a>
                  <a href="${denyUrl}" style="display:inline-block;padding:14px 36px;background:#C41E3A;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:4px;margin:0 8px;">❌ Deny</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#1a1a1a;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#666;font-size:11px;">© 2026 ZTEX Construction, Inc. — This email was generated automatically by the sponsorship portal.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      orgName, contactName, email, phone,
      eventName, eventDate, sponsorshipAmount, sponsorshipTier,
      description, additionalNotes, files
    } = req.body;

    // Encode submission data for approve/deny links
    const submissionData = Buffer.from(JSON.stringify({
      orgName, contactName, email, phone,
      eventName, eventDate, sponsorshipAmount, sponsorshipTier
    })).toString('base64');

    const baseUrl = 'https://sponsorships.ztexconstruction.com';
    const approveUrl = `${baseUrl}/api/action?type=approve&data=${encodeURIComponent(submissionData)}`;
    const denyUrl = `${baseUrl}/api/action?type=deny&data=${encodeURIComponent(submissionData)}`;

    // Build file attachments
    const attachments = (files || []).map(f => ({
      filename: f.name,
      content: Buffer.from(f.data, 'base64'),
      contentType: f.type
    }));

    const transporter = createTransporter();

    await transporter.sendMail({
      from: '"ZTEX Sponsorships" <timeclock@ztexconstruction.com>',
      to: 'sponsorships@ztexconstruction.com',
      replyTo: email,
      subject: `New Sponsorship Request — ${orgName}`,
      html: buildBossEmail(req.body, approveUrl, denyUrl),
      attachments
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
};
