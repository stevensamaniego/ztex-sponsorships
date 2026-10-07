const nodemailer = require('nodemailer');
const { Redis } = require('@upstash/redis');
const { INDEX_KEY, ledgerKey } = require('../lib/ledger');
const { pendingKey, escapeHtml, parseStored } = require('../lib/security');
const { getSettings } = require('../lib/settings');
const { tierLabel } = require('../lib/tiers');
const { formatEventWhen } = require('../lib/calendar');
const { cronAuthorized } = require('../lib/cron');

const redis = Redis.fromEnv();

// Daily Vercel cron (vercel.json). Emails the approvers about requests still pending
// after 5 days, then every 5 days after that, until someone approves or denies.
// Reminder state lives in its own key so it can never overwrite a decision in the ledger.
const INTERVAL_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_URL = 'https://sponsorships.ztexconstruction.com';

function reminderKey(token) {
  return `reminder:${token}`;
}

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

function money(value) {
  const n = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Not specified';
}

function reminderEmail(token, r, days) {
  const e = escapeHtml;
  const approveUrl = `${BASE_URL}/api/action?type=approve&id=${token}`;
  const denyUrl = `${BASE_URL}/api/action?type=deny&id=${token}`;
  const submitted = new Date(r.submittedAt).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'long', day: 'numeric', year: 'numeric' });
  const row = (k, v) => `<tr><td style="padding:8px 14px;font-size:13px;color:#888;width:40%;border-bottom:1px solid #f0f0f0;">${k}</td><td style="padding:8px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${v}</td></tr>`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
        <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">ZTEX CONSTRUCTION</span>
        <p style="color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:10px 0 0;">Sponsorship Request Reminder</p>
      </td></tr>
      <tr><td style="background:#D4AF37;padding:14px 40px;text-align:center;">
        <span style="color:#1a1a1a;font-size:16px;font-weight:700;">⏰ Waiting on a decision for ${days} days</span>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 22px;font-size:15px;color:#444;line-height:1.6;">This sponsorship request was submitted on <strong>${e(submitted)}</strong> and hasn't been approved or denied yet. The original email has the full details and the submitter's documents.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
          ${row('Organization', `<strong>${e(r.orgName)}</strong>`)}
          ${row('Contact', `${e(r.contactName)}${r.email ? ` · <a href="mailto:${e(r.email)}" style="color:#C41E3A;">${e(r.email)}</a>` : ''}`)}
          ${row('Event', e(r.eventName))}
          ${row('Event Date', e(formatEventWhen(r.eventDate, r.eventTime)) || 'Not specified')}
          ${row('Amount Requested', e(money(r.sponsorshipAmount)))}
          ${row('Tier', e(tierLabel(r.sponsorshipTier, r.sponsorshipTierOther)) || 'Not specified')}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>
          <td style="padding:20px;background:#f8f8f8;border-radius:6px;text-align:center;">
            <p style="margin:0 0 18px;font-size:13px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Take Action</p>
            <a href="${approveUrl}" style="display:inline-block;padding:14px 36px;background:#1a7a3c;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:4px;margin:0 8px;">✅ Approve</a>
            <a href="${denyUrl}" style="display:inline-block;padding:14px 36px;background:#C41E3A;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:4px;margin:0 8px;">❌ Deny</a>
          </td>
        </tr></table>
        <p style="margin:22px 0 0;font-size:12px;color:#999;">Reminders go out every ${INTERVAL_DAYS} days until the request is approved or denied.</p>
      </td></tr>
      <tr><td style="background:#1a1a1a;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#666;font-size:11px;">© 2026 ZTEX Construction, Inc. — Sponsorship Portal Reminder</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function sendReminders(now = Date.now(), transporter = createTransporter()) {
  const { approvers } = await getSettings(redis);
  const result = { ranAt: now, pending: 0, sent: 0, failed: 0 };
  if (!approvers.length) return { ...result, skipped: 'no approvers configured' };

  const tokens = await redis.zrange(INDEX_KEY, 0, -1);
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const entries = await redis.mget(...batch.map(ledgerKey));
    for (let j = 0; j < batch.length; j++) {
      const token = batch[j];
      const r = entries[j] && parseStored(entries[j]);
      if (!r || r.status !== 'pending' || !r.submittedAt) continue;
      // The approve/deny links only work while the pending record exists
      if (!(await redis.get(pendingKey(token)))) continue;
      result.pending++;

      const days = Math.floor((now - r.submittedAt) / DAY_MS);
      const due = Math.floor(days / INTERVAL_DAYS);
      if (due < 1) continue;
      const state = parseStored(await redis.get(reminderKey(token))) || { count: 0 };
      if (state.count >= due) continue;

      try {
        await transporter.sendMail({
          from: '"ZTEX Sponsorships" <sponsorships@ztexconstruction.com>',
          to: approvers.join(', '),
          subject: `⏰ Reminder: sponsorship request pending ${days} days — ${String(r.orgName || '').replace(/[\r\n]+/g, ' ')}`,
          html: reminderEmail(token, r, days)
        });
        await redis.set(reminderKey(token), JSON.stringify({ count: due, lastAt: now, days }), { ex: 120 * 24 * 60 * 60 });
        result.sent++;
      } catch (err) {
        // Not recorded as sent, so tomorrow's run tries again
        console.error(`Reminder failed for ${token.slice(0, 8)}…:`, err);
        result.failed++;
      }
    }
  }
  return result;
}

module.exports = async (req, res) => {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await sendReminders();
    console.log('Pending reminders:', result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Pending reminders failed:', err);
    return res.status(500).json({ error: 'Reminders failed' });
  }
};

module.exports.sendReminders = sendReminders;
module.exports.reminderKey = reminderKey;
