import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem, setQty, summarize, readCart, writeCart, readCoupon, writeCoupon, countItems,
} from '../blocks/cart/cart-store.js';

const TENIS = {
  id: '/calcados/tenis-lona-marinho', name: 'Tênis Lona Marinho', price: 27990, promo: 22392, condition: 'com o cupom BLACK20',
};
const JAQUETA = {
  id: '/jaqueta-de-couro', name: 'Jaqueta de Couro', price: 79990, promo: null,
};

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
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

const SUETER = {
  id: '/catalogo/sueter-chevron', name: 'Suéter Chevron', price: 25990, promo: null,
};
const BOTA = {
  id: '/calcados/bota-cano-curto-areia', name: 'Bota Cano Curto Areia', price: 45990, promo: 36792,
};

test('mixed bag from the journey: 259,90 + 459,90 − 91,98 = 627,82', () => {
  const s = summarize(addItem(addItem([], SUETER), BOTA), 'BLACK20', 'BLACK20');
  assert.equal(s.status, 'applied');
  assert.deepEqual([s.subtotal, s.discount, s.total], [71980, 9198, 62782]);
  assert.deepEqual(s.lines.map((line) => line.discount), [0, 9198]);
});

test('removing the eligible piece leaves the code valid but without effect', () => {
  const items = setQty(addItem(addItem([], SUETER), BOTA), BOTA.id, 0);
  const s = summarize(items, 'BLACK20', 'BLACK20');
  assert.equal(s.status, 'not-eligible');
  assert.equal(s.total, 25990);
});

test('the kept coupon is normalized, cleared, and never breaks on blocked storage', () => {
  const storage = memoryStorage();
  writeCoupon(' black 20 ', storage);
  assert.equal(readCoupon(storage), 'BLACK20');
  writeCoupon('', storage);
  assert.equal(readCoupon(storage), '');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readCoupon(blocked), '');
  assert.equal(writeCoupon('BLACK20', blocked), false);
});

test('the header count is the number of units', () => {
  assert.equal(countItems([]), 0);
  assert.equal(countItems(setQty(addItem(addItem([], TENIS), JAQUETA), TENIS.id, 2)), 3);
});

test('regressão: esvaziar a sacola descarta o cupom e a próxima compra começa no preço-base', () => {
  const storage = memoryStorage();
  const bag = addItem([], TENIS);
  writeCart(bag, storage);
  writeCoupon('BLACK20', storage);
  assert.equal(summarize(readCart(storage), readCoupon(storage), 'BLACK20').total, 22392);

  writeCart(setQty(readCart(storage), TENIS.id, 0), storage);
  assert.equal(readCoupon(storage), '', 'o código não pode sobreviver à sacola vazia');

  writeCart(addItem(readCart(storage), TENIS), storage);
  const next = summarize(readCart(storage), readCoupon(storage), 'BLACK20');
  assert.deepEqual([next.status, next.total], ['none', 27990]);
});

test('regressão: estado legado (sacola vazia com BLACK20 guardado) não reaplica o cupom ao comprar pela PDP', () => {
  // fixture legada: o que ficou em navegadores antes da correção
  const legacy = memoryStorage();
  legacy.setItem('veste-vertice-sacola', '[]');
  legacy.setItem('veste-vertice-cupom', 'BLACK20');
  legacy.setItem('outra-chave-do-site', 'preservada');

  writeCart(addItem(readCart(legacy), TENIS), legacy);
  assert.equal(readCoupon(legacy), '');
  assert.equal(summarize(readCart(legacy), readCoupon(legacy), 'BLACK20').total, 27990);
  assert.equal(legacy.getItem('outra-chave-do-site'), 'preservada');
});

test('sacola mista: remover só uma peça mantém o código guardado', () => {
  const storage = memoryStorage();
  const COURO = {
    id: '/catalogo/jaqueta-de-couro', name: 'Jaqueta de Couro', price: 79990, promo: null,
  };
  writeCart(addItem(addItem([], TENIS), COURO), storage);
  writeCoupon('BLACK20', storage);
  writeCart(setQty(readCart(storage), COURO.id, 0), storage);
  assert.equal(readCoupon(storage), 'BLACK20');
  assert.equal(summarize(readCart(storage), readCoupon(storage), 'BLACK20').total, 22392);
});
