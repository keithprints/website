import { formatPrice, categoryGradient, categoryLabel } from '../lib/format.js';

// Category-based emoji fallback when a product has no image at all.
const CATEGORY_EMOJI = {
  keychains: '🔑',
  fidgets: '🌀',
  figurines: '🎭',
  ornaments: '✨',
  more: '🎁',
};

export function openProductModal(product, onConfirm) {
  const root = document.getElementById('modal-root');
  const colors = product.colors || [];
  const showColorPicker = colors.length > 0;
  const showCustomization = product.customizable;

  // Build the gallery image list. Main image_url goes first, then any
  // gallery_urls. If neither, we fall back to a category emoji.
  const galleryImages = [];
  if (product.image_url) galleryImages.push(product.image_url);
  if (Array.isArray(product.gallery_urls)) {
    for (const url of product.gallery_urls) {
      if (url && !galleryImages.includes(url)) galleryImages.push(url);
    }
  }
  const hasImages = galleryImages.length > 0;
  const gradient = categoryGradient(product.category);

  // Long-form details fall back to the short description so the modal
  // never looks empty.
  const longCopy = product.details || product.description || '';

  root.innerHTML = `
    <div class="modal-overlay open" id="productModalOverlay">
      <div class="modal modal-detail">
        <button class="modal-close" id="modalClose" aria-label="Close">×</button>

        <div class="modal-gallery" style="background:${gradient}">
          <div class="gallery-main" id="galleryMain">
            ${hasImages
              ? `<img src="${escapeHtml(galleryImages[0])}" alt="${escapeHtml(product.name)}" />`
              : `<div class="emoji">${CATEGORY_EMOJI[product.category] || '🎁'}</div>`}
          </div>
          ${galleryImages.length > 1 ? `
            <div class="gallery-thumbs" id="galleryThumbs">
              ${galleryImages.map((url, i) => `
                <button class="gallery-thumb ${i === 0 ? 'active' : ''}" data-src="${escapeHtml(url)}" aria-label="View image ${i + 1}">
                  <img src="${escapeHtml(url)}" alt="" />
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="modal-detail-body">
          <div class="modal-detail-cat">${escapeHtml(categoryLabel(product.category))}</div>
          <h3 class="modal-detail-name">${escapeHtml(product.name)}</h3>
          <div class="modal-detail-price">${formatPrice(product.sale_price_cents)}</div>

          <div class="modal-detail-meta">
            ${product.print_time_hours ? `<span class="meta-chip">🖨 ~${formatPrintTime(product.print_time_hours)} print</span>` : ''}
            <span class="meta-chip">📦 Ships in about a week</span>
          </div>

          ${longCopy ? `<p class="modal-detail-desc">${escapeHtml(longCopy)}</p>` : ''}

          ${showColorPicker ? `
            <div class="field">
              <label>Pick your color</label>
              <div class="color-options" id="colorOptions">
                ${colors.map((c, i) => `
                  <button class="color-chip ${i === 0 ? 'selected' : ''}" data-color="${escapeHtml(c)}">
                    ${escapeHtml(c)}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${showCustomization ? `
            <div class="field">
              <label>${escapeHtml(product.customization_label || 'Customization')}</label>
              <input
                id="customizationInput"
                type="text"
                maxlength="${product.customization_max_chars || 8}"
                placeholder="e.g. OLIVIA"
              />
              <div class="field-hint">Max ${product.customization_max_chars || 8} characters</div>
            </div>
          ` : ''}

          <div class="modal-price-box">
            <div>Total</div>
            <div class="modal-price">${formatPrice(product.sale_price_cents)}</div>
          </div>
          <div class="modal-ship-note">+ shipping calculated at checkout</div>
        </div>

        <div class="modal-foot">
          <button class="btn-secondary" id="cancelBtn">Close</button>
          <button class="btn-primary" id="confirmBtn">Add to Cart →</button>
        </div>
      </div>
    </div>
  `;

  // Track selected color and current main image
  let selectedColor = colors[0] || null;

  if (showColorPicker) {
    document.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedColor = chip.dataset.color;
      });
    });
  }

  if (galleryImages.length > 1) {
    const mainEl = document.getElementById('galleryMain');
    document.querySelectorAll('.gallery-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        mainEl.innerHTML = `<img src="${escapeHtml(thumb.dataset.src)}" alt="${escapeHtml(product.name)}" />`;
      });
    });
  }

  function close() {
    const overlay = document.getElementById('productModalOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => { root.innerHTML = ''; }, 200);
    }
    document.removeEventListener('keydown', escHandler);
  }

  function escHandler(e) {
    if (e.key === 'Escape') close();
  }

  document.getElementById('modalClose').addEventListener('click', close);
  document.getElementById('cancelBtn').addEventListener('click', close);
  document.getElementById('productModalOverlay').addEventListener('click', e => {
    if (e.target.id === 'productModalOverlay') close();
  });
  document.addEventListener('keydown', escHandler);

  document.getElementById('confirmBtn').addEventListener('click', () => {
    const customizationText = showCustomization
      ? (document.getElementById('customizationInput').value || '').trim()
      : null;

    onConfirm({
      color: selectedColor,
      customizationText: customizationText || null,
    });
    close();
  });
}

function formatPrintTime(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return '';
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (Number.isInteger(h)) return `${h}h`;
  return `${h}h`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
