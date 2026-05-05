// Admin table view: lists every product (active + inactive), with
// search, category filter, and inline toggle actions. Click a row to
// open the edit form.

import { listAllProducts, setActive, setFeatured, setBadge } from './products.js';
import { categoryLabel, formatPrice } from '../lib/format.js';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'keychains', label: 'Keychains' },
  { value: 'fidgets', label: 'Fidgets' },
  { value: 'figurines', label: 'Figurines' },
  { value: 'ornaments', label: 'Ornaments' },
  { value: 'more', label: '& More' },
];

const BADGE_OPTIONS = ['', 'new', 'hot', 'fav'];

let products = [];
let filterCategory = 'all';
let searchQuery = '';
let onEditCallback = null;
let onCreateCallback = null;
let onDeleteCallback = null;

export async function mountProductList(rootEl, { onEdit, onCreate, onDelete }) {
  onEditCallback = onEdit;
  onCreateCallback = onCreate;
  onDeleteCallback = onDelete;

  rootEl.innerHTML = `
    <div class="admin-toolbar">
      <input id="adminSearch" class="admin-input" type="text" placeholder="Search by name or slug…" autocomplete="off" />
      <select id="adminFilter" class="admin-input">
        ${CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
      </select>
      <button id="adminAddBtn" class="admin-btn admin-btn-primary">+ New Product</button>
    </div>
    <div id="adminTableWrap" class="admin-table-wrap">
      <div class="admin-loading">Loading products…</div>
    </div>
  `;

  document.getElementById('adminAddBtn').addEventListener('click', () => onCreateCallback && onCreateCallback());
  document.getElementById('adminSearch').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });
  document.getElementById('adminFilter').addEventListener('change', e => {
    filterCategory = e.target.value;
    renderTable();
  });

  await refreshList();
}

export async function refreshList() {
  try {
    products = await listAllProducts();
    renderTable();
  } catch (err) {
    console.error(err);
    document.getElementById('adminTableWrap').innerHTML = `
      <div class="admin-error">Failed to load products: ${escapeHtml(err.message)}</div>
    `;
  }
}

function renderTable() {
  const wrap = document.getElementById('adminTableWrap');
  if (!wrap) return;

  const filtered = products.filter(p => {
    const matchCat = filterCategory === 'all' || p.category === filterCategory;
    const matchSearch = !searchQuery
      || p.name.toLowerCase().includes(searchQuery)
      || (p.slug || '').toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    wrap.innerHTML = `<div class="admin-empty">No products match.</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="admin-count">${filtered.length} of ${products.length} product${products.length === 1 ? '' : 's'}</div>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Price</th>
          <th>Cost</th>
          <th>Margin</th>
          <th>Active</th>
          <th>Featured</th>
          <th>Badge</th>
          <th class="admin-th-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(p => row(p)).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    const product = products.find(p => p.id === id);

    tr.querySelector('[data-action="edit"]').addEventListener('click', e => {
      e.stopPropagation();
      onEditCallback && onEditCallback(product);
    });
    tr.querySelector('[data-action="delete"]').addEventListener('click', e => {
      e.stopPropagation();
      onDeleteCallback && onDeleteCallback(product);
    });
    tr.querySelector('[data-action="toggle-active"]').addEventListener('change', async e => {
      e.stopPropagation();
      const wantsOff = !e.target.checked;
      // Confirm only when hiding from customers — turning back on is no-friction.
      if (wantsOff) {
        const ok = confirm(`Hide "${product.name}" from the public catalog?\n\nCustomers won't see it until you toggle it back on.`);
        if (!ok) {
          e.target.checked = true;
          return;
        }
      }
      try {
        const updated = await setActive(id, e.target.checked);
        Object.assign(product, updated);
      } catch (err) {
        e.target.checked = !e.target.checked;
        alert(`Failed to update: ${err.message}`);
      }
    });
    tr.querySelector('[data-action="toggle-featured"]').addEventListener('change', async e => {
      e.stopPropagation();
      try {
        const updated = await setFeatured(id, e.target.checked);
        Object.assign(product, updated);
      } catch (err) {
        e.target.checked = !e.target.checked;
        alert(`Failed to update: ${err.message}`);
      }
    });
    tr.querySelector('[data-action="set-badge"]').addEventListener('change', async e => {
      e.stopPropagation();
      const value = e.target.value || null;
      try {
        const updated = await setBadge(id, value);
        Object.assign(product, updated);
      } catch (err) {
        alert(`Failed to update: ${err.message}`);
        renderTable();
      }
    });

    // Clicking the row body (outside form controls) also opens the edit form.
    // Toggles are styled spans inside <label> elements, so we have to bail
    // out on label and .admin-toggle as well — not just the underlying inputs.
    tr.addEventListener('click', e => {
      if (e.target.closest('input, select, button, label, .admin-toggle, .admin-actions')) return;
      onEditCallback && onEditCallback(product);
    });
  });
}

function row(p) {
  const margin = p.sale_price_cents > 0
    ? Math.round(((p.sale_price_cents - (p.unit_cost_cents || 0)) / p.sale_price_cents) * 100)
    : 0;
  const marginClass = margin >= 60 ? 'margin-good' : margin >= 30 ? 'margin-ok' : 'margin-low';

  return `
    <tr data-id="${p.id}" class="${p.active ? '' : 'admin-row-inactive'}">
      <td class="admin-name-cell">
        <div class="admin-name">${escapeHtml(p.name)}</div>
        <div class="admin-slug">${escapeHtml(p.slug || '')}</div>
      </td>
      <td>${escapeHtml(categoryLabel(p.category))}</td>
      <td>${formatPrice(p.sale_price_cents)}</td>
      <td>${formatPrice(p.unit_cost_cents || 0)}</td>
      <td class="${marginClass}">${margin}%</td>
      <td>
        <label class="admin-toggle">
          <input type="checkbox" data-action="toggle-active" ${p.active ? 'checked' : ''} />
          <span class="admin-toggle-slider"></span>
        </label>
      </td>
      <td>
        <label class="admin-toggle">
          <input type="checkbox" data-action="toggle-featured" ${p.featured ? 'checked' : ''} />
          <span class="admin-toggle-slider"></span>
        </label>
      </td>
      <td>
        <select data-action="set-badge" class="admin-input admin-input-sm">
          ${BADGE_OPTIONS.map(b => `
            <option value="${b}" ${p.badge === b || (!p.badge && b === '') ? 'selected' : ''}>${b || '—'}</option>
          `).join('')}
        </select>
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
