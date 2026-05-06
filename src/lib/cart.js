// Cart state — single source of truth, persisted to localStorage.
// Subscribers (cart drawer, nav badge) get notified on every change.
//
// Stored shape (v2):
//   {
//     items: [{ key, productId, productName, productCategory,
//               productImageUrl, variant: 'single' | 'multi',
//               color, customizationText, priceCents, quantity }, ...],
//     deliveryMethod: 'shipping' | 'local',
//     deliveryZip: '...'
//   }
//
// `color` carries either the chosen color name (variant: 'single') or
// the customer's free-text multicolor description (variant: 'multi').
//
// Bumped storage key from kp_cart_v1 → kp_cart_v2 because the item shape
// changed (added `variant`); old carts from before the color refactor
// are silently dropped on first read.

const STORAGE_KEY = 'kp_cart_v2';
const LEGACY_STORAGE_KEYS = ['kp_cart_v1'];
const subscribers = new Set();

function defaultState() {
  return { items: [], deliveryMethod: 'shipping', deliveryZip: '' };
}

function isValidItem(i) {
  return i && typeof i === 'object' &&
    typeof i.productId === 'string' &&
    typeof i.priceCents === 'number' &&
    typeof i.quantity === 'number' && i.quantity > 0 &&
    (i.variant === 'single' || i.variant === 'multi');
}

function loadState() {
  // Drop any legacy cart payloads — schema change makes them stale.
  for (const k of LEGACY_STORAGE_KEYS) {
    try { localStorage.removeItem(k); } catch (_) {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const items = Array.isArray(parsed.items) ? parsed.items.filter(isValidItem) : [];
      const deliveryMethod = parsed.deliveryMethod === 'local' ? 'local' : 'shipping';
      const deliveryZip = typeof parsed.deliveryZip === 'string' ? parsed.deliveryZip : '';
      return { items, deliveryMethod, deliveryZip };
    }

    return defaultState();
  } catch {
    return defaultState();
  }
}

let state = loadState();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Failed to persist cart', err);
  }
}

function save() {
  persist();
  notify();
}

function notify() {
  for (const fn of subscribers) {
    try { fn(getCart()); } catch (err) { console.error('cart subscriber error', err); }
  }
}

function lineKey(productId, variant, color, customizationText) {
  return `${productId}::${variant}::${color || ''}::${customizationText || ''}`;
}

export function getCart() {
  return state.items.map(i => ({ ...i }));
}

export function getItemCount() {
  return state.items.reduce((s, i) => s + i.quantity, 0);
}

export function getSubtotalCents() {
  return state.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
}

export function getDeliveryMethod() {
  return state.deliveryMethod;
}

export function getDeliveryZip() {
  return state.deliveryZip;
}

export function setDeliveryMethod(method) {
  const next = method === 'local' ? 'local' : 'shipping';
  if (next === state.deliveryMethod) return;
  state.deliveryMethod = next;
  save();
}

export function setDeliveryZip(zip) {
  const next = (typeof zip === 'string' ? zip : '').trim();
  // Derive deliveryMethod from zip — local zips are pickup/delivery,
  // anything else is shipping. Drawer no longer exposes a manual radio
  // so this is the single source of truth.
  const isLocal = next === '94501' || next === '94502';
  const nextMethod = isLocal ? 'local' : 'shipping';
  if (next === state.deliveryZip && nextMethod === state.deliveryMethod) return;
  state.deliveryZip = next;
  state.deliveryMethod = nextMethod;
  // Persist without notifying. The zip input is the authoritative source of
  // its own value during typing; firing subscribers here would re-render the
  // drawer footer mid-keystroke and steal focus from the input.
  persist();
}

export function addItem({ product, variant = 'single', color = null, customizationText = null, quantity = 1 }) {
  const v = variant === 'multi' ? 'multi' : 'single';
  // Server is authoritative on price; this is for display only. Pick the
  // matching variant's price to avoid showing the wrong subtotal.
  const priceCents = v === 'multi'
    ? (product.multicolor_sale_price_cents ?? product.sale_price_cents)
    : product.sale_price_cents;

  const key = lineKey(product.id, v, color, customizationText);
  const existing = state.items.find(i => i.key === key);
  if (existing) {
    existing.quantity += quantity;
  } else {
    state.items.push({
      key,
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      productImageUrl: product.image_url || null,
      variant: v,
      color: color || null,
      customizationText: customizationText || null,
      priceCents,
      quantity,
    });
  }
  save();
}

export function updateQuantity(key, quantity) {
  if (quantity <= 0) {
    removeItem(key);
    return;
  }
  const item = state.items.find(i => i.key === key);
  if (item) {
    item.quantity = quantity;
    save();
  }
}

export function removeItem(key) {
  const idx = state.items.findIndex(i => i.key === key);
  if (idx >= 0) {
    state.items.splice(idx, 1);
    save();
  }
}

export function clearCart() {
  state = defaultState();
  save();
}

export function subscribe(fn) {
  subscribers.add(fn);
  // Fire immediately so the subscriber can render its initial state.
  try { fn(getCart()); } catch (err) { console.error('cart subscriber error', err); }
  return () => subscribers.delete(fn);
}
