const { timingSafeEqual } = require('crypto');
const { Redis } = require('@upstash/redis');
const { list, del } = require('@vercel/blob');
const { INDEX_KEY, ledgerKey } = require('../lib/ledger');
const { parseStored } = require('../lib/security');

const redis = Redis.fromEnv();

// Quarterly Vercel cron (vercel.json). Deletes uploaded files that no request uses:
// someone attached files and then abandoned the form. Files referenced by any
// ledger entry are kept forever, and anything under a day old is skipped so
// uploads still in progress aren't touched.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const LAST_RUN_KEY = 'cleanup:last';

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(String(req.headers.authorization || ''));
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function referencedPaths() {
  const tokens = await redis.zrange(INDEX_KEY, 0, -1);
  const keep = new Set();
  for (let i = 0; i < tokens.length; i += 100) {
    const values = await redis.mget(...tokens.slice(i, i + 100).map(ledgerKey));
    for (const v of values) {
      if (!v) continue;
      for (const f of parseStored(v).files || []) {
        if (f && f.pathname) keep.add(f.pathname);
      }
    }
  }
  return keep;
}

async function cleanup(now = Date.now()) {
  const keep = await referencedPaths();
  const orphans = [];
  let scanned = 0;
  let cursor;
  do {
    const page = await list({ prefix: 'requests/', cursor, limit: 1000 });
    for (const b of page.blobs) {
      scanned++;
      if (!keep.has(b.pathname) && now - new Date(b.uploadedAt).getTime() > MIN_AGE_MS) orphans.push(b);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  for (let i = 0; i < orphans.length; i += 100) {
    await del(orphans.slice(i, i + 100).map(b => b.pathname));
  }
  const result = {
    ranAt: now,
    scanned,
    kept: scanned - orphans.length,
    deleted: orphans.length,
    freedBytes: orphans.reduce((sum, b) => sum + (b.size || 0), 0)
  };
  await redis.set(LAST_RUN_KEY, JSON.stringify(result));
  return result;
}

module.exports = async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const result = await cleanup();
    console.log('Attachment cleanup:', result);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Attachment cleanup failed:', err);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
};

module.exports.cleanup = cleanup;
module.exports.LAST_RUN_KEY = LAST_RUN_KEY;
