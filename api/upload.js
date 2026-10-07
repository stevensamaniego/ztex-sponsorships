const { handleUpload } = require('@vercel/blob/client');
const { Redis } = require('@upstash/redis');
const { MAX_FILE_BYTES, ALLOWED_TYPES, isUploadPath } = require('../lib/files');
const { clientIp } = require('../lib/auth');

const redis = Redis.fromEnv();

// Public form, so tokens are limited per IP; each token allows one file of an allowed type and size.
const MAX_TOKENS_PER_HOUR = 30;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!isUploadPath(pathname)) throw new Error('Invalid file name.');
        const key = `uploadrate:${clientIp(req)}:${Math.floor(Date.now() / 3600000)}`;
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, 3600);
        if (count > MAX_TOKENS_PER_HOUR) throw new Error('Too many uploads. Please try again later.');
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000
        };
      }
    });
    return res.status(200).json(jsonResponse);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  }
};
