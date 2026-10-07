const { head, get } = require('@vercel/blob');

// Supporting documents go straight from the browser to a private Vercel Blob store
// (api/upload.js issues the upload tokens), so they aren't limited by the 4.5 MB
// function body cap. Requests only carry the blob pathnames.
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Exchange Online rejects messages over ~35 MB and attachments grow ~33% when encoded
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// requests/<22-char upload id>/<sanitized file name, plus Blob's random suffix>
const PATH_RE = /^requests\/([A-Za-z0-9_-]{22})\/[A-Za-z0-9._-]{1,200}$/;

function isUploadPath(pathname) {
  return typeof pathname === 'string' && PATH_RE.test(pathname);
}

function uploadIdOf(pathname) {
  const m = PATH_RE.exec(pathname);
  return m ? m[1] : null;
}

function displayName(name) {
  const clean = String(name || '').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim().slice(0, 150);
  return clean || 'attachment';
}

// Checks the client's list against what is actually in the store.
// Returns { files: [{ pathname, name, size, contentType }] } or { error }.
async function verifyFiles(list) {
  if (list === undefined || list === null) return { files: [] };
  if (!Array.isArray(list)) return { error: 'Invalid attachments.' };
  if (list.length > MAX_FILES) return { error: `Maximum ${MAX_FILES} files allowed.` };
  if (!list.length) return { files: [] };

  const ids = new Set();
  for (const f of list) {
    if (!f || !isUploadPath(f.pathname)) return { error: 'Invalid attachment.' };
    ids.add(uploadIdOf(f.pathname));
  }
  if (ids.size !== 1) return { error: 'Invalid attachments.' };
  if (new Set(list.map(f => f.pathname)).size !== list.length) return { error: 'Duplicate attachment.' };

  const files = [];
  let total = 0;
  for (const f of list) {
    let meta;
    try {
      meta = await head(f.pathname);
    } catch {
      return { error: 'An attachment is missing. Please re-attach your files and try again.' };
    }
    if (meta.size > MAX_FILE_BYTES) return { error: `"${displayName(f.name)}" exceeds 10MB.` };
    if (!ALLOWED_TYPES.includes(meta.contentType)) return { error: `"${displayName(f.name)}" isn't an allowed file type.` };
    total += meta.size;
    files.push({ pathname: meta.pathname, name: displayName(f.name), size: meta.size, contentType: meta.contentType });
  }
  if (total > MAX_TOTAL_BYTES) return { error: 'Attachments total more than 20MB.' };
  return { files };
}

async function readStream(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// nodemailer attachments for stored files. Throws if a file can't be read, so the
// caller doesn't send an email that silently drops documents.
async function loadAttachments(files) {
  const out = [];
  for (const f of files || []) {
    if (!f || !isUploadPath(f.pathname)) continue;
    const result = await get(f.pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) throw new Error(`Attachment not found: ${f.pathname}`);
    out.push({ filename: f.name, content: await readStream(result.stream), contentType: result.blob.contentType });
  }
  return out;
}

module.exports = {
  MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, ALLOWED_TYPES,
  isUploadPath, uploadIdOf, displayName, verifyFiles, loadAttachments, readStream
};
