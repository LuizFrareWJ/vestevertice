import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Flags product details authored with semantic formatting:
 * a paragraph with <del> is the price, a paragraph that is only italic is the badge.
 * @param {Element} body The card body
 */
function decorateProduct(body) {
  body.querySelectorAll(':scope > p').forEach((p) => {
    if (p.querySelector('del')) {
      p.classList.add('cards-card-price');
      return;
    }
    const em = p.querySelector(':scope > em');
    if (em && p.childElementCount === 1 && p.textContent.trim() === em.textContent.trim()) {
      p.classList.add('cards-card-badge');
    }
  });
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
        if (isProducts) decorateProduct(div);
      }
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  block.replaceChildren(ul);
}
