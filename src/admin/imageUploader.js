// Image uploader UI — renders a drag-drop zone plus thumbnails for
// already-uploaded images. Two modes:
//
//   - 'single': stores one URL. Thumbnail replaces the drop zone when
//     present; clicking remove brings the drop zone back.
//
//   - 'multi':  stores an array of URLs. Drop zone is always visible
//     below the thumbnail strip; new files append to the array.
//
// State is held inside the uploader instance and synced to a hidden
// input/textarea so productForm.js's existing collectFormData reads
// the correct values on submit.

import { uploadProductImage, UploadError } from './storage.js';

export function mountImageUploader(rootEl, options) {
  const {
    mode = 'single',                // 'single' | 'multi'
    initialValue = mode === 'single' ? '' : [],
    targetInputId,                  // hidden input/textarea id to keep in sync
    label = mode === 'single' ? 'Primary image' : 'Gallery images',
  } = options;

  let urls = mode === 'single'
    ? (typeof initialValue === 'string' ? (initialValue ? [initialValue] : []) : [])
    : (Array.isArray(initialValue) ? [...initialValue] : []);

  function syncTarget() {
    const el = document.getElementById(targetInputId);
    if (!el) return;
    if (mode === 'single') {
      el.value = urls[0] || '';
    } else {
      // productForm.js's collectFormData reads gallery_urls as a
      // newline-separated string and splits in toRow.
      el.value = urls.join('\n');
    }
  }

  rootEl.innerHTML = `
    <div class="uploader" data-mode="${mode}">
      <div class="uploader-label">${escapeHtml(label)}</div>
      <div class="uploader-thumbs" data-thumbs></div>
      <div class="uploader-drop" data-drop tabindex="0" role="button" aria-label="Add image">
        <div class="uploader-drop-inner">
          <span class="uploader-drop-icon">📷</span>
          <div class="uploader-drop-text">
            <strong>Click or drop</strong> to add ${mode === 'single' ? 'an image' : 'images'}
          </div>
          <div class="uploader-drop-hint">PNG, JPEG, WEBP, or GIF · max 5 MB</div>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ${mode === 'multi' ? 'multiple' : ''} hidden />
      </div>
      <div class="uploader-status" data-status hidden></div>
    </div>
  `;

  const dropEl = rootEl.querySelector('[data-drop]');
  const fileInput = rootEl.querySelector('input[type="file"]');
  const statusEl = rootEl.querySelector('[data-status]');

  function setStatus(message, kind = 'info') {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.className = 'uploader-status';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = `uploader-status uploader-status-${kind}`;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    if (mode === 'single' && (urls.length > 0 || files.length > 1)) {
      // Single mode: replace existing
      if (urls.length > 0) {
        urls = [];
      }
      // Only take the first file
      await uploadOne(files[0]);
      return;
    }

    // Multi mode: upload sequentially so progress feedback is clear.
    for (const file of files) {
      await uploadOne(file);
    }
  }

  async function uploadOne(file) {
    setStatus(`Uploading ${file.name}…`, 'info');
    try {
      const { url } = await uploadProductImage(file);
      urls.push(url);
      syncTarget();
      renderThumbs();
      setStatus(`Uploaded ${file.name}`, 'ok');
      // Clear the OK status after a short delay; errors stay until next action.
      setTimeout(() => {
        if (statusEl.classList.contains('uploader-status-ok')) setStatus(null);
      }, 1500);
    } catch (err) {
      const message = err instanceof UploadError ? err.message : 'Upload failed';
      console.error('Upload failed:', err);
      setStatus(`Couldn't upload ${file.name}: ${message}`, 'error');
    }
  }

  function renderThumbs() {
    const thumbsEl = rootEl.querySelector('[data-thumbs]');
    if (!thumbsEl) return;

    if (urls.length === 0) {
      thumbsEl.innerHTML = '';
      thumbsEl.hidden = true;
      // Single-mode drop zone always shows when empty.
      dropEl.hidden = false;
      return;
    }
    thumbsEl.hidden = false;

    thumbsEl.innerHTML = urls.map((url, i) => `
      <div class="uploader-thumb" data-index="${i}">
        <img src="${escapeAttr(url)}" alt="" />
        <button type="button" class="uploader-thumb-remove" data-action="remove" data-index="${i}" aria-label="Remove image">×</button>
      </div>
    `).join('');

    thumbsEl.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(btn.dataset.index);
        if (Number.isInteger(idx) && idx >= 0 && idx < urls.length) {
          urls.splice(idx, 1);
          syncTarget();
          renderThumbs();
        }
      });
    });

    // Single mode: hide the drop zone once we have an image. Replace via remove-then-add.
    if (mode === 'single') {
      dropEl.hidden = urls.length > 0;
    }
  }

  // Click drop zone → open file picker
  dropEl.addEventListener('click', () => fileInput.click());
  dropEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', e => {
    handleFiles(e.target.files);
    // Reset so the same file can be picked twice in a row if needed.
    e.target.value = '';
  });

  // Drag-and-drop
  ['dragenter', 'dragover'].forEach(evt =>
    dropEl.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropEl.classList.add('uploader-drop-active');
    })
  );
  ['dragleave', 'dragend'].forEach(evt =>
    dropEl.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropEl.classList.remove('uploader-drop-active');
    })
  );
  dropEl.addEventListener('drop', e => {
    e.preventDefault();
    e.stopPropagation();
    dropEl.classList.remove('uploader-drop-active');
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Initial render
  syncTarget();
  renderThumbs();

  return {
    getUrls: () => [...urls],
    setUrls: (next) => {
      urls = mode === 'single'
        ? (next ? [next] : [])
        : (Array.isArray(next) ? [...next] : []);
      syncTarget();
      renderThumbs();
    },
  };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
