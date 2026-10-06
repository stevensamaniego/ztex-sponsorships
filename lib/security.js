const { randomBytes } = require('crypto');

// Submissions are stored server-side in Redis; approve/deny links carry only an
// unguessable token, so a link can't be forged or edited to change the request.
const SUBMISSION_TTL_SECONDS = 60 * 60 * 24 * 90;

function newToken() {
  return randomBytes(32).toString('base64url');
}

function isValidToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function pendingKey(token) {
  return `pending:${token}`;
}

function decisionKey(token) {
  return `submission:${token}`;
}

// Escape user-supplied text before it goes into HTML pages or emails.
function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseStored(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

module.exports = {
  SUBMISSION_TTL_SECONDS,
  newToken,
  isValidToken,
  pendingKey,
  decisionKey,
  escapeHtml,
  parseStored
};
