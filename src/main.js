import { fetchProducts } from './lib/supabase.js';
import { fetchShopColors } from './lib/shopColors.js';
import { renderCatalog } from './components/catalog.js';
import { openProductModal } from './components/productModal.js';
import {
  mountCartDrawer,
  openCartDrawer,
} from './components/cartDrawer.js';
import {
  addItem,
  getCart,
  getItemCount,
  clearCart,
  subscribe as subscribeCart,
  getDeliveryMethod,
  getDeliveryZip,
} from './lib/cart.js';

// ============ APP STATE ============
const state = {
  products: [],
  shopColors: [],
  activeCategory: 'all',
  searchQuery: '',
  loading: true,
};

// ============ INITIAL RENDER ============
function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <nav class="nav">
      <div class="nav-inner">
        <a href="#top" class="nav-logo">
          <span class="logo-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 7L12 3L20 7V17L12 21L4 17V7Z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
              <path d="M4 7L12 11M12 11L20 7M12 11V21" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
            </svg>
          </span>
          Keith<b>Prints</b>
        </a>
        <ul class="nav-links">
          <li><a href="#shop">Shop</a></li>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#about">About Keith Prints</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
        <button class="cart-btn" id="cartBtn" aria-label="Open cart">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
          <span class="cart-count" id="cartCount" data-empty="true">0</span>
        </button>
      </div>
    </nav>

    <section class="hero" id="top">
      <div class="hero-banner">
        <img src="/banner.jpg" alt="Keith Prints — cool things, 3D printed, just for you" />
        <div class="hero-stickers">
          <div class="sticker sticker-new">⚡ MADE TO ORDER</div>
          <div class="sticker sticker-ship">🚀 SHIPS IN A WEEK</div>
        </div>
      </div>
      <div class="marquee">
        <div class="marquee-track" id="marqueeTrack"></div>
      </div>
    </section>

    <section class="intro" id="about">
      <div class="intro-card">
        <h3>Cool things. 3D printed. Just for you.</h3>
        <p>Keith Prints is a small 3D printing shop in Alameda, California. No factories, no boring corporate stuff. Every keychain, fidget, figurine, and ornament on this site is printed on a single 3D printer — named Keith, because of course it has a name.</p>
        <p>Pick something, we'll print it for you, and it shows up at your door in about a week. Easy.</p>
      </div>
      <div class="intro-headline">
        <h2>Print stuff. <em>Trade stuff.</em><br><span class="hl">Show off</span> at school.</h2>
        <p>From keychains for your backpack to fidgets for math class, every piece is hand-printed and ready to be your new favorite thing. Pick a color, click a button, done.</p>
      </div>
    </section>

    <section class="catalog" id="shop">
      <div class="catalog-head">
        <h2>The Shop
          <small id="catalogCount">Loading…</small>
        </h2>
        <div class="search">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input id="searchInput" type="text" placeholder="Search dragons, fidgets..." autocomplete="off" />
        </div>
      </div>

      <div class="pills" id="pills">
        <button class="pill active" data-cat="all"><span class="dot-icon"></span> Everything</button>
        <button class="pill" data-cat="keychains"><span class="dot-icon"></span> Keychains</button>
        <button class="pill" data-cat="fidgets"><span class="dot-icon"></span> Fidgets</button>
        <button class="pill" data-cat="figurines"><span class="dot-icon"></span> Figurines</button>
        <button class="pill" data-cat="ornaments"><span class="dot-icon"></span> Ornaments</button>
        <button class="pill" data-cat="more"><span class="dot-icon"></span> & More</button>
      </div>

      <div class="grid" id="grid"></div>
    </section>

    <section class="how" id="how">
      <div class="how-inner">
        <div class="how-head">
          <span class="kicker">HOW IT WORKS</span>
          <h2>Three steps, <em>then it's yours.</em></h2>
          <p>No subscriptions, no weird sign-ups. Just a couple of kids, a printer, and the thing you ordered.</p>
        </div>
        <div class="steps">
          <div class="step">
            <span class="step-num">01</span>
            <h3>Pick Your Print</h3>
            <p>Browse the shop. Pick a color. Add it to your cart and check out securely with Stripe.</p>
          </div>
          <div class="step">
            <span class="step-num">02</span>
            <h3>We Print It</h3>
            <p>We get the order, fire up the printer, and start making your stuff. Most prints take 4-12 hours and ship soon after.</p>
          </div>
          <div class="step">
            <span class="step-num">03</span>
            <h3>It Lands At Your Door</h3>
            <p>We package it up with a little thank-you note and ship it. You'll have it within a week. Bam.</p>
          </div>
        </div>
      </div>
    </section>

    <footer id="contact">
      <div class="foot-inner">
        <img class="foot-logo" src="/logo.png" alt="Keith Prints" />
        <a class="foot-email-btn" href="mailto:keithprints3d@gmail.com">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
          <span>Email Keith Prints</span>
        </a>
        <div class="foot-links">
          <a href="#shop">Shop</a>
          <a href="#how">How It Works</a>
          <a href="#about">About</a>
        </div>
        <div class="foot-bottom">
          © 2026 Keith Prints
        </div>
      </div>
    </footer>
  `;

  // Marquee
  renderMarquee();

  // Wire up category pills
  document.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      state.activeCategory = p.dataset.cat;
      renderCatalog(state, handleProductOpen);
    });
  });

  // Wire up search
  document.getElementById('searchInput').addEventListener('input', e => {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderCatalog(state, handleProductOpen);
  });

  // Cart icon → open drawer
  document.getElementById('cartBtn').addEventListener('click', openCartDrawer);

  // Keep the cart-count badge in sync with cart state.
  subscribeCart(() => {
    const el = document.getElementById('cartCount');
    if (!el) return;
    const count = getItemCount();
    el.textContent = String(count);
    el.dataset.empty = count === 0 ? 'true' : 'false';
  });
}

function renderMarquee() {
  const items = [
    '⚡ MADE TO ORDER',
    '🎨 PICK YOUR COLOR',
    '📦 SHIPS IN A WEEK',
    '🏠 PRINTED IN ALAMEDA, CA',
    '💯 KID-RUN, KID-APPROVED',
    '🚀 NEW DROPS EVERY MONTH',
  ];
  const single = items.map(i => `<span><span class="dot">◆</span>${i}</span>`).join('');
  document.getElementById('marqueeTrack').innerHTML = single + single;
}

// ============ PRODUCT INTERACTION ============
// Card click → product detail modal → "Add to Cart" puts the item in
// the cart with the picked color/customization. The cart drawer is the
// single path to checkout.
function handleProductOpen(product) {
  openProductModal(product, state.shopColors, (selection) => {
    const qty = Math.max(1, parseInt(selection.quantity, 10) || 1);
    addItem({
      product,
      variant: selection.variant,
      color: selection.color,
      customizationText: selection.customizationText,
      quantity: qty,
    });
    const label = qty === 1 ? 'Added to cart' : `Added ${qty} to cart`;
    showToast(label, '✓');
  });
}

// ============ CHECKOUT ============
async function handleCheckout() {
  const cart = getCart();
  if (cart.length === 0) return;
  try {
    showToast('Redirecting to checkout…', '🚀');
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(i => ({
          productId: i.productId,
          variant: i.variant || 'single',
          color: i.color,
          customizationText: i.customizationText,
          quantity: i.quantity,
        })),
        deliveryMethod: getDeliveryMethod(),
        deliveryZip: getDeliveryZip(),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Checkout failed');
    }
    const { url } = await res.json();
    window.location.href = url;
  } catch (err) {
    console.error(err);
    showToast(`Couldn't start checkout: ${err.message}`, '⚠️');
  }
}

// ============ TOAST ============
// Build the toast with createElement + textContent rather than
// interpolating into innerHTML — `msg` can carry server error text
// that originally came from a client-supplied id, so we treat it as
// untrusted by default.
let toastTimeout;
export function showToast(msg, emoji = '✨') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = 'toast show';

  const emojiSpan = document.createElement('span');
  emojiSpan.className = 'toast-emoji';
  emojiSpan.textContent = emoji;
  toast.appendChild(emojiSpan);

  const msgSpan = document.createElement('span');
  msgSpan.textContent = msg;
  toast.appendChild(msgSpan);

  root.appendChild(toast);

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { root.innerHTML = ''; }, 400);
  }, 2800);
}

// ============ THANK YOU PAGE HANDLING ============
function checkThankYou() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    clearCart();
    setTimeout(() => {
      showToast(`Order placed! Keith is firing up the printer 🎉`, '✓');
    }, 500);
    window.history.replaceState({}, '', window.location.pathname);
  } else if (params.get('checkout') === 'cancelled') {
    setTimeout(() => {
      showToast('No worries — your cart is safe.', '👋');
    }, 500);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ============ INIT ============
async function init() {
  renderShell();
  mountCartDrawer({ onCheckout: handleCheckout });
  // Fetch products + shop colors in parallel — both feed the catalog
  // and product detail modal.
  const [products, shopColors] = await Promise.all([
    fetchProducts(),
    fetchShopColors(),
  ]);
  state.products = products;
  state.shopColors = shopColors;
  state.loading = false;
  renderCatalog(state, handleProductOpen);
  checkThankYou();
}

init();
