import { formatCents } from '../product-detail/pricing.js';
import { extractOffer } from '../offer/offer-watch.js';
import {
  readCart, writeCart, setQty, summarize, normalizeCode,
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
 * @returns {Promise<string|null>} The coupon code, or null when unavailable
 */
async function activeCoupon(offerPath) {
  try {
    const resp = await fetch(`${offerPath}.plain.html`, { cache: 'no-cache' });
    if (!resp.ok) return null;
    const container = document.createElement('div');
    container.innerHTML = await resp.text();
    return extractOffer(container, window.location.href)?.coupon || null;
  } catch {
    return null;
  }
}

const STATUS_TEXT = {
  applied: (code) => `Cupom ${code} aplicado.`,
  'not-eligible': (code) => `O cupom ${code} não vale para os produtos desta sacola.`,
  invalid: (code) => `O cupom ${code} não existe ou não está ativo.`,
  unavailable: () => 'Não foi possível validar o cupom agora. Tente de novo em instantes.',
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
  let entered = '';
  let couponStatus = 'none';
  let active = null;

  const body = el('div', 'cart-body');
  const status = el('p', 'cart-status');
  status.setAttribute('role', 'status');

  function restoreFocus(key) {
    if (!key) return;
    const target = body.querySelector(`[data-focus="${key}"]`) || heading;
    target.focus();
  }

  function render(focusKey) {
    body.replaceChildren();
    if (!items.length) {
      const empty = el('div', 'cart-empty');
      if (emptyMessage.length) empty.append(...emptyMessage.map((p) => p.cloneNode(true)));
      else empty.append(el('p', '', 'Sua sacola está vazia.'));
      if (continueLink) empty.append(continueLink.cloneNode(true));
      body.append(empty);
      restoreFocus(focusKey);
      return;
    }

    const summary = summarize(items, entered, active);
    if (entered && couponStatus !== 'unavailable') {
      couponStatus = summary.status;
      status.textContent = STATUS_TEXT[couponStatus](entered);
    }
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
      if (summary.status === 'applied' || summary.status === 'not-eligible') {
        const message = line.discount
          ? `Com ${summary.code}: ${formatCents(line.price - line.discount / line.qty)} cada`
          : `${summary.code} não vale para este produto`;
        info.append(el('p', `cart-line-coupon${line.discount ? ' is-applied' : ''}`, message));
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
    input.value = entered;
    input.dataset.focus = 'coupon';
    const apply = el('button', 'button secondary', 'Aplicar');
    apply.type = 'submit';
    form.append(label, input, apply);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      entered = normalizeCode(input.value);
      active = await activeCoupon(offerPath);
      couponStatus = active === null && entered ? 'unavailable' : summarize(items, entered, active).status;
      status.textContent = STATUS_TEXT[couponStatus](entered);
      render('coupon');
    });

    const totals = el('dl', 'cart-totals');
    const row = (term, amount, className) => {
      const dt = el('dt', className, term);
      const dd = el('dd', className, amount);
      totals.append(dt, dd);
    };
    row('Subtotal', formatCents(summary.subtotal));
    if (summary.discount) row(`Desconto ${summary.code}`, `− ${formatCents(summary.discount)}`, 'is-discount');
    row('Total', formatCents(summary.total), 'is-total');

    const note = el('p', 'cart-note', 'Loja de demonstração: o pagamento não faz parte desta demo.');
    body.append(list, form, status, totals, note);
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
}
