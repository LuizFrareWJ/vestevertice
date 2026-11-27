import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);
  if (!fragment) return;

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // partner logo authored as :air-logo: needs a text alternative
  footer.querySelectorAll('.icon-air-logo img').forEach((img) => {
    img.alt = 'AI/R Agentic AI Engineering';
  });

  // each authored section gets its role: link groups, store wordmark, demo credit
  footer.querySelectorAll(':scope > .section').forEach((section) => {
    const wrapper = section.querySelector('.default-content-wrapper') || section;
    const headings = wrapper.querySelectorAll(':scope > h2, :scope > h3');
    if (headings.length && wrapper.querySelector(':scope > ul')) {
      const nav = document.createElement('nav');
      nav.className = 'footer-nav';
      nav.setAttribute('aria-label', 'Rodapé');
      headings.forEach((heading) => {
        const group = document.createElement('div');
        group.className = 'footer-group';
        const list = heading.nextElementSibling?.tagName === 'UL' ? heading.nextElementSibling : null;
        group.append(heading);
        if (list) group.append(list);
        nav.append(group);
      });
      wrapper.prepend(nav);
      section.classList.add('footer-links');
    } else if (wrapper.querySelector('.icon-air-logo')) {
      section.classList.add('footer-credit');
    } else if (wrapper.querySelector(':scope > p > strong:only-child')) {
      section.classList.add('footer-brand');
    }
  });

  block.append(footer);
}
