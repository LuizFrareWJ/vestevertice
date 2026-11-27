/*
 * Demo bag: lives in the visitor's own browser (localStorage), never on a server.
 * Prices come from what the product page authored; the valid coupon code comes
 * from the published offer. No checkout, no payment.
 */

export const CART_PATH = '/sacola';
export const CART_EVENT = 'veste-vertice:sacola';
const KEY = 'veste-vertice-sacola';
const COUPON_KEY = 'veste-vertice-cupom';
const MAX_QTY = 10;

/**
 * Reads the bag. Storage can be blocked (private mode): an empty bag is returned.
 * @param {Storage} [storage]
 * @returns {Object[]} Items
 */
export function readCart(storage) {
  try {
    const store = storage ?? window.localStorage;
    const items = JSON.parse(store.getItem(KEY) || '[]');
    if (!Array.isArray(items)) return [];
    return items.filter((item) => item && item.id && Number.isInteger(item.price));
  } catch {
    return [];
  }
}

/** @returns {number} Number of units in the bag */
export function countItems(items) {
  return items.reduce((sum, item) => sum + (Number.isInteger(item.qty) ? item.qty : 0), 0);
}

/**
 * Saves the bag. A bag that ends (no units left) or a new one that starts (first
 * unit) never carries the previous code: the next purchase starts at the base price.
 * This also clears a code left by older versions next to an empty bag.
 * @param {Object[]} items Items to keep
 * @param {Storage} [storage]
 * @returns {boolean} true when the bag was saved
 */
export function writeCart(items, storage) {
  try {
    const store = storage ?? window.localStorage;
    const before = countItems(readCart(store));
    store.setItem(KEY, JSON.stringify(items));
    if (before === 0 || countItems(items) === 0) store.removeItem(COUPON_KEY);
    if (!storage) window.dispatchEvent(new CustomEvent(CART_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function normalizeCode(code) {
  return (code || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * The code the visitor typed last. It is only a convenience: the bag checks it
 * against the published offer again every time it is shown.
 * @param {Storage} [storage]
 * @returns {string}
 */
export function readCoupon(storage) {
  try {
    return normalizeCode((storage ?? window.localStorage).getItem(COUPON_KEY));
  } catch {
    return '';
  }
}

export function writeCoupon(code, storage) {
  try {
    const store = storage ?? window.localStorage;
    if (code) store.setItem(COUPON_KEY, normalizeCode(code));
    else store.removeItem(COUPON_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds a product, or one more unit of it.
 * @param {Object[]} items Current items
 * @param {Object} product {id, name, url, image, alt, price, promo, condition} prices in cents
 * @returns {Object[]} New items
 */
export function addItem(items, product) {
  const existing = items.find((item) => item.id === product.id);
  if (existing) {
    return items.map((item) => (item.id === product.id
      ? { ...item, qty: Math.min(item.qty + 1, MAX_QTY) } : item));
  }
  return [...items, { ...product, qty: 1 }];
}

export function setQty(items, id, qty) {
  if (qty <= 0) return items.filter((item) => item.id !== id);
  return items.map((item) => (item.id === id ? { ...item, qty: Math.min(qty, MAX_QTY) } : item));
}

/**
 * Totals of the bag. The coupon only discounts items that have a lower
 * promotional price authored on their product page.
 * @param {Object[]} items Items
 * @param {string} entered Code typed by the visitor
 * @param {string} active Coupon of the published offer
 */
export function summarize(items, entered, active) {
  const code = normalizeCode(entered);
  const valid = !!code && code === normalizeCode(active);
  const lines = items.map((item) => {
    const eligible = Number.isInteger(item.promo) && item.promo < item.price;
    const discount = valid && eligible ? (item.price - item.promo) * item.qty : 0;
    return {
      ...item, eligible, subtotal: item.price * item.qty, discount,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const discount = lines.reduce((sum, line) => sum + line.discount, 0);
  let status = 'none';
  if (code && !valid) status = 'invalid';
  else if (valid && discount > 0) status = 'applied';
  else if (valid) status = 'not-eligible';
  return {
    lines, subtotal, discount, total: subtotal - discount, code, status,
  };
}
