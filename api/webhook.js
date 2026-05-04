// Vercel serverless function — POST /api/webhook
// Receives Stripe webhook events. We care about checkout.session.completed.
// On that event, write a parent `orders` row plus N `order_items` rows.
//
// Configure in Stripe Dashboard → Developers → Webhooks pointed at
// https://yourdomain.com/api/webhook with event checkout.session.completed.
//
// IMPORTANT: Vercel must NOT parse the body. We need the raw body for
// signature verification. The config below disables body parsing.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-10-28.acacia',
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};

      // Idempotency: if we've already written this session, skip.
      const { data: existing } = await supabase
        .from('orders')
        .select('id')
        .eq('stripe_session_id', session.id)
        .maybeSingle();

      if (existing) {
        console.log(`Order already exists for session ${session.id}, skipping`);
        return res.status(200).json({ received: true, duplicate: true });
      }

      // Reconstruct line items from metadata stashed by /api/checkout.
      const itemCount = parseInt(meta.item_count || '0', 10);
      const items = [];
      for (let i = 0; i < itemCount; i++) {
        const json = meta[`item_${i}`];
        if (!json) continue;
        try {
          items.push(JSON.parse(json));
        } catch (err) {
          console.error(`Failed to parse item_${i}:`, err);
        }
      }

      const subtotal = items.reduce((s, it) => s + (Number(it.p) || 0) * (Number(it.q) || 0), 0);
      const shippingCost = session.shipping_cost?.amount_total ?? 0;
      const total = session.amount_total ?? (subtotal + shippingCost);

      // Stripe occasionally moves the address payload; check both shapes.
      const shippingAddress =
        session.shipping_details?.address ||
        session.collected_information?.shipping_details?.address ||
        null;

      const orderRow = {
        stripe_session_id: session.id,
        customer_email: session.customer_details?.email || null,
        customer_name: session.customer_details?.name || null,
        shipping_address: shippingAddress,
        delivery_method: meta.delivery_method || 'shipping',
        subtotal_cents: subtotal,
        shipping_cents: shippingCost,
        total_cents: total,
        status: 'new',
      };

      const { data: orderInsert, error: orderErr } = await supabase
        .from('orders')
        .insert(orderRow)
        .select('id')
        .single();

      if (orderErr || !orderInsert) {
        console.error('Failed to insert order:', orderErr);
        return res.status(500).json({ error: 'Database insert failed' });
      }

      if (items.length > 0) {
        const itemRows = items.map(it => ({
          order_id: orderInsert.id,
          product_id: it.i || null,
          product_name: it.n || 'Unknown',
          color: it.c || null,
          customization_text: it.x || null,
          quantity: Number(it.q) || 1,
          sale_price_cents: Number(it.p) || 0,
          unit_cost_cents: Number(it.u) || 0,
        }));
        const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
        if (itemsErr) {
          console.error('Failed to insert order_items:', itemsErr);
          return res.status(500).json({ error: 'Database insert failed for items' });
        }
      }

      console.log(`Order ${orderInsert.id} recorded — ${items.length} items, total ${total}c`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message || 'Handler failed' });
  }
}
