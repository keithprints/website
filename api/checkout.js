// Vercel serverless function — POST /api/checkout
// Creates a Stripe Checkout session for a multi-item cart.
//
// Body: {
//   items: [{ productId, variant: 'single' | 'multi',
//             color, customizationText, quantity }, ...],
//   deliveryMethod: 'shipping' | 'local',
//   deliveryZip: '94501'   // required when deliveryMethod === 'local'
// }
// Returns: { url } — Stripe-hosted checkout URL
//
// Server re-fetches every product using the service role to lock in
// price/cost snapshots. Client-supplied prices are ignored. The local
// delivery zip is re-validated server-side (don't trust the client).
//
// Variant-aware pricing: 'multi' uses multicolor_sale_price_cents and
// multicolor_unit_cost_cents. The DB constraint products_multicolor_complete
// guarantees those fields are non-null when multicolor_available is true,
// but we belt-and-suspender check here too.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isLocalDeliveryZip, localDeliveryZipList } from '../src/lib/delivery.js';

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
const STANDARD_SHIPPING_CENTS = 350;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail loud and early on misconfiguration rather than producing
  // mysterious 500s mid-checkout. Required env vars must all be set.
  const missing = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!process.env.SITE_URL) missing.push('SITE_URL');
  if (missing.length > 0) {
    console.error('Checkout misconfigured — missing env vars:', missing.join(', '));
    return res.status(500).json({ error: 'Service misconfigured' });
  }

  try {
    const { items, deliveryMethod, deliveryZip } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (items.length > MAX_ITEMS) {
      return res.status(400).json({ error: `Too many items (max ${MAX_ITEMS}). Please split into separate orders.` });
    }
    for (const it of items) {
      if (!it || typeof it.productId !== 'string') {
        return res.status(400).json({ error: 'Invalid cart item' });
      }
      const qty = Number(it.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
        return res.status(400).json({ error: 'Invalid quantity in cart' });
      }
    }

    // Validate delivery method (default to shipping if missing/unknown).
    const method = deliveryMethod === 'local' ? 'local' : 'shipping';
    if (method === 'local' && !isLocalDeliveryZip(deliveryZip)) {
      return res.status(400).json({
        error: `Local delivery is only available for ZIPs: ${localDeliveryZipList().join(', ')}.`,
      });
    }

    // One round-trip for every referenced product.
    const ids = [...new Set(items.map(i => i.productId))];
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, name, description, image_url, active,
        sale_price_cents, unit_cost_cents,
        multicolor_available, multicolor_sale_price_cents, multicolor_unit_cost_cents
      `)
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
        // Don't echo the client-supplied id back into the error message —
        // it gets rendered in a toast on the public site and would be a
        // self-XSS vector if the client controlled it.
        return res.status(404).json({ error: 'One or more items are no longer available.' });
      }
      if (!p.active) {
        return res.status(400).json({ error: 'One or more items are no longer available.' });
      }

      // Variant + variant-specific pricing
      const variant = it.variant === 'multi' ? 'multi' : 'single';
      if (variant === 'multi' && !p.multicolor_available) {
        return res.status(400).json({ error: 'One or more items are not available in multicolor.' });
      }
      const unitAmount = variant === 'multi' ? p.multicolor_sale_price_cents : p.sale_price_cents;
      const unitCost = variant === 'multi' ? p.multicolor_unit_cost_cents : p.unit_cost_cents;
      if (variant === 'multi' && (unitAmount == null || unitCost == null)) {
        // DB constraint should prevent this, but if it slipped through:
        console.error('Multicolor pricing missing for product', p.id);
        return res.status(500).json({ error: 'Pricing configuration error. Please contact us.' });
      }

      const descParts = [];
      if (variant === 'multi') {
        descParts.push('Multicolor');
        if (it.color) descParts.push(it.color);
      } else if (it.color) {
        descParts.push(`Color: ${it.color}`);
      }
      if (it.customizationText) descParts.push(`Custom: ${it.customizationText}`);
      const descLine = descParts.length ? ` — ${descParts.join(' · ')}` : '';

      lineItems.push({
        quantity: it.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: p.name + descLine,
            description: p.description || undefined,
            images: p.image_url ? [p.image_url] : undefined,
          },
        },
      });

      // Single-letter keys keep the JSON well under Stripe's 500-char
      // metadata-value limit, even with long product names.
      // `v` carries variant; `c` is color or multicolor description per `v`.
      metaItems.push({
        i: p.id,
        n: p.name,
        v: variant,
        c: it.color || '',
        x: it.customizationText || '',
        q: it.quantity,
        p: unitAmount,
        u: unitCost,
      });
    }

    // Stripe metadata: max 50 keys, max 500 chars per value.
    // One key per item ("item_0", "item_1", ...) plus a count + delivery info.
    const metadata = {
      item_count: String(metaItems.length),
      delivery_method: method,
      delivery_zip: method === 'local' ? deliveryZip.trim() : '',
    };
    for (let i = 0; i < metaItems.length; i++) {
      const json = JSON.stringify(metaItems[i]);
      if (json.length > STRIPE_METADATA_VALUE_LIMIT) {
        return res.status(400).json({
          error: 'One or more items have customizations that are too long. Please shorten or contact us.',
        });
      }
      metadata[`item_${i}`] = json;
    }

    // Build shipping options based on the chosen delivery method.
    const shippingOptions = method === 'local'
      ? [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: 0, currency: 'usd' },
              display_name: 'Free local pickup/delivery',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 1 },
                maximum: { unit: 'business_day', value: 5 },
              },
            },
          },
        ]
      : [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              fixed_amount: { amount: STANDARD_SHIPPING_CENTS, currency: 'usd' },
              display_name: 'Standard shipping (3-5 days)',
              delivery_estimate: {
                minimum: { unit: 'business_day', value: 3 },
                maximum: { unit: 'business_day', value: 7 },
              },
            },
          },
        ];

    // Don't fall back to req.headers.host — it's attacker-controllable in
    // some proxy configurations, and we'd happily redirect Stripe success
    // /cancel to the spoofed host. SITE_URL is required (validated above).
    // Also normalize: trim whitespace and strip trailing slashes so we
    // don't end up with `https://example.com//?checkout=success`.
    const siteUrl = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(siteUrl)) {
      console.error('SITE_URL is not a valid URL. Got:', JSON.stringify(process.env.SITE_URL));
      return res.status(500).json({ error: 'Service misconfigured' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: shippingOptions,
      metadata,
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    // Generic message for the client; full detail goes to server logs only.
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
}
