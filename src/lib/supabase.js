import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Missing Supabase env vars. Check .env.local');
}

export const supabase = createClient(url, anonKey);

// Public catalog query — explicitly excludes unit_cost_cents.
// RLS also blocks anon from getting more than active products,
// but this is defense-in-depth.
export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, description, details, category, image_url, gallery_urls, colors, customizable, customization_label, customization_max_chars, sale_price_cents, print_time_hours, featured, badge, display_order')
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Failed to fetch products:', error);
    return [];
  }
  return data || [];
}
