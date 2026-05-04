import { formatPriceParts, categoryLabel, categoryGradient } from '../lib/format.js';

// Category-based emoji fallback if image_url is missing
const CATEGORY_EMOJI = {
  keychains: '🔑',
  fidgets: '🌀',
  figurines: '🎭',
  ornaments: '✨',
  more: '🎁',
};

export function renderProductCard(p) {
  const { dollars, change } = formatPriceParts(p.sale_price_cents);
  const badgeHtml = p.badge
    ? `<div class="product-badge badge-${p.badge}">${p.badge === 'new' ? '✨ NEW' : p.badge === 'hot' ? '🔥 HOT' : '⭐ FAV'}</div>`
    : '';

  const imageHtml = p.image_url
    ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy" />`
    : `<div class="emoji">${CATEGORY_EMOJI[p.category] || '🎁'}</div>`;

  return `
    <article class="product" data-id="${p.id}" data-cat="${p.category}" tabindex="0" role="button" aria-label="View ${escapeHtml(p.name)} details">
      ${badgeHtml}
      <div class="product-img" style="background:${categoryGradient(p.category)}">${imageHtml}</div>
      <div class="product-body">
        <div class="product-cat">${categoryLabel(p.category)}</div>
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        <p class="product-desc">${escapeHtml(p.description || '')}</p>
        <div class="product-foot">
          <div class="product-price">$${dollars}<span class="cents">.${change}</span></div>
          <span class="buy-btn" data-id="${p.id}">
            ADD TO CART
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </span>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
