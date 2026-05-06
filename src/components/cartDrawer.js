import {
  getCart,
  getItemCount,
  getSubtotalCents,
  updateQuantity,
  removeItem,
  subscribe,
  getDeliveryZip,
  setDeliveryZip,
} from '../lib/cart.js';
import { formatPrice, categoryGradient } from '../lib/format.js';
import {
  shippingInfo,
  FREE_SHIPPING_THRESHOLD_CENTS,
} from '../lib/delivery.js';

const CATEGORY_EMOJI = {
  keychains: '🔑',
  fidgets: '🌀',
  figurines: '🎭',
  ornaments: '✨',
  more: '🎁',
};

let onCheckoutCallback = null;

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

    // Variant line: "Multicolor — body: green, eyes: red" or
    // "Single color — Blue", with customization appended.
    const variantLabel = item.variant === 'multi' ? 'Multicolor' : null;
    const colorBits = item.color ? [item.color] : [];
    const variantPieces = [
      variantLabel,
      colorBits.join(', '),
      item.customizationText,
    ].filter(Boolean);
    const variantLine = variantPieces.join(' · ');

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

  // ============ FOOTER (free-shipping msg + zip + total + checkout) ============
  const subtotal = getSubtotalCents();
  const itemCount = getItemCount();
  const deliveryZip = getDeliveryZip();
  const info = shippingInfo(deliveryZip, subtotal);    // null if zip invalid
  const dirty = (deliveryZip || '').length > 0;

  const shippingCents = info ? info.rateCents : null;
  const totalCents = subtotal + (shippingCents || 0);
  const checkoutEnabled = info != null;

  footEl.innerHTML = `
    <div class="cart-subtotal">
      <span>Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})</span>
      <span class="cart-subtotal-amount">${formatPrice(subtotal)}</span>
    </div>

    <div id="cartFreeShipMsg" class="cart-free-ship-msg" hidden></div>

    <div class="cart-shipzip">
      <label for="zipInput" class="zip-label">Shipping ZIP</label>
      <input
        id="zipInput"
        type="text"
        inputmode="numeric"
        maxlength="5"
        value="${escapeHtml(deliveryZip)}"
        placeholder="94501"
        autocomplete="postal-code"
      />
      <div id="cartShipLine" class="cart-ship-line"></div>
    </div>

    <div class="cart-total-row">
      <span>Total</span>
      <span class="cart-total-amount" id="cartTotalAmount">${formatPrice(totalCents)}</span>
    </div>

    <button class="btn-primary cart-checkout" id="cartCheckoutBtn" ${checkoutEnabled ? '' : 'disabled'}>
      Checkout →
    </button>
  `;

  // Initial paint of contextual hints + free-shipping message
  paintShippingState(subtotal, deliveryZip, dirty);

  // Wire zip input — validate on every keystroke and persist silently
  // (setDeliveryZip doesn't notify, so the drawer doesn't re-render mid-typing
  // and steal focus). Visual feedback is updated in place.
  const zipInput = document.getElementById('zipInput');
  if (zipInput) {
    zipInput.addEventListener('input', e => {
      const value = (e.target.value || '').replace(/\D/g, '').slice(0, 5);
      if (value !== e.target.value) e.target.value = value;
      setDeliveryZip(value);
      paintShippingState(getSubtotalCents(), value, value.length > 0);
    });
  }

  // Read the button's *live* disabled state at click time, not the
  // closure value captured at render time.
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  checkoutBtn.addEventListener('click', () => {
    if (checkoutBtn.disabled) return;
    if (onCheckoutCallback) onCheckoutCallback();
  });
}

// Updates the contextual hint under the zip input, the free-shipping
// progress / achievement message above it, the total line, and the
// Checkout button's disabled state — all in place, without re-rendering
// the input itself (preserves focus while typing).
function paintShippingState(subtotalCents, zip, dirty) {
  const lineEl = document.getElementById('cartShipLine');
  const msgEl = document.getElementById('cartFreeShipMsg');
  const totalEl = document.getElementById('cartTotalAmount');
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  if (!lineEl || !msgEl || !totalEl || !checkoutBtn) return;

  const info = shippingInfo(zip, subtotalCents);

  // ------- Contextual line under the zip input -------
  lineEl.classList.remove('cart-ship-line-ok', 'cart-ship-line-warn');
  if (!info) {
    lineEl.textContent = dirty
      ? 'Enter a valid 5-digit US ZIP to see shipping cost.'
      : 'Enter your ZIP for shipping cost.';
    lineEl.classList.add('cart-ship-line-warn');
  } else if (info.isLocal) {
    lineEl.textContent = '✓ Free local pickup/delivery';
    lineEl.classList.add('cart-ship-line-ok');
  } else {
    const rate = info.rateCents === 0 ? 'FREE' : formatPrice(info.rateCents);
    lineEl.textContent = `Shipping (${info.tierLabel}): ${rate}`;
    if (info.rateCents === 0) lineEl.classList.add('cart-ship-line-ok');
  }

  // ------- Free-shipping progress / achievement banner -------
  const showMessage = !info || (info && !info.isLocal && info.eligibleForFreeShipping)
    || (!info && subtotalCents > 0);

  if (showMessage && (!info || info.eligibleForFreeShipping)) {
    if (info && info.freeShippingApplied) {
      msgEl.hidden = false;
      msgEl.className = 'cart-free-ship-msg cart-free-ship-achieved';
      msgEl.textContent = '🎉 You qualify for free shipping!';
    } else if (subtotalCents > 0 && subtotalCents < FREE_SHIPPING_THRESHOLD_CENTS) {
      msgEl.hidden = false;
      msgEl.className = 'cart-free-ship-msg cart-free-ship-progress';
      const away = FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents;
      msgEl.textContent = `${formatPrice(away)} more for free shipping ✨`;
    } else {
      msgEl.hidden = true;
      msgEl.textContent = '';
    }
  } else {
    // Hide for local zips (already free) and AK/HI (not eligible).
    msgEl.hidden = true;
    msgEl.textContent = '';
  }

  // ------- Total -------
  const shippingCents = info ? info.rateCents : 0;
  totalEl.textContent = formatPrice(subtotalCents + shippingCents);

  // ------- Checkout button -------
  checkoutBtn.disabled = info == null;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
