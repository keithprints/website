import { formatPrice, categoryGradient, categoryLabel } from '../lib/format.js';

// Category-based emoji fallback when a product has no image at all.
const CATEGORY_EMOJI = {
  keychains: '🔑',
  fidgets: '🌀',
  figurines: '🎭',
  ornaments: '✨',
  more: '🎁',
};

// `shopColors` is the active filament inventory, fetched once at app
// init by main.js and passed through here. Same list shown for every
// product (per-product color restriction was removed in migration 007).
export function openProductModal(product, shopColors, onConfirm) {
  const root = document.getElementById('modal-root');
  const colors = Array.isArray(shopColors) ? shopColors : [];
  const showColorPicker = colors.length > 0;
  const showCustomization = !!product.customizable;
  const showVariantPicker = !!product.multicolor_available;

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

  // Variant state — defaults to single. The variant determines which
  // pricing/timing the modal displays and what gets passed to the cart.
  let variant = 'single';

  function priceForVariant(v) {
    return v === 'multi'
      ? (product.multicolor_sale_price_cents ?? product.sale_price_cents)
      : product.sale_price_cents;
  }

  function printTimeForVariant(v) {
    return v === 'multi'
      ? (product.multicolor_print_time_hours ?? product.print_time_hours)
      : product.print_time_hours;
  }

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
          <div class="modal-detail-price" id="modalDetailPrice">${formatPrice(priceForVariant(variant))}</div>

          <div class="modal-detail-meta" id="modalDetailMeta">
            ${renderMeta(product, variant)}
          </div>

          ${longCopy ? `<p class="modal-detail-desc">${escapeHtml(longCopy)}</p>` : ''}

          ${showVariantPicker ? `
            <div class="field">
              <label>Print style</label>
              <div class="variant-options" id="variantOptions">
                <label class="variant-option selected">
                  <input type="radio" name="variant" value="single" checked />
                  <span class="variant-name">Single color</span>
                  <span class="variant-price">${formatPrice(product.sale_price_cents)}</span>
                </label>
                <label class="variant-option">
                  <input type="radio" name="variant" value="multi" />
                  <span class="variant-name">Multicolor</span>
                  <span class="variant-price">${formatPrice(product.multicolor_sale_price_cents ?? product.sale_price_cents)}</span>
                </label>
              </div>
            </div>
          ` : ''}

          <div class="field" id="singleColorField" ${showVariantPicker && variant === 'multi' ? 'hidden' : ''}>
            ${showColorPicker ? `
              <label>Pick your color</label>
              <div class="color-grid" id="colorGrid" role="radiogroup" aria-label="Color">
                ${colors.map((c, i) => `
                  <button
                    type="button"
                    class="color-tile ${i === 0 ? 'selected' : ''}"
                    data-color="${escapeAttr(c.name)}"
                    role="radio"
                    aria-checked="${i === 0 ? 'true' : 'false'}"
                  >
                    <span class="color-swatch-dot" style="${swatchStyle(c.swatch_hex)}"></span>
                    <span class="color-tile-name">${escapeHtml(c.name)}</span>
                  </button>
                `).join('')}
              </div>
            ` : `
              <div class="field-hint">No colors available right now.</div>
            `}
          </div>

          <div class="field" id="multiColorField" hidden>
            <label for="multicolorInput">${escapeHtml(product.multicolor_hint || 'Describe your multicolor preferences')} *</label>
            <textarea
              id="multicolorInput"
              rows="3"
              maxlength="280"
              placeholder="e.g. body: forest green, eyes: gold, accents: black"
              required
            ></textarea>
            <div class="field-hint">Required — describe which parts should be which color so we know what to print.</div>
          </div>

          <div class="modal-inline-error" id="modalInlineError" hidden></div>

          ${showCustomization ? `
            <div class="field">
              <label for="customizationInput">${escapeHtml(product.customization_label || 'Customization')}</label>
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
            <div class="modal-price" id="modalTotalPrice">${formatPrice(priceForVariant(variant))}</div>
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

  // Track selected single-mode color via the chip grid.
  let selectedColor = colors.length > 0 ? colors[0].name : null;

  function clearInlineError() {
    const el = document.getElementById('modalInlineError');
    if (el) { el.hidden = true; el.textContent = ''; }
  }

  function showInlineError(msg) {
    const el = document.getElementById('modalInlineError');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }

  // Wire color chips
  document.querySelectorAll('.color-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      document.querySelectorAll('.color-tile').forEach(t => {
        t.classList.remove('selected');
        t.setAttribute('aria-checked', 'false');
      });
      tile.classList.add('selected');
      tile.setAttribute('aria-checked', 'true');
      selectedColor = tile.dataset.color;
      clearInlineError();
    });
  });

  // Variant radio handlers
  if (showVariantPicker) {
    const radios = document.querySelectorAll('input[name="variant"]');
    radios.forEach(r => {
      r.addEventListener('change', () => {
        if (!r.checked) return;
        variant = r.value;

        // Update selected styling on the labels
        document.querySelectorAll('.variant-option').forEach(opt => opt.classList.remove('selected'));
        r.closest('.variant-option').classList.add('selected');

        // Show/hide single vs multi inputs
        const singleField = document.getElementById('singleColorField');
        const multiField = document.getElementById('multiColorField');
        if (singleField) singleField.hidden = (variant === 'multi');
        if (multiField) multiField.hidden = (variant !== 'multi');

        // Update price + meta
        document.getElementById('modalDetailPrice').textContent = formatPrice(priceForVariant(variant));
        document.getElementById('modalTotalPrice').textContent = formatPrice(priceForVariant(variant));
        const metaEl = document.getElementById('modalDetailMeta');
        if (metaEl) metaEl.innerHTML = renderMeta(product, variant);

        clearInlineError();
      });
    });
  }

  // Clear the inline error as soon as the user types in the multicolor box.
  const multicolorInputEl = document.getElementById('multicolorInput');
  if (multicolorInputEl) {
    multicolorInputEl.addEventListener('input', clearInlineError);
  }

  // Gallery thumbnail switching
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
    clearInlineError();

    const customizationText = showCustomization
      ? (document.getElementById('customizationInput').value || '').trim()
      : null;

    let color = null;
    if (variant === 'multi') {
      const desc = (document.getElementById('multicolorInput').value || '').trim();
      if (!desc) {
        // Required — don't add to cart with an empty multicolor description,
        // since we have no way to know what colors to print.
        showInlineError('Please describe your multicolor preferences before adding to cart.');
        const el = document.getElementById('multicolorInput');
        if (el) el.focus();
        return;
      }
      color = desc;
    } else {
      // Selected color came from the chip grid via selectedColor closure.
      if (showColorPicker && !selectedColor) {
        showInlineError('Please pick a color before adding to cart.');
        return;
      }
      color = selectedColor;
    }

    onConfirm({
      variant,
      color,
      customizationText: customizationText || null,
    });
    close();
  });
}

// Returns inline CSS for a swatch chip. Falls back to a striped pattern
// when no hex is configured for the color (matches admin colors table).
function swatchStyle(hex) {
  const v = (hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
    return `background:${v}`;
  }
  return 'background: repeating-linear-gradient(45deg, #ddd 0 4px, #fff 4px 8px)';
}

function renderMeta(product, variant) {
  const printTime = variant === 'multi'
    ? (product.multicolor_print_time_hours ?? product.print_time_hours)
    : product.print_time_hours;

  const parts = [];
  if (printTime) {
    parts.push(`<span class="meta-chip">🖨 ~${formatPrintTime(printTime)} print</span>`);
  }
  parts.push('<span class="meta-chip">📦 Ships in about a week</span>');
  return parts.join('');
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
function escapeAttr(str) { return escapeHtml(str); }
