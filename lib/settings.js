const { parseStored } = require('./security');

// Editable from /admin. Defaults match the values that were hardcoded before
// the admin page existed, so a fresh Redis store behaves the same as before.
const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS = {
  approvers: ['Genaro Roldan', 'Joaquin Royo'],
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
    approvers: nonEmpty(s.approvers) || DEFAULT_SETTINGS.approvers,
    marketingEmails: nonEmpty(s.marketingEmails) || envMarketingEmails() || DEFAULT_SETTINGS.marketingEmails,
    requestEmails: nonEmpty(s.requestEmails) || DEFAULT_SETTINGS.requestEmails
  };
}

function nonEmpty(list) {
  return Array.isArray(list) && list.length ? list : null;
}

// Parse one-per-line textarea input. Returns { values } or { error }.
function parseLines(text, { label, email, max = 20 }) {
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
  return { values };
}

async function saveSettings(redis, settings) {
  await redis.set(SETTINGS_KEY, JSON.stringify(settings));
}

module.exports = { DEFAULT_SETTINGS, getSettings, saveSettings, parseLines };
