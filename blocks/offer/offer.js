const FEEDBACK_DURATION = 2500;

/**
 * Marks a short paragraph placed before the first heading as the eyebrow.
 * @param {Element} content The rich text cell
 */
function decorateEyebrow(content) {
  const first = content.firstElementChild;
  if (first?.tagName === 'P' && first.nextElementSibling?.matches('h1, h2, h3, h4, h5, h6')) {
    first.classList.add('offer-eyebrow');
  }
}

/**
 * Builds the coupon chip around the authored coupon cell, keeping its
 * Universal Editor instrumentation intact.
 * @param {Element} cell The authored coupon cell
 * @returns {Element} The coupon chip
 */
function buildCoupon(cell) {
  const coupon = document.createElement('div');
  coupon.className = 'offer-coupon';

  const label = document.createElement('span');
  label.className = 'offer-coupon-label';
  label.textContent = 'Cupom';

  cell.className = 'offer-coupon-code';

  const status = document.createElement('span');
  status.className = 'offer-coupon-status';
  status.setAttribute('role', 'status');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'offer-coupon-copy';
  button.textContent = 'Copiar';
  button.setAttribute('aria-label', `Copiar cupom ${cell.textContent.trim()}`);

  let resetTimer;
  button.addEventListener('click', async () => {
    const code = cell.textContent.trim();
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copiado';
      status.textContent = `Cupom ${code} copiado`;
    } catch {
      window.getSelection().selectAllChildren(cell);
      status.textContent = 'Selecione o cupom para copiar';
    }
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.textContent = 'Copiar';
      status.textContent = '';
    }, FEEDBACK_DURATION);
  });

  coupon.append(label, cell, button, status);
  return coupon;
}

/**
 * loads and decorates the offer block
 * @param {Element} block The offer block element
 */
export default function decorate(block) {
  const [contentRow, couponRow, ctaRow] = [...block.children];
  const content = contentRow?.firstElementChild;
  const couponCell = couponRow?.firstElementChild;
  const cta = ctaRow?.querySelector('a');

  const inner = document.createElement('div');
  inner.className = 'offer-inner';

  if (content) {
    content.className = 'offer-content';
    decorateEyebrow(content);
    inner.append(content);
  }

  const actions = document.createElement('div');
  actions.className = 'offer-actions';

  if (couponCell?.textContent.trim()) {
    actions.append(buildCoupon(couponCell));
  }

  if (cta) {
    const ctaCell = cta.closest('div');
    cta.className = 'button accent';
    ctaCell.className = 'offer-cta';
    actions.append(ctaCell);
  }

  if (actions.childElementCount) inner.append(actions);
  block.replaceChildren(inner);
}
