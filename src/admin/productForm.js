// Modal form for creating or editing a product. Photo URLs are managed
// by the image uploader (Supabase Storage); the underlying hidden
// fields image_url + gallery_urls still flow through collectFormData.
//
// Per-product colors are gone — colors come from the shop_colors
// inventory at runtime. This form only carries the multicolor toggle
// and its dependent fields (price, cost, print time, hint).

import { createProduct, updateProduct, centsToDollars, slugify } from './products.js';
import { mountImageUploader } from './imageUploader.js';

const CATEGORIES = ['keychains', 'fidgets', 'figurines', 'ornaments', 'more'];
const BADGES = ['', 'new', 'hot', 'fav'];

let onSavedCallback = null;
let editing = null;

export function openProductForm(product, { onSaved } = {}) {
  onSavedCallback = onSaved;
  editing = product || null;
  const root = document.getElementById('modal-root');
  if (!root) return;

  const isCreate = !product;
  const p = product || defaultProduct();

  root.innerHTML = `
    <div class="modal-overlay open" id="formOverlay">
      <div class="modal admin-form-modal">
        <button class="modal-close" id="formClose" aria-label="Close">×</button>
        <div class="modal-head">
          <h3>${isCreate ? 'New Product' : 'Edit Product'}</h3>
          ${!isCreate ? `<p class="admin-form-id">id: ${escapeHtml(p.id)}</p>` : ''}
        </div>
        <form id="productForm" class="admin-form" novalidate>
          <div class="admin-form-grid">
            <div class="field admin-col-full">
              <label for="f_name">Name *</label>
              <input id="f_name" name="name" type="text" required value="${escapeAttr(p.name || '')}" />
            </div>

            <div class="field admin-col-full">
              <label for="f_slug">Slug *</label>
              <input id="f_slug" name="slug" type="text" required value="${escapeAttr(p.slug || '')}"
                placeholder="auto-generated from name when empty" />
              <div class="field-hint">URL-friendly. Lowercase letters, numbers, hyphens only.</div>
            </div>

            <div class="field">
              <label for="f_category">Category *</label>
              <select id="f_category" name="category" required>
                ${CATEGORIES.map(c => `
                  <option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>
                `).join('')}
              </select>
            </div>

            <div class="field">
              <label for="f_display_order">Display order</label>
              <input id="f_display_order" name="display_order" type="number" min="0" value="${escapeAttr(p.display_order ?? 0)}" />
              <div class="field-hint">Sort key within category. Lower = earlier.</div>
            </div>

            <div class="field admin-col-full">
              <label for="f_description">Short description</label>
              <textarea id="f_description" name="description" rows="2" placeholder="One-liner shown on cards.">${escapeHtml(p.description || '')}</textarea>
            </div>

            <div class="field admin-col-full">
              <label for="f_details">Long details</label>
              <textarea id="f_details" name="details" rows="4" placeholder="Detail-modal copy. Falls back to short description when empty.">${escapeHtml(p.details || '')}</textarea>
            </div>

            <div class="field admin-col-full">
              <input id="f_image_url" name="image_url" type="hidden" value="${escapeAttr(p.image_url || '')}" />
              <div id="primaryUploaderMount"></div>
            </div>

            <div class="field admin-col-full">
              <textarea id="f_gallery_urls" name="gallery_urls" hidden>${escapeHtml((p.gallery_urls || []).join('\n'))}</textarea>
              <div id="galleryUploaderMount"></div>
            </div>

            <div class="field">
              <label for="f_sale_price">Sale price (USD) *</label>
              <input id="f_sale_price" name="sale_price_dollars" type="text" inputmode="decimal" required value="${centsToDollars(p.sale_price_cents)}" placeholder="8.00" />
            </div>

            <div class="field">
              <label for="f_unit_cost">Unit cost (USD) *</label>
              <input id="f_unit_cost" name="unit_cost_dollars" type="text" inputmode="decimal" required value="${centsToDollars(p.unit_cost_cents)}" placeholder="0.85" />
              <div class="field-hint">Filament + electricity per print. PRIVATE — never shown to customers.</div>
            </div>

            <div class="field">
              <label for="f_print_time">Print time (hours)</label>
              <input id="f_print_time" name="print_time_hours" type="number" step="0.1" min="0" value="${escapeAttr(p.print_time_hours ?? '')}" />
            </div>

            <div class="field">
              <label for="f_badge">Badge</label>
              <select id="f_badge" name="badge">
                ${BADGES.map(b => `
                  <option value="${b}" ${(p.badge || '') === b ? 'selected' : ''}>${b || '— none —'}</option>
                `).join('')}
              </select>
            </div>

            <div class="field admin-col-full admin-flags">
              <label class="admin-checkbox">
                <input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''} />
                <span>Active (shown to customers)</span>
              </label>
              <label class="admin-checkbox">
                <input type="checkbox" name="featured" ${p.featured ? 'checked' : ''} />
                <span>Featured</span>
              </label>
              <label class="admin-checkbox">
                <input type="checkbox" name="customizable" id="f_customizable" ${p.customizable ? 'checked' : ''} />
                <span>Customizable (engraving)</span>
              </label>
              <label class="admin-checkbox">
                <input type="checkbox" name="multicolor_available" id="f_multicolor_available" ${p.multicolor_available ? 'checked' : ''} />
                <span>Multicolor available</span>
              </label>
            </div>

            <div class="field admin-col-full" id="customization_fields" ${p.customizable ? '' : 'hidden'}>
              <label for="f_customization_label">Customization label</label>
              <input id="f_customization_label" name="customization_label" type="text" value="${escapeAttr(p.customization_label || '')}" placeholder="Engrave a name (max 8 chars)" />

              <label for="f_customization_max_chars" style="margin-top:8px">Max characters</label>
              <input id="f_customization_max_chars" name="customization_max_chars" type="number" min="1" max="100" value="${escapeAttr(p.customization_max_chars ?? 8)}" />
            </div>

            <div class="field admin-col-full multicolor-block" id="multicolor_fields" ${p.multicolor_available ? '' : 'hidden'}>
              <div class="multicolor-block-title">Multicolor variant</div>
              <div class="field-hint" style="margin-bottom:10px">All four fields below are required when this product offers multicolor printing.</div>
              <div class="admin-form-grid">
                <div class="field">
                  <label for="f_mc_sale_price">Multicolor sale price (USD) *</label>
                  <input id="f_mc_sale_price" name="multicolor_sale_price_dollars" type="text" inputmode="decimal" value="${centsToDollars(p.multicolor_sale_price_cents)}" placeholder="32.00" />
                </div>
                <div class="field">
                  <label for="f_mc_unit_cost">Multicolor unit cost (USD) *</label>
                  <input id="f_mc_unit_cost" name="multicolor_unit_cost_dollars" type="text" inputmode="decimal" value="${centsToDollars(p.multicolor_unit_cost_cents)}" placeholder="3.40" />
                  <div class="field-hint">PRIVATE.</div>
                </div>
                <div class="field">
                  <label for="f_mc_print_time">Multicolor print time (hours) *</label>
                  <input id="f_mc_print_time" name="multicolor_print_time_hours" type="number" step="0.1" min="0" value="${escapeAttr(p.multicolor_print_time_hours ?? '')}" placeholder="8.0" />
                </div>
                <div class="field admin-col-full">
                  <label for="f_mc_hint">Multicolor hint (shown to customer)</label>
                  <input id="f_mc_hint" name="multicolor_hint" type="text" value="${escapeAttr(p.multicolor_hint || '')}" placeholder="Include color choice for body, head, eyes" />
                  <div class="field-hint">Optional. Shown above the customer's free-text textarea so they know which parts to specify.</div>
                </div>
              </div>
            </div>
          </div>

          <div class="admin-form-foot">
            <div class="admin-form-error" id="formError" hidden></div>
            <div class="admin-form-actions">
              <button type="button" class="btn-secondary" id="formCancel">Cancel</button>
              <button type="submit" class="btn-primary" id="formSubmit">${isCreate ? 'Create Product' : 'Save Changes'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  wireForm();
}

function wireForm() {
  const overlay = document.getElementById('formOverlay');
  const form = document.getElementById('productForm');
  const errEl = document.getElementById('formError');

  // Auto-generate slug from name if slug is empty.
  const nameEl = document.getElementById('f_name');
  const slugEl = document.getElementById('f_slug');
  let slugManuallyEdited = !!(slugEl.value);
  slugEl.addEventListener('input', () => { slugManuallyEdited = true; });
  nameEl.addEventListener('input', () => {
    if (!slugManuallyEdited) {
      slugEl.value = slugify(nameEl.value);
    }
  });

  // Show/hide customization fields.
  document.getElementById('f_customizable').addEventListener('change', e => {
    document.getElementById('customization_fields').hidden = !e.target.checked;
  });

  // Show/hide multicolor fields.
  document.getElementById('f_multicolor_available').addEventListener('change', e => {
    document.getElementById('multicolor_fields').hidden = !e.target.checked;
  });

  // Mount the photo uploaders. They write back to the hidden
  // image_url input and the hidden gallery_urls textarea.
  const editingProduct = editing;
  const primaryInitial = editingProduct?.image_url || '';
  const galleryInitial = Array.isArray(editingProduct?.gallery_urls)
    ? editingProduct.gallery_urls
    : [];
  mountImageUploader(document.getElementById('primaryUploaderMount'), {
    mode: 'single',
    initialValue: primaryInitial,
    targetInputId: 'f_image_url',
    label: 'Primary image',
  });
  mountImageUploader(document.getElementById('galleryUploaderMount'), {
    mode: 'multi',
    initialValue: galleryInitial,
    targetInputId: 'f_gallery_urls',
    label: 'Gallery images (additional photos)',
  });

  // Don't let Enter inside an input submit the form.
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
    }
  });

  // Numeric-only filter + select-all on focus for dollar / count fields.
  const numericFields = [
    'f_sale_price', 'f_unit_cost',
    'f_mc_sale_price', 'f_mc_unit_cost',
    'f_customization_max_chars', 'f_display_order', 'f_print_time', 'f_mc_print_time',
  ];
  const dollarFields = new Set(['f_sale_price', 'f_unit_cost', 'f_mc_sale_price', 'f_mc_unit_cost']);
  numericFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('focus', () => {
      setTimeout(() => { try { el.select(); } catch (_) {} }, 0);
    });

    if (dollarFields.has(id)) {
      el.addEventListener('input', () => {
        let v = el.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
        if (parts[1] && parts[1].length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
        if (v !== el.value) el.value = v;
      });
    }
  });

  document.getElementById('formClose').addEventListener('click', close);
  document.getElementById('formCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target.id === 'formOverlay') close();
  });
  document.addEventListener('keydown', escHandler);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    errEl.textContent = '';
    const submitBtn = document.getElementById('formSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const data = collectFormData(form);
      if (!data.slug) data.slug = slugify(data.name);
      if (!data.slug) throw new Error('Slug is required (auto-generates from name).');

      if (editing) {
        await updateProduct(editing.id, data);
      } else {
        await createProduct(data);
      }
      close();
      if (onSavedCallback) onSavedCallback();
    } catch (err) {
      console.error(err);
      errEl.textContent = err.message || 'Save failed';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = editing ? 'Save Changes' : 'Create Product';
    }
  });
}

function escHandler(e) {
  if (e.key === 'Escape') close();
}

function close() {
  const overlay = document.getElementById('formOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.removeEventListener('keydown', escHandler);
  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }, 200);
}

function collectFormData(form) {
  const fd = new FormData(form);
  const out = {
    name: (fd.get('name') || '').toString().trim(),
    slug: (fd.get('slug') || '').toString().trim(),
    description: (fd.get('description') || '').toString(),
    details: (fd.get('details') || '').toString(),
    category: (fd.get('category') || '').toString(),
    image_url: (fd.get('image_url') || '').toString(),
    gallery_urls: (fd.get('gallery_urls') || '').toString(),
    customizable: fd.get('customizable') === 'on',
    customization_label: (fd.get('customization_label') || '').toString(),
    customization_max_chars: parseInt(fd.get('customization_max_chars') || '8', 10) || 8,
    sale_price_dollars: (fd.get('sale_price_dollars') || '0').toString(),
    unit_cost_dollars: (fd.get('unit_cost_dollars') || '0').toString(),
    print_time_hours: (fd.get('print_time_hours') || '').toString(),
    multicolor_available: fd.get('multicolor_available') === 'on',
    multicolor_sale_price_dollars: (fd.get('multicolor_sale_price_dollars') || '').toString(),
    multicolor_unit_cost_dollars: (fd.get('multicolor_unit_cost_dollars') || '').toString(),
    multicolor_print_time_hours: (fd.get('multicolor_print_time_hours') || '').toString(),
    multicolor_hint: (fd.get('multicolor_hint') || '').toString(),
    active: fd.get('active') === 'on',
    featured: fd.get('featured') === 'on',
    badge: (fd.get('badge') || '').toString(),
    display_order: parseInt(fd.get('display_order') || '0', 10) || 0,
  };
  return out;
}

function defaultProduct() {
  return {
    name: '',
    slug: '',
    description: '',
    details: '',
    category: 'keychains',
    image_url: '',
    gallery_urls: [],
    customizable: false,
    customization_label: '',
    customization_max_chars: 8,
    sale_price_cents: 0,
    unit_cost_cents: 0,
    print_time_hours: null,
    multicolor_available: false,
    multicolor_sale_price_cents: null,
    multicolor_unit_cost_cents: null,
    multicolor_print_time_hours: null,
    multicolor_hint: '',
    active: true,
    featured: false,
    badge: null,
    display_order: 0,
  };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
