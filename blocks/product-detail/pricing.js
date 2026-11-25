const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Parses an authored price into integer cents.
 * Accepts number field output ("279.9") and Brazilian notation ("R$ 1.279,90").
 * @param {string|number|null|undefined} value The authored value
 * @returns {number|null} Cents, or null when there is no usable price
 */
export function toCents(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).replace(/[^\d.,-]/g, '');
  if (!/\d/.test(text)) return null;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

/**
 * Formats integer cents as Brazilian reais.
 * @param {number} cents Amount in cents
 * @returns {string} Formatted amount, e.g. "R$ 223,92"
 */
export function formatCents(cents) {
  return BRL.format(cents / 100);
}

/**
 * Builds the commercial view of a product from authored prices.
 * A promotional price only counts when it is lower than the base price.
 * @param {string|number} base Authored base price
 * @param {string|number} promo Authored promotional price
 * @returns {{price: number|null, promo: number|null, savings: number|null}} Amounts in cents
 */
export function resolvePrices(base, promo) {
  const price = toCents(base);
  const promoCents = toCents(promo);
  if (price === null) return { price: null, promo: null, savings: null };
  if (promoCents === null || promoCents >= price) return { price, promo: null, savings: null };
  return { price, promo: promoCents, savings: price - promoCents };
}
