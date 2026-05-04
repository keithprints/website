import {
  getCart,
  getItemCount,
  getSubtotalCents,
  updateQuantity,
  removeItem,
  subscribe,
} from '../lib/cart.js';
import { formatPrice, categoryGradient } from '../lib/format.js';

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

  const subtotal = getSubtotalCents();
  const itemCount = getItemCount();
  footEl.innerHTML = `
    <div class="cart-subtotal">
      <span>Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})</span>
      <span class="cart-subtotal-amount">${formatPrice(subtotal)}</span>
    </div>
    <p class="cart-shipping-note">Shipping calculated at checkout · ships in about a week</p>
    <button class="btn-primary cart-checkout" id="cartCheckoutBtn">Checkout →</button>
  `;
  document.getElementById('cartCheckoutBtn').addEventListener('click', () => {
    if (onCheckoutCallback) onCheckoutCallback();
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
