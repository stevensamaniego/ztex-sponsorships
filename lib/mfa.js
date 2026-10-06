const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('crypto');

// TOTP 2-step verification for the admin account — same parameters as
// CrewSheet/MVR (otpauth, SHA1, 6 digits, 30s, ±1 step drift).
// The secret is stored AES-256-GCM encrypted in Redis; the key comes from
// ADMIN_SESSION_SECRET, so rotating that secret also forces re-enrollment.
const ISSUER = 'ZTEX Sponsorships';
const TOTP_KEY = 'admin:totp';          // enrolled secret (encrypted)
const PENDING_KEY = 'admin:totp:pending'; // secret shown during enrollment, not yet confirmed
const LAST_STEP_KEY = 'admin:totp:last-step';
const PENDING_TTL_SECONDS = 60 * 10;

function encryptionKey() {
  return createHash('sha256').update(`totp:${process.env.ADMIN_SESSION_SECRET}`).digest();
}

function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

function decrypt(blob) {
  const [iv, tag, data] = String(blob).split('.').map(s => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function buildTotp(secretBase32, label = '') {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

async function readSecret(redis, key) {
  const blob = await redis.get(key);
  if (!blob) return null;
  try { return decrypt(blob); } catch { return null; }
}

async function isEnrolled(redis) {
  return (await readSecret(redis, TOTP_KEY)) !== null;
}

// Start (or resume) enrollment: returns the QR code + manual key to show.
async function beginEnrollment(redis, label) {
  let secret = await readSecret(redis, PENDING_KEY);
  if (!secret) {
    secret = new OTPAuth.Secret({ size: 20 }).base32;
    await redis.set(PENDING_KEY, encrypt(secret), { ex: PENDING_TTL_SECONDS });
  }
  const uri = buildTotp(secret, label).toString();
  const qr = await QRCode.toDataURL(uri, {
    width: 220, margin: 2, errorCorrectionLevel: 'M',
    color: { dark: '#111111', light: '#ffffff' }
  });
  return { qr, manualKey: secret.match(/.{1,4}/g).join(' ') };
}

// Returns the matched time step, or null. Rejects reuse of an already-used code.
async function checkCode(redis, secret, code) {
  const token = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  const delta = buildTotp(secret).validate({ token, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 30000) + delta;
  const last = Number(await redis.get(LAST_STEP_KEY)) || 0;
  if (step <= last) return null;
  await redis.set(LAST_STEP_KEY, String(step), { ex: 60 * 5 });
  return step;
}

async function confirmEnrollment(redis, code) {
  const secret = await readSecret(redis, PENDING_KEY);
  if (!secret) return false;
  if ((await checkCode(redis, secret, code)) === null) return false;
  await redis.set(TOTP_KEY, encrypt(secret));
  await redis.del(PENDING_KEY);
  return true;
}

async function verifyLoginCode(redis, code) {
  const secret = await readSecret(redis, TOTP_KEY);
  if (!secret) return false;
  return (await checkCode(redis, secret, code)) !== null;
}

module.exports = { isEnrolled, beginEnrollment, confirmEnrollment, verifyLoginCode, TOTP_KEY };
