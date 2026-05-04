// Cart state — single source of truth, persisted to localStorage.
// Subscribers (cart drawer, nav badge) get notified on every change.
//
// Stored shape:
//   { items: [...], deliveryMethod: 'shipping' | 'local', deliveryZip: '...' }
//
// A previous version stored just the items array directly; loadState handles
// that legacy shape so anyone with an existing localStorage cart doesn't
// silently lose it on the next page load.

const STORAGE_KEY = 'kp_cart_v1';
const subscribers = new Set();

function defaultState() {
  return { items: [], deliveryMethod: 'shipping', deliveryZip: '' };
}

function isValidItem(i) {
  return i && typeof i === 'object' &&
    typeof i.productId === 'string' &&
    typeof i.priceCents === 'number' &&
    typeof i.quantity === 'number' && i.quantity > 0;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    // Legacy: array of items (pre-delivery-method version).
    if (Array.isArray(parsed)) {
      return { ...defaultState(), items: parsed.filter(isValidItem) };
    }

    if (parsed && typeof parsed === 'object') {
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

function lineKey(productId, color, customizationText) {
  return `${productId}::${color || ''}::${customizationText || ''}`;
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
  if (next === state.deliveryZip) return;
  state.deliveryZip = next;
  // Persist without notifying. The zip input is the authoritative source of
  // its own value during typing; firing subscribers here would re-render the
  // drawer footer mid-keystroke and steal focus from the input.
  persist();
}

export function addItem({ product, color = null, customizationText = null, quantity = 1 }) {
  const key = lineKey(product.id, color, customizationText);
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
      color: color || null,
      customizationText: customizationText || null,
      priceCents: product.sale_price_cents,
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
