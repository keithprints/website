// Vercel serverless function — POST /api/checkout
// Creates a Stripe Checkout session for a single product.
//
// Body: { productId, color, customizationText }
// Returns: { url } — redirect target

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-10-28.acacia',
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productId, color, customizationText } = req.body || {};

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    // Fetch the product server-side using the service role.
    // We need unit_cost_cents for the order snapshot, which RLS hides from anon.
    const { data: product, error } = await supabase
      .from('products')
      .select('id, name, description, sale_price_cents, unit_cost_cents, image_url, active, customizable')
      .eq('id', productId)
      .single();

    if (error || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (!product.active) {
      return res.status(400).json({ error: 'Product is not available' });
    }

    // Build a description string for Stripe (also surfaces in the email)
    const descParts = [];
    if (color) descParts.push(`Color: ${color}`);
    if (customizationText) descParts.push(`Custom: ${customizationText}`);
    const descLine = descParts.length ? ` — ${descParts.join(' · ')}` : '';

    const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: product.sale_price_cents,
            product_data: {
              name: product.name + descLine,
              description: product.description || undefined,
              images: product.image_url ? [product.image_url] : undefined,
            },
          },
        },
      ],
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      // Flat-rate shipping. Adjust as needed.
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
      // Stash all the order details in metadata so the webhook can write them to the DB.
      metadata: {
        product_id: product.id,
        product_name: product.name,
        color: color || '',
        customization_text: customizationText || '',
        sale_price_cents: String(product.sale_price_cents),
        unit_cost_cents: String(product.unit_cost_cents),
      },
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message || 'Checkout failed' });
  }
}
