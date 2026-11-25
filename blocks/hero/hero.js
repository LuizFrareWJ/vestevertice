/**
 * loads and decorates the hero block
 * Portrait images get a split layout on wide screens, so the subject is not cropped away.
 * Orientation comes from the width/height attributes delivered with the image,
 * so the layout is decided before the first paint.
 * @param {Element} block The hero block element
 */
export default function decorate(block) {
  [...block.children].forEach((row) => {
    const isMedia = row.querySelector('picture') && !row.textContent.trim();
    row.classList.add(isMedia ? 'hero-media' : 'hero-content');
  });

  const img = block.querySelector('.hero-media img');
  const width = Number(img?.getAttribute('width'));
  const height = Number(img?.getAttribute('height'));
  if (width && height && height > width) block.classList.add('portrait');
}
