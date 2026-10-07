const { parseStored, SUBMISSION_TTL_SECONDS } = require('./security');

// Permanent record of every request and its outcome, shown on /admin.
// `pending:` / `submission:` keys expire and only drive the approve/deny links;
// the ledger keeps the full history.
const INDEX_KEY = 'ledger';
const MAX_ROWS = 1000;

function ledgerKey(token) {
  return `ledger:${token}`;
}

const SUBMISSION_FIELDS = [
  'orgName', 'contactName', 'email', 'phone', 'eventName', 'eventDate',
  'sponsorshipAmount', 'sponsorshipTier', 'sponsorshipTierOther', 'description', 'additionalNotes'
];

async function recordSubmission(redis, token, data, now = Date.now()) {
  const entry = { status: 'pending', submittedAt: now };
  for (const f of SUBMISSION_FIELDS) {
    if (data[f] !== undefined && data[f] !== null) entry[f] = String(data[f]).slice(0, 5000);
  }
  entry.files = (Array.isArray(data.files) ? data.files : [])
    .map(f => String((f && f.name) || '').slice(0, 200))
    .filter(Boolean);
  await redis.set(ledgerKey(token), JSON.stringify(entry));
  await redis.zadd(INDEX_KEY, { score: now, member: token });
}

async function recordDecision(redis, token, decision, now = Date.now()) {
  const stored = await redis.get(ledgerKey(token));
  // Requests submitted before the ledger existed are added from the pending record
  const entry = stored ? parseStored(stored) : { submittedAt: null, ...(decision.submission || {}) };
  Object.assign(entry, {
    status: decision.action === 'approve' ? 'approved' : 'denied',
    decidedAt: now,
    approver: decision.approver || '',
    approverEmail: decision.approverEmail || '',
    adjustedAmount: decision.adjustedAmount || '',
    adjustedTier: decision.adjustedTier || '',
    adjustedTierOther: decision.adjustedTierOther || '',
    bossNotes: decision.bossNotes ? String(decision.bossNotes).slice(0, 5000) : ''
  });
  await redis.set(ledgerKey(token), JSON.stringify(entry));
  if (!stored) await redis.zadd(INDEX_KEY, { score: now, member: token });
}

// Newest first. A pending request whose approve/deny link has lapsed shows as expired.
async function listRequests(redis, now = Date.now()) {
  const tokens = await redis.zrange(INDEX_KEY, 0, MAX_ROWS - 1, { rev: true });
  if (!tokens.length) return [];
  const values = await redis.mget(...tokens.map(ledgerKey));
  return tokens.map((token, i) => {
    if (!values[i]) return null;
    const entry = parseStored(values[i]);
    if (entry.status === 'pending' && entry.submittedAt
        && now - entry.submittedAt > SUBMISSION_TTL_SECONDS * 1000) {
      entry.status = 'expired';
    }
    return { id: token, ...entry };
  }).filter(Boolean);
}

module.exports = { INDEX_KEY, ledgerKey, recordSubmission, recordDecision, listRequests };
