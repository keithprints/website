import { formatPrice, categoryGradient } from '../lib/format.js';

export function openBuyModal(product, onConfirm) {
  const root = document.getElementById('modal-root');
  const colors = product.colors || [];
  const showColorPicker = colors.length > 0;
  const showCustomization = product.customizable;

  root.innerHTML = `
    <div class="modal-overlay open" id="buyModalOverlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description || '')}</p>
        </div>
        <div class="modal-body">
          <div class="modal-product-preview" style="background:${categoryGradient(product.category)}">
            ${product.image_url
              ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" />`
              : '<div class="emoji">🎁</div>'}
          </div>

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
          <div class="modal-ship-note">+ shipping calculated at checkout · ships in about a week</div>
        </div>
        <div class="modal-foot">
          <button class="btn-secondary" id="cancelBtn">Cancel</button>
          <button class="btn-primary" id="confirmBtn">Buy Now →</button>
        </div>
      </div>
    </div>
  `;

  // Color picker logic
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

  // Close handlers
  function close() {
    const overlay = document.getElementById('buyModalOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => { root.innerHTML = ''; }, 200);
    }
  }

  document.getElementById('cancelBtn').addEventListener('click', close);
  document.getElementById('buyModalOverlay').addEventListener('click', e => {
    if (e.target.id === 'buyModalOverlay') close();
  });

  // Confirm
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

  // Keyboard
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
