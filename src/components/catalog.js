import { renderProductCard } from './productCard.js';

export function renderCatalog(state, onBuy) {
  const grid = document.getElementById('grid');
  const countEl = document.getElementById('catalogCount');

  if (state.loading) {
    grid.innerHTML = `<div class="product-empty"><span>⏳</span>Loading the shop…</div>`;
    countEl.textContent = '';
    return;
  }

  const filtered = state.products.filter(p => {
    const matchCat = state.activeCategory === 'all' || p.category === state.activeCategory;
    const matchSearch = !state.searchQuery
      || p.name.toLowerCase().includes(state.searchQuery)
      || (p.description || '').toLowerCase().includes(state.searchQuery);
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="product-empty"><span>🔍</span>No prints match that. Try a different search!</div>`;
    countEl.textContent = '0 things found — try a different search';
    return;
  }

  countEl.textContent = `${state.products.length} cool things and counting — picked, printed, and packed by Keith`;

  grid.innerHTML = filtered.map(renderProductCard).join('');

  // Wire up Buy buttons
  grid.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const product = state.products.find(p => p.id === btn.dataset.id);
      if (product) onBuy(product);
    });
  });
}
