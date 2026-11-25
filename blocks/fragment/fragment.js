/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

// eslint-disable-next-line import/no-cycle
import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadSections,
} from '../../scripts/aem.js';

/**
 * Builds a decorated fragment from its markup.
 * @param {string} html The fragment markup (.plain.html)
 * @param {string} path The fragment path, used to resolve media
 * @returns {Promise<HTMLElement>} The root element of the fragment
 */
async function buildFragment(html, path) {
  const main = document.createElement('main');
  main.innerHTML = html;

  // reset base path for media to fragment base
  const resetAttributeBase = (tag, attr) => {
    main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
      elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
    });
  };
  resetAttributeBase('img', 'src');
  resetAttributeBase('source', 'srcset');

  decorateMain(main);
  await loadSections(main);
  return main;
}

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {HTMLElement} The root element of the fragment
 */
export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    // eslint-disable-next-line no-param-reassign
    path = path.replace(/(\.plain)?\.html/, '');
    // revalidate on every load: aem.live lets browsers keep HTML for hours,
    // and a published fragment must show up as soon as the page is refreshed
    const resp = await fetch(`${path}.plain.html`, { cache: 'no-cache' });
    if (resp.ok) {
      const html = await resp.text();
      const main = await buildFragment(html, path);
      main.dataset.fragmentPath = path;
      main.fragmentSource = html;
      return main;
    }
  }
  return null;
}

/**
 * Open public tabs keep a shared offer up to date. Not inside the Universal
 * Editor, where authors edit the fragment itself.
 */
function inEditor() {
  return window.location.hostname.endsWith('.adobeaemcloud.com')
    || document.documentElement.classList.contains('adobe-ue-edit')
    || !!document.querySelector('[data-aue-resource]');
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (!fragment) return;
  const { fragmentPath } = fragment.dataset;
  const source = fragment.fragmentSource;
  const hasOffer = !!fragment.querySelector('.offer');
  block.replaceChildren(...fragment.childNodes);

  if (hasOffer && !inEditor()) {
    const { watchOffer } = await import('../offer/offer-watch.js');
    watchOffer({
      block,
      path: fragmentPath,
      baselineHtml: source,
      win: window,
      doc: document,
      render: (html) => buildFragment(html, fragmentPath),
    });
  }
}
