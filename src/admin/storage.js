// Admin-only Supabase Storage wrapper for the product-images bucket.
// All writes require an MFA-verified (AAL2) session — RLS on
// storage.objects (migration 006) enforces this server-side; we still
// validate client-side for fast feedback.

import { supabase } from '../lib/supabase.js';

const BUCKET = 'product-images';
const MAX_FILE_BYTES = 5 * 1024 * 1024;           // 5 MB — matches bucket limit
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export class UploadError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function validateFile(file) {
  if (!file || !(file instanceof File)) {
    throw new UploadError('Not a file', 'invalid');
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new UploadError(
      `Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPEG, WEBP, or GIF.`,
      'mime',
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadError(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`,
      'size',
    );
  }
}

function extensionFor(file) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[file.type] || 'bin';
}

// Returns { url, path } on success; throws UploadError on failure.
export async function uploadProductImage(file) {
  validateFile(file);

  const ext = extensionFor(file);
  // crypto.randomUUID is supported in modern browsers; the admin
  // requires MFA so we don't worry about ancient browser support.
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,                 // fail if path collides (essentially impossible with UUIDs)
      contentType: file.type,
    });
  if (uploadErr) {
    console.error('Storage upload failed:', uploadErr);
    throw new UploadError(uploadErr.message || 'Upload failed', 'upload');
  }

  const { data: urlData } = supabase
    .storage
    .from(BUCKET)
    .getPublicUrl(path);
  if (!urlData?.publicUrl) {
    throw new UploadError('Upload succeeded but no URL returned', 'no-url');
  }
  return { url: urlData.publicUrl, path };
}

// Best-effort delete. Used when an image is replaced or the operator
// removes a thumbnail in the form. Failure is logged but doesn't block
// the form save — the orphaned object can be cleaned up later.
export async function deleteProductImage(urlOrPath) {
  if (!urlOrPath) return;
  const path = urlToPath(urlOrPath);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn('Storage delete failed (orphan may remain):', error);
  }
}

// Pull the in-bucket path out of a public URL. Public URLs look like
// https://<proj>.supabase.co/storage/v1/object/public/product-images/<path>
function urlToPath(url) {
  if (typeof url !== 'string') return null;
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}
