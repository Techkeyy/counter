// Counter social-identity logic: validation, ownership-scoped updates, and
// durable avatar storage. Route handlers authenticate via requireAuth and pass
// req.userWallet; this module never trusts a client-supplied wallet.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { queryOne, execute } = require('./db');

const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 160;
const HANDLE_MIN = 3;
const HANDLE_MAX = 20;
const HANDLE_RE = /^[a-z0-9_]+$/;
// Decoded-file ceiling keeps avatars small and request bodies bounded.
const AVATAR_MAX_BYTES = 1536 * 1024;

function defaultUploadDir() {
  return path.join(__dirname, 'uploads', 'avatars');
}

function validateDisplayName(value) {
  const name = String(value ?? '').trim();
  if (name.length === 0) return { ok: false, error: 'Display name cannot be empty.' };
  if (name.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer.` };
  }
  return { ok: true, value: name };
}

function normalizeHandle(value) {
  return String(value ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

function validateHandle(value) {
  const handle = normalizeHandle(value);
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) {
    return { ok: false, error: `Handle must be ${HANDLE_MIN}-${HANDLE_MAX} characters.` };
  }
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, error: 'Handle may only use letters, numbers, and underscore.' };
  }
  return { ok: true, value: handle };
}

function validateBio(value) {
  const bio = String(value ?? '').trim();
  if (bio.length > BIO_MAX) {
    return { ok: false, error: `Bio must be ${BIO_MAX} characters or fewer.` };
  }
  return { ok: true, value: bio };
}

function handleTaken(handle, exceptWallet) {
  const row = queryOne(`SELECT wallet_address FROM users WHERE lower(handle) = lower(?) LIMIT 1`, [handle]);
  if (!row) return false;
  return row.wallet_address !== exceptWallet;
}

// updateProfile: ownership is the wallet argument (always req.userWallet at
// the route layer). Only display_name/handle/bio change here; avatar_url is
// managed exclusively by the avatar endpoints below.
function updateProfile(wallet, fields) {
  const updates = {};
  if (fields.displayName !== undefined) {
    const r = validateDisplayName(fields.displayName);
    if (!r.ok) return { ok: false, error: r.error };
    updates.display_name = r.value;
  }
  if (fields.handle !== undefined) {
    const r = validateHandle(fields.handle);
    if (!r.ok) return { ok: false, error: r.error };
    if (handleTaken(r.value, wallet)) {
      return { ok: false, error: 'This handle is already taken.', code: 'HANDLE_TAKEN' };
    }
    updates.handle = r.value;
  }
  if (fields.bio !== undefined) {
    const r = validateBio(fields.bio);
    if (!r.ok) return { ok: false, error: r.error };
    updates.bio = r.value;
  }
  const keys = Object.keys(updates);
  if (keys.length === 0) return { ok: false, error: 'Nothing to update.' };
  execute(
    `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE wallet_address = ?`,
    [...keys.map((k) => updates[k]), wallet]
  );
  return { ok: true, user: queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]) };
}

const IMAGE_TYPES = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', magic: [Buffer.from([0xff, 0xd8, 0xff])] },
  png: { mime: 'image/png', ext: 'png', magic: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])] },
  webp: { mime: 'image/webp', ext: 'webp', magic: [Buffer.from('RIFF'), Buffer.from('WEBP', 4)] },
};

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return { ok: false, error: 'Unsupported image format.' };
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return { ok: false, error: 'Unsupported image format. Use JPEG, PNG, or WebP.' };
  const kind = IMAGE_TYPES[m[2]];
  let bytes;
  try {
    bytes = Buffer.from(m[3], 'base64');
  } catch {
    return { ok: false, error: 'Image data is corrupt.' };
  }
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) {
    return { ok: false, error: 'Image must be smaller than 1.5 MB.' };
  }
  // Magic-byte verification: declared type must match actual content. SVG and
  // scripts can never pass this gate (no text-based formats accepted).
  const matches = kind.magic.every((sig, i) => {
    const at = i === 0 ? 0 : 8; // WEBP second signature sits at offset 8
    return bytes.length > at + sig.length && bytes.subarray(at, at + sig.length).equals(sig);
  });
  if (!matches) return { ok: false, error: 'Image content does not match its type.' };
  return { ok: true, kind, bytes };
}

function avatarFileName(ext) {
  return `${crypto.randomBytes(16).toString('hex')}.${ext}`;
}

function isSafeAvatarFile(name) {
  return /^[a-f0-9]{32}\.(jpg|png|webp)$/.test(String(name || ''));
}

function avatarUrlFor(file) {
  return `/api/users/profile/avatar/${file}`;
}

// setAvatar: stores bytes under a generated name, points the profile at the
// served URL, and reclaims the previous upload (best-effort).
function setAvatar(wallet, dataUrl, uploadDir) {
  const dir = uploadDir || defaultUploadDir();
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed.ok) return parsed;
  fs.mkdirSync(dir, { recursive: true });
  const file = avatarFileName(parsed.kind.ext);
  fs.writeFileSync(path.join(dir, file), parsed.bytes);
  try {
    const prev = queryOne(`SELECT avatar_url FROM users WHERE wallet_address = ?`, [wallet]);
    const prevFile = String(prev?.avatar_url || '').split('/').pop();
    if (prevFile && isSafeAvatarFile(prevFile) && prevFile !== file) {
      fs.unlinkSync(path.join(dir, prevFile));
    }
  } catch {}
  execute(`UPDATE users SET avatar_url = ? WHERE wallet_address = ?`, [avatarUrlFor(file), wallet]);
  return { ok: true, user: queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]) };
}

function removeAvatar(wallet, uploadDir) {
  const dir = uploadDir || defaultUploadDir();
  try {
    const prev = queryOne(`SELECT avatar_url FROM users WHERE wallet_address = ?`, [wallet]);
    const prevFile = String(prev?.avatar_url || '').split('/').pop();
    if (prevFile && isSafeAvatarFile(prevFile)) {
      fs.unlinkSync(path.join(dir, prevFile));
    }
  } catch {}
  execute(`UPDATE users SET avatar_url = '' WHERE wallet_address = ?`, [wallet]);
  return { ok: true, user: queryOne(`SELECT * FROM users WHERE wallet_address = ?`, [wallet]) };
}

module.exports = {
  DISPLAY_NAME_MAX,
  BIO_MAX,
  HANDLE_MIN,
  HANDLE_MAX,
  AVATAR_MAX_BYTES,
  defaultUploadDir,
  validateDisplayName,
  normalizeHandle,
  validateHandle,
  validateBio,
  handleTaken,
  updateProfile,
  parseImageDataUrl,
  isSafeAvatarFile,
  avatarUrlFor,
  setAvatar,
  removeAvatar,
};
