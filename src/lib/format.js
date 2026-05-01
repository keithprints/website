export function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatPriceParts(cents) {
  const dollars = Math.floor(cents / 100);
  const change = (cents % 100).toString().padStart(2, '0');
  return { dollars, change };
}

const CATEGORY_LABELS = {
  keychains: 'Keychain',
  fidgets: 'Fidget',
  figurines: 'Figurine',
  ornaments: 'Ornament',
  more: '& More',
};

export function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

const CATEGORY_GRADIENTS = {
  keychains: 'linear-gradient(135deg, #1E90FF 0%, #4FB3FF 60%, #8FD3FF 100%)',
  fidgets: 'linear-gradient(135deg, #2BD566 0%, #79E89A 100%)',
  figurines: 'linear-gradient(135deg, #FF6B35 0%, #FFB084 100%)',
  ornaments: 'linear-gradient(135deg, #9D4EDD 0%, #C490F0 100%)',
  more: 'linear-gradient(135deg, #FF2E93 0%, #FF82B8 100%)',
};

export function categoryGradient(cat) {
  return CATEGORY_GRADIENTS[cat] || CATEGORY_GRADIENTS.more;
}
