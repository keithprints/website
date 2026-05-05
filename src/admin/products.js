// Admin product CRUD. The authenticated session is required for write
// operations and for reading inactive products (which RLS blocks for anon).

import { supabase } from '../lib/supabase.js';

const ALL_COLUMNS = `
  id, created_at, name, slug, description, details, category,
  image_url, gallery_urls, colors, customizable, customization_label,
  customization_max_chars, sale_price_cents, unit_cost_cents,
  print_time_hours, active, featured, badge, display_order
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

// Convert form values (strings, dollars, comma-separated colors) into the
// shape Postgres expects.
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

  // Trim text fields; treat empty strings as null where the column is nullable.
  for (const key of ['description', 'details', 'image_url', 'customization_label', 'badge']) {
    if (key in out) {
      const v = (out[key] || '').toString().trim();
      out[key] = v.length === 0 ? null : v;
    }
  }

  // Slug normalization: lowercase, hyphens.
  if ('slug' in out && typeof out.slug === 'string') {
    out.slug = slugify(out.slug);
  }

  // gallery_urls and colors come from textarea/string — convert if needed.
  if ('gallery_urls' in out && !Array.isArray(out.gallery_urls)) {
    out.gallery_urls = splitLines(out.gallery_urls);
  }
  if ('colors' in out && !Array.isArray(out.colors)) {
    out.colors = splitCsv(out.colors);
  }

  // Coerce numerics that came in as strings.
  for (const key of ['sale_price_cents', 'unit_cost_cents', 'customization_max_chars', 'display_order']) {
    if (key in out && out[key] !== null && out[key] !== '') {
      out[key] = Number(out[key]);
    }
  }
  if ('print_time_hours' in out && out.print_time_hours !== null && out.print_time_hours !== '') {
    out.print_time_hours = Number(out.print_time_hours);
  } else if ('print_time_hours' in out) {
    out.print_time_hours = null;
  }

  // Booleans default to false rather than coming through as 'on'/'off'.
  for (const key of ['active', 'featured', 'customizable']) {
    if (key in out) out[key] = Boolean(out[key]);
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

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}
