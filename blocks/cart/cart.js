import { formatCents } from '../product-detail/pricing.js';
import { extractOffer } from '../offer/offer-watch.js';
import {
  readCart, writeCart, setQty, summarize, normalizeCode, readCoupon, writeCoupon,
} from './cart-store.js';

const DEFAULT_OFFER = '/fragments/oferta';

function text(cell) {
  return cell?.textContent.trim() || '';
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/**
 * The valid coupon is the one of the published offer, read from this origin.
 * @returns {Promise<string|null>} The coupon code ('' when the offer has none),
 * or null when the offer could not be read
 */
async function activeCoupon(offerPath) {
  try {
    const resp = await fetch(`${offerPath}.plain.html`, { cache: 'no-cache' });
    if (!resp.ok) return null;
    const container = document.createElement('div');
    container.innerHTML = await resp.text();
    return extractOffer(container, window.location.href)?.coupon || '';
  } catch {
    return null;
  }
}

/* Every state says what happens to the money, so it reads without the colors. */
const STATUS_TEXT = {
  checking: (code) => `Conferindo o cupom ${code} na oferta publicada…`,
  applied: (code, summary) => `Cupom ${code} aplicado: − ${formatCents(summary.discount)} nas peças participantes.`,
  'not-eligible': (code) => `O cupom ${code} vale só para peças participantes, e nenhuma peça desta sacola participa. O total segue sem desconto.`,
  invalid: (code) => `O cupom ${code} não existe ou não está ativo. O total segue sem desconto.`,
  unavailable: () => 'Não conseguimos conferir o cupom agora. O total segue sem desconto. Tente aplicar de novo.',
  none: () => '',
};

/**
 * loads and decorates the cart block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const [textRow, linkRow, offerRow] = [...block.children].map((row) => row.firstElementChild);
  const heading = textRow?.querySelector('h1, h2, h3') || el('h1', '', 'Sua sacola');
  const emptyMessage = [...(textRow?.querySelectorAll('p') || [])];
  const continueLink = linkRow?.querySelector('a');
  const offerHref = offerRow?.querySelector('a')?.getAttribute('href') || text(offerRow) || DEFAULT_OFFER;
  const offerPath = new URL(offerHref, window.location.href).pathname.replace(/(\.plain)?\.html$/, '');

  let items = readCart();
  let entered = readCoupon();
  // the code is only trusted after the published offer confirms it
  let couponStatus = entered ? 'checking' : 'none';
  let active = null;

  const body = el('div', 'cart-body');
  const status = el('p', 'cart-status');
  status.setAttribute('role', 'status');

  function restoreFocus(key) {
    if (!key) return;
    const target = body.querySelector(`[data-focus="${key}"]`) || heading;
    target.focus();
  }

  function lineCoupon(line, summary) {
    if (summary.status === 'applied' && line.discount) {
      return el('p', 'cart-line-coupon is-applied', `Com ${summary.code}: ${formatCents(line.promo)} cada`);
    }
    if (couponStatus !== 'checking' && (summary.status === 'applied' || summary.status === 'not-eligible')) {
      return el('p', 'cart-line-coupon is-excluded', `${summary.code} não vale para esta peça`);
    }
    if (line.eligible && line.condition) {
      // what the product page announced; the bag only discounts it once the code is applied
      return el('p', 'cart-line-coupon', `${formatCents(line.promo)} ${line.condition}`);
    }
    return null;
  }

  function render(focusKey) {
    body.replaceChildren();
    if (!items.length) {
      // the purchase is over: its code goes with it (storage is cleared by writeCart)
      entered = '';
      couponStatus = 'none';
      active = null;
      const empty = el('div', 'cart-empty');
      if (emptyMessage.length) empty.append(...emptyMessage.map((p) => p.cloneNode(true)));
      else empty.append(el('p', '', 'Sua sacola está vazia.'));
      if (continueLink) {
        const back = continueLink.cloneNode(true);
        back.classList.add('button', 'primary');
        empty.append(back);
      }
      body.append(empty);
      restoreFocus(focusKey);
      return;
    }

    const summary = summarize(items, couponStatus === 'checking' ? '' : entered, active);
    if (entered && !['unavailable', 'checking'].includes(couponStatus)) couponStatus = summary.status;
    status.className = `cart-status is-${couponStatus}`;
    status.textContent = entered ? STATUS_TEXT[couponStatus](entered, summary) : '';

    const list = el('ul', 'cart-lines');
    summary.lines.forEach((line) => {
      const li = el('li', 'cart-line');
      if (line.image) {
        const img = el('img');
        img.src = line.image;
        img.alt = line.alt || '';
        img.loading = 'lazy';
        li.append(img);
      }
      const info = el('div', 'cart-line-info');
      const name = el('a', 'cart-line-name', line.name);
      name.href = line.url;
      info.append(name, el('p', 'cart-line-price', formatCents(line.price)));
      const coupon = lineCoupon(line, summary);
      if (coupon) info.append(coupon);
      if (line.qty > 1) {
        info.append(el('p', 'cart-line-total', `${line.qty} × ${formatCents(line.price)} = ${formatCents(line.subtotal)}`));
      }

      const qty = el('div', 'cart-qty');
      const minus = el('button', 'cart-qty-button', '−');
      minus.type = 'button';
      minus.setAttribute('aria-label', `Diminuir quantidade de ${line.name}`);
      const value = el('span', 'cart-qty-value', String(line.qty));
      value.setAttribute('aria-label', `Quantidade: ${line.qty}`);
      const plus = el('button', 'cart-qty-button', '+');
      plus.type = 'button';
      plus.setAttribute('aria-label', `Aumentar quantidade de ${line.name}`);
      minus.dataset.focus = `minus-${line.id}`;
      plus.dataset.focus = `plus-${line.id}`;
      const change = (qtyValue, key) => {
        items = setQty(items, line.id, qtyValue);
        writeCart(items);
        render(key);
      };
      minus.addEventListener('click', () => change(line.qty - 1, minus.dataset.focus));
      plus.addEventListener('click', () => change(line.qty + 1, plus.dataset.focus));
      qty.append(minus, value, plus);
      const remove = el('button', 'cart-remove', 'Remover');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remover ${line.name} da sacola`);
      remove.addEventListener('click', () => change(0, 'removed'));
      info.append(qty, remove);
      li.append(info);
      list.append(li);
    });

    const form = el('form', 'cart-coupon');
    const label = el('label', 'cart-coupon-label', 'Cupom');
    label.htmlFor = 'cart-coupon-input';
    const input = el('input', 'cart-coupon-input');
    input.id = 'cart-coupon-input';
    input.name = 'coupon';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.value = entered;
    input.dataset.focus = 'coupon';
    input.setAttribute('aria-describedby', 'cart-coupon-status');
    status.id = 'cart-coupon-status';
    const apply = el('button', 'button secondary', 'Aplicar');
    apply.type = 'submit';
    form.append(label, input, apply);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      entered = normalizeCode(input.value);
      writeCoupon(entered);
      if (!entered) {
        couponStatus = 'none';
        render('coupon');
        return;
      }
      couponStatus = 'checking';
      status.className = 'cart-status is-checking';
      status.textContent = STATUS_TEXT.checking(entered);
      const code = entered;
      const published = await activeCoupon(offerPath);
      // a late answer never revives a code the visitor removed or a bag that ended
      if (!items.length || entered !== code) return;
      active = published;
      couponStatus = active === null ? 'unavailable' : summarize(items, entered, active).status;
      render('coupon');
    });

    const actions = el('div', 'cart-coupon-actions');
    if (entered && couponStatus !== 'checking') {
      const clear = el('button', 'cart-coupon-clear', 'Remover cupom');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        entered = '';
        couponStatus = 'none';
        writeCoupon('');
        render('coupon');
      });
      actions.append(clear);
    }
    if (couponStatus === 'not-eligible' && continueLink) {
      const browse = continueLink.cloneNode(true);
      browse.className = 'cart-coupon-browse';
      actions.append(browse);
    }

    const totals = el('dl', 'cart-totals');
    const row = (term, amount, className) => {
      const dt = el('dt', className, term);
      const dd = el('dd', className, amount);
      totals.append(dt, dd);
    };
    row('Subtotal', formatCents(summary.subtotal));
    if (summary.discount) row(`Desconto ${summary.code}`, `− ${formatCents(summary.discount)}`, 'is-discount');
    row('Total', formatCents(summary.total), 'is-total');

    const receipt = el('section', 'cart-summary');
    receipt.setAttribute('aria-labelledby', 'cart-summary-title');
    const title = el('h2', 'cart-summary-title', 'Resumo da sacola');
    title.id = 'cart-summary-title';
    const note = el('p', 'cart-note', 'Loja de demonstração: o pagamento não faz parte desta demo. O valor final é o total acima.');
    receipt.append(title, form, status);
    if (actions.childElementCount) receipt.append(actions);
    receipt.append(totals, note);
    body.append(list, receipt);
    if (continueLink) {
      const back = continueLink.cloneNode(true);
      back.className = 'cart-continue';
      body.append(back);
    }
    restoreFocus(focusKey);
  }

  heading.classList.add('cart-title');
  heading.tabIndex = -1;
  block.replaceChildren(heading, body);
  render();

  // a code kept from an earlier visit is checked against the offer published now
  if (couponStatus === 'checking' && items.length) {
    const code = entered;
    const published = await activeCoupon(offerPath);
    if (!items.length || entered !== code) return;
    active = published;
    couponStatus = active === null ? 'unavailable' : summarize(items, entered, active).status;
    render();
  } else if (couponStatus === 'checking') {
    couponStatus = 'none';
  }
}
