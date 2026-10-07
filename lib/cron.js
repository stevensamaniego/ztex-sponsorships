const { timingSafeEqual } = require('crypto');

// Vercel cron requests carry `Authorization: Bearer $CRON_SECRET`.
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(String(req.headers.authorization || ''));
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = { cronAuthorized };
