const { Redis } = require('@upstash/redis');
const { INDEX_KEY, ledgerKey } = require('../lib/ledger');
const { pendingKey, escapeHtml, parseStored } = require('../lib/security');
const { getSettings } = require('../lib/settings');
const { tierLabel } = require('../lib/tiers');
const { formatEventWhen } = require('../lib/calendar');
const { cronAuthorized } = require('../lib/cron');
const { createTransporter } = require('../lib/mail');
const { businessDaysBetween } = require('../lib/business-days');
const { completedKey } = require('./complete');

const redis = Redis.fromEnv();

// Daily Vercel cron (vercel.json). One reminder per request per stage, never a second:
//   pending  — no decision after 3 business days → the approvers (Approve / Deny links)
//   approved — not completed 3 business days after the decision → the marketing team
//              ("Mark as Completed" link)
// Business days are Monday–Friday in America/Denver; holidays aren't excluded.
// Reminder state lives in its own keys so it can never overwrite a decision in the ledger.
const BUSINESS_DAYS = 3;
const REMINDER_TTL_SECONDS = 120 * 24 * 60 * 60;
const BASE_URL = 'https://sponsorships.ztexconstruction.com';
const FROM = '"ZTEX Sponsorships" <sponsorships@ztexconstruction.com>';

function reminderKey(token) {
  return `reminder:${token}`;
}

function completionReminderKey(token) {
  return `reminder:completion:${token}`;
}

// Records written before 2026-10-29 look like { count, lastAt, days } (count ≥ 1);
// anything already stored means the request was reminded, so nobody gets a duplicate.
function alreadyReminded(state) {
  return !!state && (Number(state.sentAt) > 0 || Number(state.count) >= 1);
}

function money(value) {
  const n = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Not specified';
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/Denver', month: 'long', day: 'numeric', year: 'numeric' });
}

function oneLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// Shared layout for both reminders. `intro`, `rows` and `action` are already-escaped HTML.
function reminderShell({ eyebrow, band, intro, rows, action }) {
  const row = (k, v) => `<tr><td style="padding:8px 14px;font-size:13px;color:#888;width:40%;border-bottom:1px solid #f0f0f0;">${k}</td><td style="padding:8px 14px;font-size:14px;color:#222;border-bottom:1px solid #f0f0f0;">${v}</td></tr>`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
        <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">ZTEX CONSTRUCTION</span>
        <p style="color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:10px 0 0;">${eyebrow}</p>
      </td></tr>
      <tr><td style="background:#D4AF37;padding:14px 40px;text-align:center;">
        <span style="color:#1a1a1a;font-size:16px;font-weight:700;">${band}</span>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 22px;font-size:15px;color:#444;line-height:1.6;">${intro}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
          ${rows.map(([k, v]) => row(k, v)).join('\n          ')}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>
          <td style="padding:20px;background:#f8f8f8;border-radius:6px;text-align:center;">
            <p style="margin:0 0 18px;font-size:13px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Take Action</p>
            ${action}
          </td>
        </tr></table>
        <p style="margin:22px 0 0;font-size:12px;color:#999;">This is the only reminder for this request.</p>
      </td></tr>
      <tr><td style="background:#1a1a1a;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#666;font-size:11px;">© 2026 ZTEX Construction, Inc. — Sponsorship Portal Reminder</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

const button = (href, color, label) =>
  `<a href="${href}" style="display:inline-block;padding:14px 36px;background:${color};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:4px;margin:0 8px;">${label}</a>`;

// To the approvers: no decision yet.
function pendingReminderEmail(token, r, days) {
  const e = escapeHtml;
  return reminderShell({
    eyebrow: 'Sponsorship Request Reminder',
    band: `⏰ Waiting on a decision for ${plural(days, 'business day')}`,
    intro: `This sponsorship request was submitted on <strong>${e(fmtDate(r.submittedAt))}</strong> and hasn't been approved or denied yet. The original email has the full details and the submitter's documents.`,
    rows: [
      ['Organization', `<strong>${e(r.orgName)}</strong>`],
      ['Contact', `${e(r.contactName)}${r.email ? ` · <a href="mailto:${e(r.email)}" style="color:#C41E3A;">${e(r.email)}</a>` : ''}`],
      ['Event', e(r.eventName)],
      ['Event Date', e(formatEventWhen(r.eventDate, r.eventTime)) || 'Not specified'],
      ['Amount Requested', e(money(r.sponsorshipAmount))],
      ['Tier', e(tierLabel(r.sponsorshipTier, r.sponsorshipTierOther)) || 'Not specified']
    ],
    action: button(`${BASE_URL}/api/action?type=approve&id=${token}`, '#1a7a3c', '✅ Approve')
      + '\n            ' + button(`${BASE_URL}/api/action?type=deny&id=${token}`, '#C41E3A', '❌ Deny')
  });
}

// To the marketing team: approved, not yet marked completed.
function completionReminderEmail(token, r, days) {
  const e = escapeHtml;
  const amount = money(r.adjustedAmount || r.sponsorshipAmount);
  const tier = r.adjustedTier ? tierLabel(r.adjustedTier, r.adjustedTierOther) : tierLabel(r.sponsorshipTier, r.sponsorshipTierOther);
  const approver = r.approver ? (r.approverEmail ? `${r.approver} (${r.approverEmail})` : r.approver) : 'an approver';
  return reminderShell({
    eyebrow: 'Sponsorship Completion Reminder',
    band: `🏁 Waiting on completion for ${plural(days, 'business day')}`,
    intro: `This sponsorship was approved on <strong>${e(fmtDate(r.decidedAt))}</strong> by <strong>${e(approver)}</strong> and hasn't been marked completed yet.`,
    rows: [
      ['Organization', `<strong>${e(r.orgName)}</strong>`],
      ['Contact', `${e(r.contactName)}${r.email ? ` · <a href="mailto:${e(r.email)}" style="color:#C41E3A;">${e(r.email)}</a>` : ''}`],
      ['Event', e(r.eventName)],
      ['Event Date', e(formatEventWhen(r.eventDate, r.eventTime)) || 'Not specified'],
      ['Approved Amount', e(amount)],
      ['Approved Tier', e(tier) || 'Not specified'],
      ['Approved By', e(approver)]
    ],
    action: button(`${BASE_URL}/api/complete?id=${token}`, '#1a7a3c', '🏁 Mark as Completed')
  });
}

async function sendReminders(now = Date.now(), transporter = createTransporter()) {
  const { approvers, marketingEmails } = await getSettings(redis);
  const result = { ranAt: now, pending: 0, pendingSent: 0, awaitingCompletion: 0, completionSent: 0, failed: 0 };
  const skipped = [];
  if (!approvers.length) skipped.push('pending stage: no approvers configured');
  if (!marketingEmails.length) skipped.push('completion stage: no marketing emails configured');

  // Sends one email and records the reminder; a failed send is not recorded, so the next
  // daily run retries it.
  const remind = async (key, stage, mail, days, counter) => {
    try {
      await transporter.sendMail({ from: FROM, ...mail });
      await redis.set(key, JSON.stringify({ stage, sentAt: now, days }), { ex: REMINDER_TTL_SECONDS });
      result[counter]++;
    } catch (err) {
      console.error(`${stage} reminder failed for ${key.slice(-43, -35)}…:`, err);
      result.failed++;
    }
  };

  const tokens = await redis.zrange(INDEX_KEY, 0, -1);
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const entries = await redis.mget(...batch.map(ledgerKey));
    for (let j = 0; j < batch.length; j++) {
      const token = batch[j];
      const r = entries[j] && parseStored(entries[j]);
      if (!r) continue;

      if (r.status === 'pending' && r.submittedAt && approvers.length) {
        // The approve/deny links only work while the pending record exists
        if (!(await redis.get(pendingKey(token)))) continue;
        result.pending++;
        const days = businessDaysBetween(r.submittedAt, now);
        if (days < BUSINESS_DAYS) continue;
        if (alreadyReminded(parseStored(await redis.get(reminderKey(token))))) continue;
        await remind(reminderKey(token), 'pending', {
          to: approvers.join(', '),
          subject: `⏰ Reminder: sponsorship request pending ${plural(days, 'business day')} — ${oneLine(r.orgName)}`,
          html: pendingReminderEmail(token, r, days)
        }, days, 'pendingSent');
      } else if (r.status === 'approved' && r.decidedAt && marketingEmails.length) {
        // A completion claim without the ledger update still counts as completed
        if (await redis.get(completedKey(token))) continue;
        result.awaitingCompletion++;
        const days = businessDaysBetween(r.decidedAt, now);
        if (days < BUSINESS_DAYS) continue;
        if (alreadyReminded(parseStored(await redis.get(completionReminderKey(token))))) continue;
        await remind(completionReminderKey(token), 'completion', {
          to: marketingEmails.join(', '),
          subject: `🏁 Reminder: approved sponsorship not yet completed — ${oneLine(r.orgName)}`,
          html: completionReminderEmail(token, r, days)
        }, days, 'completionSent');
      }
    }
  }
  return skipped.length ? { ...result, skipped: skipped.join('; ') } : result;
}

module.exports = async (req, res) => {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await sendReminders();
    console.log('Reminders:', result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Reminders failed:', err);
    return res.status(500).json({ error: 'Reminders failed' });
  }
};

module.exports.sendReminders = sendReminders;
module.exports.reminderKey = reminderKey;
module.exports.completionReminderKey = completionReminderKey;
module.exports.BUSINESS_DAYS = BUSINESS_DAYS;
