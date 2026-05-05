// Admin CRUD on shop_colors. Authenticated AAL2 sessions only —
// migration 007 enforces that at the RLS layer.

import { supabase } from '../lib/supabase.js';

const ALL_COLUMNS = 'id, created_at, name, display_order, active, swatch_hex';

export async function listAllShopColors() {
  const { data, error } = await supabase
    .from('shop_colors')
    .select(ALL_COLUMNS)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createShopColor(input) {
  const { data, error } = await supabase
    .from('shop_colors')
    .insert(toRow(input))
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateShopColor(id, patch) {
  const { data, error } = await supabase
    .from('shop_colors')
    .update(toRow(patch))
    .eq('id', id)
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShopColor(id) {
  const { error } = await supabase.from('shop_colors').delete().eq('id', id);
  if (error) throw error;
}

export async function setShopColorActive(id, active) {
  return updateShopColor(id, { active });
}

function toRow(input) {
  const out = { ...input };

  if ('name' in out) {
    out.name = (out.name || '').toString().trim();
  }
  if ('swatch_hex' in out) {
    const v = (out.swatch_hex || '').toString().trim();
    out.swatch_hex = v.length === 0 ? null : v;
  }
  if ('display_order' in out && out.display_order !== '' && out.display_order != null) {
    out.display_order = Number(out.display_order);
  }
  if ('active' in out) {
    out.active = Boolean(out.active);
  }

  return out;
}
