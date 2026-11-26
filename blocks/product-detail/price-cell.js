import { formatCents, resolvePrices } from './pricing.js';

const NUMBER = /^\d+(?:[.,]\d+)*$/;

function text(element) {
  return element?.textContent.trim() || '';
}

function srOnly(doc, value) {
  const span = doc.createElement('span');
  span.className = 'product-detail-sr-only';
  span.textContent = value;
  return span;
}

/**
 * Finds the cell of the price group (price_base, price_promo, price_condition).
 * @param {Element[]} cells Block cells
 * @param {Element} [exclude] Cell to skip (the summary)
 */
export function findPriceCell(cells, exclude) {
  return cells.find((cell) => cell !== exclude
    && [...cell.querySelectorAll(':scope > p')].some((p) => NUMBER.test(text(p))));
}

/**
 * Reads the price group values from the delivered markup.
 * @param {Element} cell The price cell
 * @returns {{base: Element, promo: Element, condition: Element}}
 */
export function readPriceCell(cell) {
  const paragraphs = cell ? [...cell.querySelectorAll(':scope > p')] : [];

  // Every field of the group was serialized (empty ones as empty paragraphs):
  // the model order (price_base, price_promo, price_condition) identifies them.
  if (paragraphs.length === 3 || paragraphs.some((p) => !text(p))) {
    const [base, promo, condition] = paragraphs;
    return { base, promo, condition };
  }

  // Empty fields were omitted: identify values by content.
  const numbers = paragraphs.filter((p) => NUMBER.test(text(p)));
  const condition = paragraphs.find((p) => !numbers.includes(p) && text(p));
  if (numbers.length === 1 && condition) {
    // The condition only exists next to a promotional price, so a lone number
    // beside it is a promo whose base price is missing: no base, no price group.
    return { base: undefined, promo: numbers[0], condition };
  }
  return { base: numbers[0], promo: numbers[1], condition };
}

/**
 * The resolved prices of the group, as the page shows them.
 * @param {Element} cell The price cell
 * @returns {{price: number|null, promo: number|null, savings: number|null, condition: string}}
 */
export function readPriceValues(cell) {
  const { base, promo, condition } = readPriceCell(cell);
  return { ...resolvePrices(text(base), text(promo)), condition: text(condition) };
}

/**
 * Renders the price block from the price cell. Missing prices render nothing.
 * @param {Element} cell The price cell
 * @param {Object} [options]
 * @param {Function} [options.moveInstrumentation] Keeps Universal Editor attributes
 * @returns {Element|null} The price block
 */
export function buildPrice(cell, { moveInstrumentation = () => {} } = {}) {
  if (!cell) return null;
  const doc = cell.ownerDocument;
  const { base, promo, condition } = readPriceCell(cell);
  const prices = resolvePrices(text(base), text(promo));
  if (prices.price === null) return null;

  const wrapper = doc.createElement('div');
  wrapper.className = 'product-detail-price';
  const current = doc.createElement('p');
  current.className = 'product-detail-price-current';
  const amount = doc.createElement('strong');
  wrapper.append(current);

  if (prices.promo === null) {
    amount.textContent = formatCents(prices.price);
    if (base) moveInstrumentation(base, amount);
    current.append(amount);
    return wrapper;
  }

  amount.textContent = formatCents(prices.promo);
  moveInstrumentation(promo, amount);
  current.append(srOnly(doc, `De ${formatCents(prices.price)} por `), amount);
  if (text(condition)) {
    const label = doc.createElement('span');
    label.className = 'product-detail-price-condition';
    label.textContent = ` ${text(condition)}`;
    moveInstrumentation(condition, label);
    current.append(label);
  }

  const original = doc.createElement('p');
  original.className = 'product-detail-price-original';
  original.setAttribute('aria-hidden', 'true');
  const del = doc.createElement('del');
  del.textContent = formatCents(prices.price);
  moveInstrumentation(base, del);
  original.append('Sem o cupom ', del);

  const savings = doc.createElement('p');
  savings.className = 'product-detail-price-savings';
  savings.textContent = `Economia de ${formatCents(prices.savings)}`;

  wrapper.append(original, savings);
  return wrapper;
}
