// Admin colors page — table of every shop_color, click row to edit.

import {
  listAllShopColors,
  setShopColorActive,
} from './shopColors.js';

let colors = [];
let onEditCallback = null;
let onCreateCallback = null;
let onDeleteCallback = null;

export async function mountColorList(rootEl, { onEdit, onCreate, onDelete }) {
  onEditCallback = onEdit;
  onCreateCallback = onCreate;
  onDeleteCallback = onDelete;

  rootEl.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-sub" style="flex:1; min-width:0">
        Colors are the filament inventory shown to customers in the product picker. Hidden colors stay in the list but don't appear on the public site.
      </div>
      <button id="adminAddColorBtn" class="admin-btn admin-btn-primary">+ New Color</button>
    </div>
    <div id="colorTableWrap" class="admin-table-wrap">
      <div class="admin-loading">Loading colors…</div>
    </div>
  `;

  document.getElementById('adminAddColorBtn').addEventListener('click', () => onCreateCallback && onCreateCallback());

  await refreshColorList();
}

export async function refreshColorList() {
  try {
    colors = await listAllShopColors();
    renderTable();
  } catch (err) {
    console.error(err);
    document.getElementById('colorTableWrap').innerHTML = `
      <div class="admin-error">Failed to load colors: ${escapeHtml(err.message)}</div>
    `;
  }
}

function renderTable() {
  const wrap = document.getElementById('colorTableWrap');
  if (!wrap) return;

  if (colors.length === 0) {
    wrap.innerHTML = `<div class="admin-empty">No colors yet. Add your first one with the button above.</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="admin-count">${colors.length} color${colors.length === 1 ? '' : 's'}</div>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Swatch</th>
          <th>Name</th>
          <th>Display order</th>
          <th>Active</th>
          <th class="admin-th-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${colors.map(row).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    const color = colors.find(c => c.id === id);

    tr.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      onEditCallback && onEditCallback(color);
    });
    tr.querySelector('[data-action="delete"]').addEventListener('click', e => {
      e.stopPropagation();
      onDeleteCallback && onDeleteCallback(color);
    });
    tr.querySelector('[data-action="toggle-active"]').addEventListener('change', async e => {
      e.stopPropagation();
      const wantsOff = !e.target.checked;
      if (wantsOff) {
        const ok = confirm(`Hide "${color.name}" from the customer color picker?\n\nIt'll stay in your list and you can toggle it back on later. Existing orders that referenced this color are unaffected.`);
        if (!ok) {
          e.target.checked = true;
          return;
        }
      }
      try {
        const updated = await setShopColorActive(id, e.target.checked);
        Object.assign(color, updated);
      } catch (err) {
        e.target.checked = !e.target.checked;
        alert(`Failed to update: ${err.message}`);
      }
    });

    tr.addEventListener('click', e => {
      if (e.target.closest('input, select, button, label, .admin-toggle, .admin-actions')) return;
      onEditCallback && onEditCallback(color);
    });
  });
}

function row(c) {
  const swatchStyle = c.swatch_hex
    ? `background:${escapeAttr(c.swatch_hex)}`
    : 'background: repeating-linear-gradient(45deg, #ddd 0 6px, #fff 6px 12px)';
  return `
    <tr data-id="${c.id}" class="${c.active ? '' : 'admin-row-inactive'}">
      <td><span class="color-swatch" style="${swatchStyle}" title="${escapeAttr(c.swatch_hex || 'no swatch set')}"></span></td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${c.display_order}</td>
      <td>
        <label class="admin-toggle">
          <input type="checkbox" data-action="toggle-active" ${c.active ? 'checked' : ''} />
          <span class="admin-toggle-slider"></span>
        </label>
      </td>
      <td class="admin-actions">
        <button class="admin-link" data-action="edit">Edit</button>
        <button class="admin-link admin-link-danger" data-action="delete">Delete</button>
      </td>
    </tr>
  `;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
