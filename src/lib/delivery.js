// Shipping zone calculation, shared between the public site (cart
// drawer + product modal) and the server (api/checkout.js). Single
// source of truth so client display matches what Stripe will charge.
//
// Four tiers, ordered roughly by distance from origin (Alameda, CA):
//
//   local       — 94501, 94502 (free pickup/delivery, no charge)
//   california  — rest of CA (still cheap to ship)
//   continental — anywhere else in the contiguous 48
//   ak_hi       — Alaska, Hawaii, US Pacific territories (no free shipping)
//
// International is intentionally not a tier — the Stripe session
// restricts allowed_countries to ['US'], so non-US addresses can't
// even reach checkout.
//
// Free shipping kicks in at $50 subtotal for the two middle tiers.
// Local is already free; AK/HI is excluded because the actual
// carrier cost ($10-22 per package) is too high to absorb at our
// margins.

const LOCAL_ZIPS = new Set(['94501', '94502']);

export const FREE_SHIPPING_THRESHOLD_CENTS = 5000; // $50.00

const TIERS = {
  local: {
    label: 'Free local pickup/delivery',
    rateCents: 0,
    eligibleForFreeShipping: false, // already free
  },
  california: {
    label: 'California',
    rateCents: 495, // $4.95
    eligibleForFreeShipping: true,
  },
  continental: {
    label: 'Continental US',
    rateCents: 795, // $7.95
    eligibleForFreeShipping: true,
  },
  ak_hi: {
    label: 'Alaska / Hawaii / Territories',
    rateCents: 1295, // $12.95
    eligibleForFreeShipping: false,
  },
};

export function isLocalDeliveryZip(zip) {
  if (typeof zip !== 'string') return false;
  return LOCAL_ZIPS.has(zip.trim());
}

export function localDeliveryZipList() {
  return [...LOCAL_ZIPS];
}

// Returns 'local' | 'california' | 'continental' | 'ak_hi', or null
// when the zip isn't a 5-digit US zip we recognize. Null is the
// "checkout disabled" signal for callers.
export function shippingTier(zip) {
  if (typeof zip !== 'string') return null;
  const z = zip.trim();
  if (!/^\d{5}$/.test(z)) return null;

  if (LOCAL_ZIPS.has(z)) return 'local';

  const prefix2 = z.slice(0, 2);
  const prefix3 = parseInt(z.slice(0, 3), 10);

  // AK/HI/territories first — they carve out of CA's 96xxx and the
  // 99xxx ranges, so check before the geographic prefixes.
  if (prefix3 === 967 || prefix3 === 968) return 'ak_hi'; // Hawaii
  if (prefix3 === 969) return 'ak_hi';                    // Pacific territories
  if (prefix3 >= 995 && prefix3 <= 999) return 'ak_hi';   // Alaska

  // California: 90-95 prefix, plus 960-966 for NorCal not in 95xxx.
  if (['90', '91', '92', '93', '94', '95'].includes(prefix2)) return 'california';
  if (prefix3 >= 960 && prefix3 <= 966) return 'california';

  // Everything else assumed to be continental US. Customers in
  // Hawaii / Alaska / territories were already caught above.
  return 'continental';
}

// Returns the shipping cost in cents to charge for a given zip and
// cart subtotal. Returns null when the zip is invalid; callers
// should treat null as "can't ship — disable checkout."
export function shippingRateCents(zip, subtotalCents) {
  const tier = shippingTier(zip);
  if (!tier) return null;

  const t = TIERS[tier];
  if (t.eligibleForFreeShipping && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) {
    return 0;
  }
  return t.rateCents;
}

// Returns a view-model for the cart drawer to render the shipping
// section. Lets the drawer stay dumb about tier definitions.
//
//   { tier, tierLabel, rateCents, isLocal,
//     eligibleForFreeShipping, freeShippingApplied,
//     awayFromFreeCents }
//
// or null when the zip is invalid.
export function shippingInfo(zip, subtotalCents) {
  const tier = shippingTier(zip);
  if (!tier) return null;

  const t = TIERS[tier];
  const rateCents = shippingRateCents(zip, subtotalCents);

  return {
    tier,
    tierLabel: t.label,
    rateCents,
    isLocal: tier === 'local',
    eligibleForFreeShipping: t.eligibleForFreeShipping,
    freeShippingApplied: t.eligibleForFreeShipping && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS,
    awayFromFreeCents: Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents),
  };
}
