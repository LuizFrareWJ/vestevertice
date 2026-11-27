import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Creates text that is read by assistive technology only.
 * @param {string} text The text to announce
 * @returns {Element} The visually hidden span
 */
function srOnly(text) {
  const span = document.createElement('span');
  span.className = 'cards-sr-only';
  span.textContent = text;
  return span;
}

/**
 * A paragraph with struck-through text is the price: the <del> is the original price,
 * the rest is the current price. Screen readers get "De … por …".
 * @param {Element} body The card body
 */
function decoratePrice(body) {
  body.querySelectorAll(':scope > p').forEach((p) => {
    const del = p.querySelector('del');
    if (!del) return;
    p.classList.add('cards-card-price');
    // "R$ 223,92 com o cupom": the amount and its condition each stay on one line
    const rest = [...p.childNodes].filter((node) => node !== del);
    const match = rest.map((node) => node.textContent).join('').trim().match(/^(R\$\s?[\d.,]+)\s*(.*)$/);
    if (match && rest.every((node) => node.nodeType === Node.TEXT_NODE)) {
      const [, amountText, conditionText] = match;
      rest.forEach((node) => node.remove());
      const amount = document.createElement('span');
      amount.className = 'cards-card-price-amount';
      amount.textContent = amountText;
      p.append(amount);
      if (conditionText) {
        const condition = document.createElement('span');
        condition.className = 'cards-card-price-condition';
        condition.textContent = conditionText;
        p.append(' ', condition);
      }
    }
    del.before(srOnly('De '));
    del.after(srOnly(' por '));
  });
}

/**
 * A card whose body has a single link becomes one clickable target,
 * keeping that link as the only element in the tab order.
 * @param {Element} li The card
 */
function decorateLink(li) {
  const links = li.querySelectorAll('.cards-card-body a[href]');
  if (links.length === 1) li.classList.add('cards-card-linked');
}

export default function decorate(block) {
  const isProducts = block.classList.contains('products');
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) {
        div.className = 'cards-card-image';
      } else {
        div.className = 'cards-card-body';
        if (isProducts) decoratePrice(div);
      }
    });
    decorateLink(li);
    if (!isProducts && li.children.length === 2 && li.querySelector('.cards-card-image')
      && li.querySelector('.cards-card-body > :is(h2, h3):only-child a:only-child')
      && li.classList.contains('cards-card-linked')) li.classList.add('cards-category');
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  block.replaceChildren(ul);
  if (isProducts && ul.childElementCount) {
    const count = document.createElement('p');
    const total = ul.childElementCount;
    count.className = 'cards-count';
    count.textContent = total === 1 ? '1 peça' : `${total} peças`;
    block.prepend(count);
  }
}
