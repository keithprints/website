// Admin product CRUD. The authenticated session is required for write
// operations and for reading inactive products (which RLS blocks for anon).

import { supabase } from '../lib/supabase.js';

const ALL_COLUMNS = `
  id, created_at, name, slug, description, details, category,
  image_url, gallery_urls, customizable, customization_label,
  customization_max_chars, sale_price_cents, unit_cost_cents,
  print_time_hours,
  multicolor_available, multicolor_sale_price_cents,
  multicolor_unit_cost_cents, multicolor_print_time_hours,
  multicolor_hint,
  active, featured, badge, display_order
`;

export async function listAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(ALL_COLUMNS)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select(ALL_COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .insert(toRow(product))
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, patch) {
  const { data, error } = await supabase
    .from('products')
    .update(toRow(patch))
    .eq('id', id)
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// Inline toggle helpers — used by the table's quick-action buttons.
export async function setActive(id, active) {
  return updateProduct(id, { active });
}
export async function setFeatured(id, featured) {
  return updateProduct(id, { featured });
}
export async function setBadge(id, badge) {
  return updateProduct(id, { badge: badge || null });
}

// Convert form values (strings, dollars) into the shape Postgres expects.
function toRow(input) {
  const out = { ...input };

  if ('sale_price_dollars' in out) {
    out.sale_price_cents = dollarsToCents(out.sale_price_dollars);
    delete out.sale_price_dollars;
  }
  if ('unit_cost_dollars' in out) {
    out.unit_cost_cents = dollarsToCents(out.unit_cost_dollars);
    delete out.unit_cost_dollars;
  }
  if ('multicolor_sale_price_dollars' in out) {
    const v = out.multicolor_sale_price_dollars;
    out.multicolor_sale_price_cents =
      v === '' || v == null ? null : dollarsToCents(v);
    delete out.multicolor_sale_price_dollars;
  }
  if ('multicolor_unit_cost_dollars' in out) {
    const v = out.multicolor_unit_cost_dollars;
    out.multicolor_unit_cost_cents =
      v === '' || v == null ? null : dollarsToCents(v);
    delete out.multicolor_unit_cost_dollars;
  }

  // Trim text fields; treat empty strings as null where the column is nullable.
  for (const key of ['description', 'details', 'image_url', 'customization_label', 'badge', 'multicolor_hint']) {
    if (key in out) {
      const v = (out[key] || '').toString().trim();
      out[key] = v.length === 0 ? null : v;
    }
  }

  // Slug normalization: lowercase, hyphens.
  if ('slug' in out && typeof out.slug === 'string') {
    out.slug = slugify(out.slug);
  }

  // gallery_urls is a newline-separated string from the hidden textarea.
  if ('gallery_urls' in out && !Array.isArray(out.gallery_urls)) {
    out.gallery_urls = splitLines(out.gallery_urls);
  }

  // Coerce numerics that came in as strings.
  for (const key of ['sale_price_cents', 'unit_cost_cents', 'customization_max_chars', 'display_order']) {
    if (key in out && out[key] !== null && out[key] !== '') {
      out[key] = Number(out[key]);
    }
  }
  for (const key of ['print_time_hours', 'multicolor_print_time_hours']) {
    if (key in out) {
      const v = out[key];
      out[key] = (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v);
    }
  }

  // Booleans default to false rather than coming through as 'on'/'off'.
  for (const key of ['active', 'featured', 'customizable', 'multicolor_available']) {
    if (key in out) out[key] = Boolean(out[key]);
  }

  // Enforce: multicolor toggle ON requires all 3 numeric fields.
  // (The DB has the same constraint as a fail-safe; this gives a
  // friendlier error message before round-tripping to Postgres.)
  if (out.multicolor_available) {
    const missing = [];
    if (out.multicolor_sale_price_cents == null) missing.push('multicolor sale price');
    if (out.multicolor_unit_cost_cents == null) missing.push('multicolor unit cost');
    if (out.multicolor_print_time_hours == null) missing.push('multicolor print time');
    if (missing.length > 0) {
      const err = new Error(`Multicolor is enabled but missing: ${missing.join(', ')}.`);
      err.code = 'multicolor_incomplete';
      throw err;
    }
  } else {
    // Toggle off — clear the dependent fields so they don't persist
    // stale values when toggled back on later.
    if ('multicolor_sale_price_cents' in out) out.multicolor_sale_price_cents = null;
    if ('multicolor_unit_cost_cents' in out) out.multicolor_unit_cost_cents = null;
    if ('multicolor_print_time_hours' in out) out.multicolor_print_time_hours = null;
    if ('multicolor_hint' in out && !out.multicolor_hint) out.multicolor_hint = null;
  }

  return out;
}

function dollarsToCents(value) {
  if (value === '' || value == null) return 0;
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

export function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}
