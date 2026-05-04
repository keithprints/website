// Local-delivery zone eligibility.
// Today: simple zip-list lookup. Future "within X miles of 94501" can be
// implemented by replacing isLocalDeliveryZip — keep callers importing
// just this function and the upgrade stays a one-line swap.

const LOCAL_ZIPS = new Set(['94501', '94502']);

export function isLocalDeliveryZip(zip) {
  if (typeof zip !== 'string') return false;
  return LOCAL_ZIPS.has(zip.trim());
}

// Used by the cart drawer to give a helpful hint when validation fails.
export function localDeliveryZipList() {
  return [...LOCAL_ZIPS];
}

export const LOCAL_DELIVERY_LABEL = 'Local pickup/delivery (Alameda)';
export const LOCAL_DELIVERY_DESCRIPTION = 'Free pickup or drop-off — no shipping charge';
