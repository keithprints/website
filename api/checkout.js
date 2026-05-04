// Vercel serverless function — POST /api/checkout
// Creates a Stripe Checkout session for a multi-item cart.
//
// Body: { items: [{ productId, color, customizationText, quantity }, ...] }
// Returns: { url } — Stripe-hosted checkout URL
//
// Server re-fetches every product using the service role to lock in
// price/cost snapshots. Client-supplied prices are ignored.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-10-28.acacia',
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_ITEMS = 20;
const MAX_QTY_PER_LINE = 25;
const STRIPE_METADATA_VALUE_LIMIT = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ error: `Too many items (max ${MAX_ITEMS}). Please split into separate orders.` });
    }
    for (const it of items) {
      if (!it || typeof it.productId !== 'string') {
        return res.status(400).json({ error: 'Invalid cart item: missing productId' });
      }
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
        return res.status(400).json({ error: `Invalid quantity for ${it.productId}` });
      }
    }

    // One round-trip for every referenced product.
    const ids = [...new Set(items.map(i => i.productId))];
    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, description, sale_price_cents, unit_cost_cents, image_url, active')
      .in('id', ids);
    if (error) {
      console.error('Supabase fetch error:', error);
      return res.status(500).json({ error: 'Could not load products' });
    }
    const byId = Object.fromEntries((products || []).map(p => [p.id, p]));

    const lineItems = [];
    const metaItems = [];
    for (const it of items) {
      const p = byId[it.productId];
      if (!p) {
        return res.status(404).json({ error: `Product not found: ${it.productId}` });
      }
      if (!p.active) {
        return res.status(400).json({ error: `Sorry, ${p.name} is no longer available.` });
      }

      const descParts = [];
      if (it.color) descParts.push(`Color: ${it.color}`);
      if (it.customizationText) descParts.push(`Custom: ${it.customizationText}`);
      const descLine = descParts.length ? ` — ${descParts.join(' · ')}` : '';

      lineItems.push({
        quantity: it.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: p.sale_price_cents,
          product_data: {
            name: p.name + descLine,
            description: p.description || undefined,
            images: p.image_url ? [p.image_url] : undefined,
          },
        },
      });

      // Single-letter keys keep the JSON well under Stripe's 500-char
      // metadata-value limit, even with long product names.
      metaItems.push({
        i: p.id,
        n: p.name,
        c: it.color || '',
        x: it.customizationText || '',
        q: it.quantity,
        p: p.sale_price_cents,
        u: p.unit_cost_cents,
      });
    }

    // Stripe metadata: max 50 keys, max 500 chars per value.
    // One key per item ("item_0", "item_1", ...) plus a count.
    const metadata = { item_count: String(metaItems.length) };
    for (let i = 0; i < metaItems.length; i++) {
      const json = JSON.stringify(metaItems[i]);
      if (json.length > STRIPE_METADATA_VALUE_LIMIT) {
        return res.status(400).json({
          error: `Item too complex: ${metaItems[i].n}. Please simplify or contact Keith.`,
        });
      }
      metadata[`item_${i}`] = json;
    }

    const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 350, currency: 'usd' },
            display_name: 'Standard shipping (3-5 days)',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
      ],
      metadata,
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message || 'Checkout failed' });
  }
}
