import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatCents, resolvePrices } from '../blocks/product-detail/pricing.js';

const nbsp = (s) => s.replace(/\u00a0/g, ' ');

test('parses number field output and Brazilian notation into cents', () => {
  assert.equal(toCents('279.9'), 27990);
  assert.equal(toCents(279.9), 27990);
  assert.equal(toCents('R$ 279,90'), 27990);
  assert.equal(toCents('1.279,90'), 127990);
  assert.equal(toCents('223.92'), 22392);
});

test('missing or invalid prices never become zero', () => {
  assert.equal(toCents(''), null);
  assert.equal(toCents(undefined), null);
  assert.equal(toCents('consulte'), null);
  assert.equal(toCents('0'), null);
});

test('formats cents as BRL', () => {
  assert.equal(nbsp(formatCents(22392)), 'R$ 223,92');
  assert.equal(nbsp(formatCents(5598)), 'R$ 55,98');
});

test('eligible product: Tênis Lona Marinho', () => {
  assert.deepEqual(resolvePrices('279.9', '223.92'), { price: 27990, promo: 22392, savings: 5598 });
});

test('ineligible product keeps only the base price', () => {
  assert.deepEqual(resolvePrices('799.9', ''), { price: 79990, promo: null, savings: null });
});

test('a promo that is not lower than the price is ignored', () => {
  assert.deepEqual(resolvePrices('100', '100'), { price: 10000, promo: null, savings: null });
});

test('no base price means no commercial info at all', () => {
  assert.deepEqual(resolvePrices('', '223.92'), { price: null, promo: null, savings: null });
});
