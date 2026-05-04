// Cart state — single source of truth, persisted to localStorage.
// Subscribers (cart drawer, nav badge) get notified on every change.

const STORAGE_KEY = 'kp_cart_v1';
const subscribers = new Set();

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(i =>
      i && typeof i === 'object' &&
      typeof i.productId === 'string' &&
      typeof i.priceCents === 'number' &&
      typeof i.quantity === 'number' && i.quantity > 0
    );
  } catch {
    return [];
  }
}

let cart = loadCart();

function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (err) {
    console.warn('Failed to persist cart', err);
  }
  notify();
}

function notify() {
  for (const fn of subscribers) {
    try { fn(getCart()); } catch (err) { console.error('cart subscriber error', err); }
  }
}

function lineKey(productId, color, customizationText) {
  return `${productId}::${color || ''}::${customizationText || ''}`;
}

export function getCart() {
  return cart.map(i => ({ ...i }));
}

export function getItemCount() {
  return cart.reduce((s, i) => s + i.quantity, 0);
}

export function getSubtotalCents() {
  return cart.reduce((s, i) => s + i.priceCents * i.quantity, 0);
}

export function addItem({ product, color = null, customizationText = null, quantity = 1 }) {
  const key = lineKey(product.id, color, customizationText);
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      key,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productImageUrl: product.image_url || null,
      color: color || null,
      customizationText: customizationText || null,
      priceCents: product.sale_price_cents,
      quantity,
    });
  }
  saveCart();
}

export function updateQuantity(key, quantity) {
  if (quantity <= 0) {
    removeItem(key);
    return;
  }
  const item = cart.find(i => i.key === key);
  if (item) {
    item.quantity = quantity;
    saveCart();
  }
}

export function removeItem(key) {
  const idx = cart.findIndex(i => i.key === key);
  if (idx >= 0) {
    cart.splice(idx, 1);
    saveCart();
  }
}

export function clearCart() {
  cart = [];
  saveCart();
}

export function subscribe(fn) {
  subscribers.add(fn);
  // Fire immediately so the subscriber can render its initial state.
  try { fn(getCart()); } catch (err) { console.error('cart subscriber error', err); }
  return () => subscribers.delete(fn);
}
