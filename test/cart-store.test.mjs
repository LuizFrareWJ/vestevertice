import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem, setQty, summarize, readCart, writeCart,
} from '../blocks/cart/cart-store.js';

const TENIS = {
  id: '/calcados/tenis-lona-marinho', name: 'Tênis Lona Marinho', price: 27990, promo: 22392, condition: 'com o cupom BLACK20',
};
const JAQUETA = {
  id: '/jaqueta-de-couro', name: 'Jaqueta de Couro', price: 79990, promo: null,
};

function memoryStorage() {
  const data = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } };
}

test('BLACK20 on the participating sneaker: 279,90 − 55,98 = 223,92', () => {
  const s = summarize(addItem([], TENIS), 'black20', 'BLACK20');
  assert.equal(s.status, 'applied');
  assert.deepEqual([s.subtotal, s.discount, s.total], [27990, 5598, 22392]);
});

test('the coupon does not discount a product without promo price', () => {
  const s = summarize(addItem([], JAQUETA), 'BLACK20', 'BLACK20');
  assert.equal(s.status, 'not-eligible');
  assert.equal(s.total, 79990);
});

test('mixed bag discounts only the eligible line, per unit', () => {
  const items = setQty(addItem(addItem([], TENIS), JAQUETA), TENIS.id, 2);
  const s = summarize(items, 'BLACK20', 'BLACK20');
  assert.equal(s.discount, 5598 * 2);
  assert.equal(s.total, 27990 * 2 + 79990 - 5598 * 2);
});

test('unknown or missing code: no discount', () => {
  assert.equal(summarize(addItem([], TENIS), 'BLACK30', 'BLACK20').status, 'invalid');
  assert.equal(summarize(addItem([], TENIS), '', 'BLACK20').status, 'none');
  assert.equal(summarize(addItem([], TENIS), 'BLACK20', '').status, 'invalid');
});

test('adding twice increments quantity; zero removes', () => {
  const twice = addItem(addItem([], TENIS), TENIS);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].qty, 2);
  assert.deepEqual(setQty(twice, TENIS.id, 0), []);
});

test('storage round trip, and blocked storage never breaks', () => {
  const storage = memoryStorage();
  assert.equal(writeCart(addItem([], TENIS), storage), true);
  assert.equal(readCart(storage)[0].name, 'Tênis Lona Marinho');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readCart(blocked), []);
  assert.equal(writeCart([], blocked), false);
  assert.deepEqual(readCart({ getItem: () => '{"not":"a list"}' }), []);
});
