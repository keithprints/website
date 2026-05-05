// Modal form for creating or editing a shop color.

import { createShopColor, updateShopColor } from './shopColors.js';

let onSavedCallback = null;
let editing = null;

export function openColorForm(color, { onSaved } = {}) {
  onSavedCallback = onSaved;
  editing = color || null;
  const root = document.getElementById('modal-root');
  if (!root) return;

  const isCreate = !color;
  const c = color || defaultColor();

  root.innerHTML = `
    <div class="modal-overlay open" id="colorFormOverlay">
      <div class="modal admin-form-modal" style="max-width:460px">
        <button class="modal-close" id="colorFormClose" aria-label="Close">×</button>
        <div class="modal-head">
          <h3>${isCreate ? 'New Color' : 'Edit Color'}</h3>
          ${!isCreate ? `<p class="admin-form-id">id: ${escapeHtml(c.id)}</p>` : ''}
        </div>
        <form id="colorForm" class="admin-form" novalidate>
          <div class="admin-form-grid" style="grid-template-columns: 1fr">
            <div class="field">
              <label for="cf_name">Name *</label>
              <input id="cf_name" name="name" type="text" required value="${escapeAttr(c.name || '')}" placeholder="e.g. Galaxy Blue" />
              <div class="field-hint">What customers see in the color picker.</div>
            </div>

            <div class="field">
              <label for="cf_swatch">Swatch color (optional)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input id="cf_swatch" name="swatch_hex" type="text" value="${escapeAttr(c.swatch_hex || '')}" placeholder="#1E90FF" style="flex:1" />
                <input id="cf_swatch_picker" type="color" value="${escapeAttr(c.swatch_hex || '#cccccc')}" style="width:48px; height:40px; padding:0; cursor:pointer; border:2px solid var(--ink); border-radius:8px" />
              </div>
              <div class="field-hint">Hex code shown as a small chip. Leave blank for a default striped pattern.</div>
            </div>

            <div class="field">
              <label for="cf_order">Display order</label>
              <input id="cf_order" name="display_order" type="number" min="0" value="${escapeAttr(c.display_order ?? 0)}" />
              <div class="field-hint">Lower numbers appear first in the picker.</div>
            </div>

            <div class="field admin-flags" style="margin-top:4px">
              <label class="admin-checkbox">
                <input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''} />
                <span>Active (visible to customers)</span>
              </label>
            </div>
          </div>

          <div class="admin-form-foot">
            <div class="admin-form-error" id="colorFormError" hidden></div>
            <div class="admin-form-actions">
              <button type="button" class="btn-secondary" id="colorFormCancel">Cancel</button>
              <button type="submit" class="btn-primary" id="colorFormSubmit">${isCreate ? 'Create Color' : 'Save Changes'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  wireForm();
}

function wireForm() {
  const overlay = document.getElementById('colorFormOverlay');
  const form = document.getElementById('colorForm');
  const errEl = document.getElementById('colorFormError');

  // Sync the color picker with the hex text input — typing the hex
  // updates the picker; using the picker writes hex into the text.
  const hexEl = document.getElementById('cf_swatch');
  const pickerEl = document.getElementById('cf_swatch_picker');
  hexEl.addEventListener('input', () => {
    const v = hexEl.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      pickerEl.value = v;
    }
  });
  pickerEl.addEventListener('input', () => {
    hexEl.value = pickerEl.value;
  });

  document.getElementById('colorFormClose').addEventListener('click', close);
  document.getElementById('colorFormCancel').addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target.id === 'colorFormOverlay') close();
  });
  document.addEventListener('keydown', escHandler);

  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
    }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    errEl.textContent = '';
    const submitBtn = document.getElementById('colorFormSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const fd = new FormData(form);
      const data = {
        name: (fd.get('name') || '').toString().trim(),
        swatch_hex: (fd.get('swatch_hex') || '').toString(),
        display_order: parseInt(fd.get('display_order') || '0', 10) || 0,
        active: fd.get('active') === 'on',
      };
      if (!data.name) throw new Error('Name is required.');

      if (editing) {
        await updateShopColor(editing.id, data);
      } else {
        await createShopColor(data);
      }
      close();
      if (onSavedCallback) onSavedCallback();
    } catch (err) {
      console.error(err);
      errEl.textContent = err.message || 'Save failed';
      errEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = editing ? 'Save Changes' : 'Create Color';
    }
  });
}

function escHandler(e) { if (e.key === 'Escape') close(); }

function close() {
  const overlay = document.getElementById('colorFormOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.removeEventListener('keydown', escHandler);
  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }, 200);
}

function defaultColor() {
  return { name: '', swatch_hex: '', display_order: 0, active: true };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
