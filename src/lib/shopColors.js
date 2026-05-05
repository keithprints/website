// Public catalog reads the active shop color list. Loaded once at app
// init by main.js and shared across product modal renders.

import { supabase } from './supabase.js';

export async function fetchShopColors() {
  const { data, error } = await supabase
    .from('shop_colors')
    .select('id, name, display_order, swatch_hex')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch shop colors:', error);
    return [];
  }
  return data || [];
}
