import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { buildPrice, findPriceCell } from './price-cell.js';

function text(element) {
  return element?.textContent.trim() || '';
}

/**
 * Reads the four grouped cells (media, summary, price, description) by
 * their semantic content, so empty optional fields never shift other values.
 * @param {Element} block The block element
 */
function readContent(block) {
  const cells = [...block.children].map((row) => row.firstElementChild).filter(Boolean);
  const pictures = [...block.querySelectorAll('picture')];
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  const summary = heading?.closest('div');
  // All four groups delivered: the model order (media, summary, price, text) identifies them.
  const complete = cells.length === 4 && cells[1] === summary;
  const priceCell = complete ? cells[2] : findPriceCell(cells, summary);

  const summaryParagraphs = summary ? [...summary.querySelectorAll(':scope > p')] : [];
  const back = summaryParagraphs.map((p) => p.querySelector('a')).find(Boolean);
  const color = summaryParagraphs.find((p) => !p.querySelector('a'));

  const description = complete ? cells[3] : cells.find((cell) => cell !== summary
    && cell !== priceCell && !cell.querySelector('picture') && text(cell));

  return {
    pictures, heading, color, back, priceCell, description,
  };
}

/**
 * Builds the gallery: the first photo loads eagerly (LCP), the detail photo
 * only loads once it is shown.
 * @param {Element[]} pictures Authored pictures
 * @returns {Element|null} The gallery
 */
function buildGallery(pictures) {
  if (!pictures.length) return null;
  const gallery = document.createElement('div');
  gallery.className = 'product-detail-gallery';

  const stage = document.createElement('div');
  stage.className = 'product-detail-stage';

  const slides = pictures.map((picture, index) => {
    const img = picture.querySelector('img');
    const optimized = createOptimizedPicture(img.src, img.alt, index === 0, [
      { media: '(min-width: 900px)', width: '1200' },
      { width: '750' },
    ]);
    moveInstrumentation(img, optimized.querySelector('img'));
    const slide = document.createElement('figure');
    slide.className = 'product-detail-slide';
    slide.id = `product-detail-slide-${index}`;
    slide.hidden = index !== 0;
    slide.append(optimized);
    stage.append(slide);
    return { slide, alt: img.alt, src: img.src };
  });
  gallery.append(stage);
  if (slides.length < 2) return gallery;

  const thumbs = document.createElement('div');
  thumbs.className = 'product-detail-thumbs';
  thumbs.setAttribute('role', 'group');
  thumbs.setAttribute('aria-label', 'Fotos do produto');

  const buttons = slides.map(({ slide, alt, src }, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'product-detail-thumb';
    button.setAttribute('aria-controls', slide.id);
    button.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
    button.setAttribute('aria-label', `Foto ${index + 1} de ${slides.length}${alt ? `: ${alt}` : ''}`);
    button.append(createOptimizedPicture(src, '', false, [{ width: '200' }]));
    thumbs.append(button);
    return button;
  });

  const select = (target) => {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', index === target ? 'true' : 'false');
      slides[index].slide.hidden = index !== target;
    });
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      select(next);
      buttons[next].focus();
    });
  });

  gallery.append(thumbs);
  return gallery;
}

/**
 * loads and decorates the product detail block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const content = readContent(block);
  const gallery = buildGallery(content.pictures);

  const info = document.createElement('div');
  info.className = 'product-detail-info';

  if (content.back) {
    const nav = document.createElement('p');
    nav.className = 'product-detail-breadcrumb';
    content.back.className = 'product-detail-back';
    nav.append(content.back);
    info.append(nav);
  }

  if (content.heading) info.append(content.heading);

  if (content.color) {
    content.color.className = 'product-detail-color';
    info.append(content.color);
  }

  const price = buildPrice(content.priceCell, { moveInstrumentation });
  if (price) info.append(price);

  if (text(content.description)) {
    content.description.className = 'product-detail-description';
    info.append(content.description);
  }

  block.replaceChildren(...[gallery, info].filter(Boolean));
}
