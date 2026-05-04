import {
  getCart,
  getItemCount,
  getSubtotalCents,
  updateQuantity,
  removeItem,
  subscribe,
  getDeliveryMethod,
  getDeliveryZip,
  setDeliveryMethod,
  setDeliveryZip,
} from '../lib/cart.js';
import { formatPrice, categoryGradient } from '../lib/format.js';
import {
  isLocalDeliveryZip,
  localDeliveryZipList,
  LOCAL_DELIVERY_LABEL,
  LOCAL_DELIVERY_DESCRIPTION,
} from '../lib/delivery.js';

const CATEGORY_EMOJI = {
  keychains: '🔑',
  fidgets: '🌀',
  figurines: '🎭',
  ornaments: '✨',
  more: '🎁',
};

const STANDARD_SHIPPING_CENTS = 350;

let onCheckoutCallback = null;
// Track whether the user has interacted with the zip input so we don't
// show "invalid zip" hints before they've had a chance to type.
let zipDirty = false;

export function mountCartDrawer({ onCheckout }) {
  onCheckoutCallback = onCheckout;
  const root = document.getElementById('drawer-root');
  if (!root) return;

  root.innerHTML = `
    <div class="drawer-overlay" id="drawerOverlay" hidden></div>
    <aside class="cart-drawer" id="cartDrawer" aria-hidden="true" aria-label="Shopping cart">
      <div class="cart-head">
        <h3>Your Cart</h3>
        <button class="cart-close" id="cartCloseBtn" aria-label="Close cart">×</button>
      </div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-foot" id="cartFoot"></div>
    </aside>
  `;

  document.getElementById('cartCloseBtn').addEventListener('click', closeCartDrawer);
  document.getElementById('drawerOverlay').addEventListener('click', closeCartDrawer);
  document.addEventListener('keydown', e => {
    const drawer = document.getElementById('cartDrawer');
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeCartDrawer();
    }
  });

  // Re-render on every cart change.
  subscribe(render);
}

export function openCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;
  overlay.hidden = false;
  // Force reflow so the transition triggers.
  void overlay.offsetWidth;
  overlay.classList.add('open');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.hidden = true; }, 250);
}

function render() {
  const itemsEl = document.getElementById('cartItems');
  const footEl = document.getElementById('cartFoot');
  if (!itemsEl || !footEl) return;
  const cart = getCart();

  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-emoji">🛒</span>
        <p class="cart-empty-line">Your cart is empty.</p>
        <p class="cart-empty-sub">Pick something cool from the shop.</p>
      </div>
    `;
    footEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = cart.map(item => {
    const grad = categoryGradient(item.productCategory);
    const emoji = CATEGORY_EMOJI[item.productCategory] || '🎁';
    const variantLine = [item.color, item.customizationText].filter(Boolean).join(' · ');
    return `
      <div class="cart-item" data-key="${escapeHtml(item.key)}">
        <div class="cart-item-img" style="background:${grad}">
          ${item.productImageUrl
            ? `<img src="${escapeHtml(item.productImageUrl)}" alt="${escapeHtml(item.productName)}" />`
            : `<div class="emoji">${emoji}</div>`}
        </div>
        <div class="cart-item-body">
          <div class="cart-item-name">${escapeHtml(item.productName)}</div>
          ${variantLine ? `<div class="cart-item-variant">${escapeHtml(variantLine)}</div>` : ''}
          <div class="cart-item-price">${formatPrice(item.priceCents)}</div>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" aria-label="Decrease quantity">−</button>
            <span class="qty-val">${item.quantity}</span>
            <button class="qty-btn" data-action="inc" aria-label="Increase quantity">+</button>
            <button class="cart-item-remove" data-action="remove" aria-label="Remove ${escapeHtml(item.productName)} from cart">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  itemsEl.querySelectorAll('.cart-item').forEach(el => {
    const key = el.dataset.key;
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = getCart().find(i => i.key === key);
        if (!item) return;
        switch (btn.dataset.action) {
          case 'inc': updateQuantity(key, item.quantity + 1); break;
          case 'dec': updateQuantity(key, item.quantity - 1); break;
          case 'remove': removeItem(key); break;
        }
      });
    });
  });

  // ============ FOOTER (delivery picker + checkout) ============
  const subtotal = getSubtotalCents();
  const itemCount = getItemCount();
  const deliveryMethod = getDeliveryMethod();
  const deliveryZip = getDeliveryZip();
  const isLocal = deliveryMethod === 'local';
  const zipValid = isLocal ? isLocalDeliveryZip(deliveryZip) : true;
  const checkoutEnabled = !isLocal || zipValid;

  const shippingCents = isLocal ? 0 : STANDARD_SHIPPING_CENTS;
  const total = subtotal + shippingCents;

  footEl.innerHTML = `
    <div class="cart-subtotal">
      <span>Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})</span>
      <span class="cart-subtotal-amount">${formatPrice(subtotal)}</span>
    </div>

    <div class="cart-delivery">
      <div class="delivery-label">Delivery</div>

      <label class="delivery-option ${deliveryMethod === 'shipping' ? 'selected' : ''}">
        <input type="radio" name="delivery" value="shipping" ${deliveryMethod === 'shipping' ? 'checked' : ''} />
        <span class="delivery-text">
          <span class="delivery-name">Standard Shipping</span>
          <span class="delivery-sub">3-5 business days</span>
        </span>
        <span class="delivery-price">${formatPrice(STANDARD_SHIPPING_CENTS)}</span>
      </label>

      <label class="delivery-option ${isLocal ? 'selected' : ''}">
        <input type="radio" name="delivery" value="local" ${isLocal ? 'checked' : ''} />
        <span class="delivery-text">
          <span class="delivery-name">${escapeHtml(LOCAL_DELIVERY_LABEL)}</span>
          <span class="delivery-sub">${escapeHtml(LOCAL_DELIVERY_DESCRIPTION)}</span>
        </span>
        <span class="delivery-price free">FREE</span>
      </label>

      ${isLocal ? `
        <div class="delivery-zip-row ${zipValid ? 'valid' : (zipDirty ? 'invalid' : '')}">
          <label for="zipInput" class="zip-label">ZIP code</label>
          <input
            id="zipInput"
            type="text"
            inputmode="numeric"
            maxlength="5"
            value="${escapeHtml(deliveryZip)}"
            placeholder="94501"
            autocomplete="postal-code"
          />
          ${!zipValid && zipDirty ? `
            <div class="zip-hint">
              Local delivery is available for ZIPs: ${localDeliveryZipList().join(', ')}
            </div>
          ` : ''}
          ${zipValid ? `<div class="zip-hint zip-hint-ok">✓ You're in the local zone</div>` : ''}
        </div>
      ` : ''}
    </div>

    <div class="cart-total-row">
      <span>Total</span>
      <span class="cart-total-amount">${formatPrice(total)}</span>
    </div>

    <button class="btn-primary cart-checkout" id="cartCheckoutBtn" ${checkoutEnabled ? '' : 'disabled'}>
      Checkout →
    </button>
  `;

  // Wire delivery radios
  footEl.querySelectorAll('input[name="delivery"]').forEach(radio => {
    radio.addEventListener('change', e => {
      // Reset dirty flag when switching INTO local — fresh chance to type a zip.
      if (e.target.value === 'local' && deliveryMethod !== 'local') {
        zipDirty = false;
      }
      setDeliveryMethod(e.target.value);
    });
  });

  // Wire zip input — validate on every keystroke and persist silently
  // (setDeliveryZip doesn't notify, so the drawer doesn't re-render mid-typing
  // and steal focus). Visual feedback below is updated in place.
  const zipInput = document.getElementById('zipInput');
  if (zipInput) {
    zipInput.addEventListener('input', e => {
      const value = (e.target.value || '').replace(/\D/g, '').slice(0, 5);
      if (value !== e.target.value) e.target.value = value;
      zipDirty = value.length > 0;
      setDeliveryZip(value);
      updateZipFeedback(value);
    });
  }

  document.getElementById('cartCheckoutBtn').addEventListener('click', () => {
    if (!checkoutEnabled) return;
    if (onCheckoutCallback) onCheckoutCallback();
  });
}

// Update the validity hint, row class, and Checkout-button enabled state
// without re-rendering the input itself (preserves focus while typing).
function updateZipFeedback(zip) {
  const row = document.querySelector('.delivery-zip-row');
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  if (!row || !checkoutBtn) return;

  const valid = isLocalDeliveryZip(zip);
  const dirty = zip.length > 0;

  row.classList.toggle('valid', valid);
  row.classList.toggle('invalid', !valid && dirty);

  // Replace just the hint line (it's the last child of the row).
  const oldHint = row.querySelector('.zip-hint');
  if (oldHint) oldHint.remove();

  if (valid) {
    const hint = document.createElement('div');
    hint.className = 'zip-hint zip-hint-ok';
    hint.textContent = "✓ You're in the local zone";
    row.appendChild(hint);
  } else if (dirty) {
    const hint = document.createElement('div');
    hint.className = 'zip-hint';
    hint.textContent = `Local delivery is available for ZIPs: ${localDeliveryZipList().join(', ')}`;
    row.appendChild(hint);
  }

  checkoutBtn.disabled = !valid;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
