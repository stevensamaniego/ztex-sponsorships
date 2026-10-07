const { parseStored } = require('./security');

// Editable from /admin. Approvers are Microsoft 365 email addresses (they sign in
// with Microsoft); there is no default, since names can't be used to sign in.
const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS = {
  approvers: [],
  marketingEmails: ['steven@ztexconstruction.com', 'bchavez@ztexconstruction.com'],
  requestEmails: ['sponsorships@ztexconstruction.com']
};

const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/;

function envMarketingEmails() {
  const raw = process.env.MARKETING_EMAIL;
  if (!raw) return null;
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

async function getSettings(redis) {
  const stored = await redis.get(SETTINGS_KEY);
  const s = stored ? parseStored(stored) : {};
  return {
    approvers: approverEmails(s.approvers),
    marketingEmails: nonEmpty(s.marketingEmails) || envMarketingEmails() || DEFAULT_SETTINGS.marketingEmails,
    requestEmails: nonEmpty(s.requestEmails) || DEFAULT_SETTINGS.requestEmails
  };
}

function nonEmpty(list) {
  return Array.isArray(list) && list.length ? list : null;
}

// Older stored approvers were display names; anything that isn't an email is ignored.
function approverEmails(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list
    .filter(v => typeof v === 'string' && EMAIL_RE.test(v.trim()))
    .map(v => v.trim().toLowerCase()))];
}

// Parse one-per-line textarea input. Returns { values } or { error }.
function parseLines(text, { label, email, lowercase, max = 20 }) {
  const values = [...new Set(String(text || '')
    .split(/[\r\n,]+/)
    .map(s => s.trim())
    .filter(Boolean))];
  if (!values.length) return { error: `${label}: add at least one.` };
  if (values.length > max) return { error: `${label}: ${max} max.` };
  for (const v of values) {
    if (v.length > 120) return { error: `${label}: "${v.slice(0, 30)}…" is too long.` };
    if (email && !EMAIL_RE.test(v)) return { error: `${label}: "${v}" isn't a valid email.` };
    if (!email && /[<>"]/.test(v)) return { error: `${label}: "${v}" has invalid characters.` };
  }
  return { values: lowercase ? [...new Set(values.map(v => v.toLowerCase()))] : values };
}

async function saveSettings(redis, settings) {
  await redis.set(SETTINGS_KEY, JSON.stringify(settings));
}

function isApprover(settings, email) {
  return typeof email === 'string' && settings.approvers.includes(email.toLowerCase());
}

module.exports = { DEFAULT_SETTINGS, getSettings, saveSettings, parseLines, isApprover };
