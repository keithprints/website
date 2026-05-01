// Vercel serverless function — POST /api/webhook
// Receives Stripe webhook events. We care about checkout.session.completed.
// On that event, write a row to the orders table.
//
// This MUST be configured in Stripe Dashboard → Developers → Webhooks
// pointed at https://yourdomain.com/api/webhook
// Subscribed events: checkout.session.completed
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

// Helper: read the raw body from the incoming request
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

      const orderRow = {
        stripe_session_id: session.id,
        product_id: meta.product_id || null,
        product_name: meta.product_name || 'Unknown',
        color: meta.color || null,
        customization_text: meta.customization_text || null,
        sale_price_cents: parseInt(meta.sale_price_cents || '0', 10),
        unit_cost_cents: parseInt(meta.unit_cost_cents || '0', 10),
        customer_email: session.customer_details?.email || null,
        customer_name: session.customer_details?.name || null,
        shipping_address: session.shipping_details?.address || null,
        status: 'new',
      };

      const { error: insertError } = await supabase.from('orders').insert(orderRow);
      if (insertError) {
        console.error('Failed to insert order:', insertError);
        return res.status(500).json({ error: 'Database insert failed' });
      }

      console.log(`Order recorded: ${session.id} — ${orderRow.product_name}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message || 'Handler failed' });
  }
}
