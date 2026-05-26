import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing Supabase env vars. Check .env.local');
}

export const supabase = createClient(url, anonKey);

// Public catalog query — explicitly excludes unit_cost_cents (and
// multicolor_unit_cost_cents). Migration 005 installs column-level
// grants that block anon from selecting the cost fields even via a
// direct REST call, so this allow-list is defense-in-depth.
//
// Per-product `colors` is gone; customer-facing color picker reads
// from shop_colors instead (see src/lib/shopColors.js).
export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, name, slug, description, details, category,
      image_url, gallery_urls,
      customizable, customization_label, customization_max_chars,
      sale_price_cents,
      multicolor_available, multicolor_sale_price_cents, multicolor_hint,
      featured, badge, display_order
    `)
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
  return data || [];
}
