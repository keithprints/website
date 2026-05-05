// Public catalog reads the active shop color list. Loaded once at app
// init by main.js and shared across product modal renders.
//
// We filter active=true at the application layer because the same
// Supabase client may be authenticated (if the operator is signed
// into /admin in the same browser session). The authenticated RLS
// policy returns ALL rows; we never want inactive colors in the
// customer picker regardless of who's looking.

import { supabase } from './supabase.js';

export async function fetchShopColors() {
  const { data, error } = await supabase
    .from('shop_colors')
    .select('id, name, display_order, swatch_hex')
    .eq('active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch shop colors:', error);
    return [];
  }
  return data || [];
}
