import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildPrice, findPriceCell } from '../blocks/product-detail/price-cell.js';

/**
 * Starts from the block markup delivered by AEM (grouped cells), reads the
 * price group and returns what the PDP would display.
 */
function render(priceCellHtml) {
  const { document } = parseHTML(`<div class="product-detail">
    <div><div><p><picture><img src="/media.jpg" alt="Tênis"></picture></p></div></div>
    <div><div><h1>Tênis Lona Marinho</h1><p>Azul-marinho</p>
      <p><a href="/produtos-participantes">Ver todos os produtos com desconto</a></p></div></div>
    <div><div>${priceCellHtml}</div></div>
    <div><div>Descrição</div></div>
  </div>`);
  const block = document.querySelector('.product-detail');
  const cells = [...block.children].map((row) => row.firstElementChild);
  const summary = block.querySelector('h1').closest('div');
  const price = buildPrice(findPriceCell(cells, summary) || cells[2]);
  const read = (selector) => price?.querySelector(selector)?.textContent.replace(/\u00a0/g, ' ').trim() || null;
  return {
    rendered: price !== null,
    amount: read('.product-detail-price-current strong'),
    condition: read('.product-detail-price-condition'),
    original: read('.product-detail-price-original del'),
    savings: read('.product-detail-price-savings'),
  };
}

test('published PDP markup: promo with BLACK20, original and savings', () => {
  assert.deepEqual(render('<p>279.9</p><p>223.92</p><p>com o cupom BLACK20</p>'), {
    rendered: true,
    amount: 'R$ 223,92',
    condition: 'com o cupom BLACK20',
    original: 'R$ 279,90',
    savings: 'Economia de R$ 55,98',
  });
});

test('base without promo: only the regular price', () => {
  assert.deepEqual(render('<p>279.9</p>'), {
    rendered: true, amount: 'R$ 279,90', condition: null, original: null, savings: null,
  });
});

test('base empty, field omitted: no price group at all', () => {
  assert.equal(render('<p>223.92</p><p>com o cupom BLACK20</p>').rendered, false);
});

test('base empty, field kept as empty paragraph: no price group at all', () => {
  assert.equal(render('<p></p><p>223.92</p><p>com o cupom BLACK20</p>').rendered, false);
});

test('both prices empty: no price group', () => {
  assert.equal(render('<p></p><p></p><p>com o cupom BLACK20</p>').rendered, false);
  assert.equal(render('<p>com o cupom BLACK20</p>').rendered, false);
});

test('promo equal to or above the base: only the base price', () => {
  const equal = render('<p>279.9</p><p>279.9</p><p>com o cupom BLACK20</p>');
  assert.equal(equal.amount, 'R$ 279,90');
  assert.equal(equal.condition, null);
  const above = render('<p>279.9</p><p>299.9</p><p>com o cupom BLACK20</p>');
  assert.equal(above.amount, 'R$ 279,90');
  assert.equal(above.savings, null);
});

test('base present, promo kept as empty paragraph: only the base price', () => {
  assert.deepEqual(render('<p>279.9</p><p></p><p></p>'), {
    rendered: true, amount: 'R$ 279,90', condition: null, original: null, savings: null,
  });
});

test('known limit: omitted fields with a lone number and no condition read as a base price', () => {
  // A promo without base AND without condition serializes exactly like a regular price.
  // The model prevents it: price_base is required and the condition goes with the promo.
  assert.equal(render('<p>223.92</p>').amount, 'R$ 223,92');
});
