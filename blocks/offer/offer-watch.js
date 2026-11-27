/*
 * Keeps a shared offer fresh in tabs that are already open.
 *
 * A public page that embeds the offer fragment polls that fragment on its own
 * origin. When the served offer changes (what the visitor reads or where the
 * button leads), the fragment is swapped in place and a single notice is shown.
 * Nothing else triggers the notice: no presenter signal, no other origin.
 */

export const POLL_INTERVAL = 5000;
const MAX_BACKOFF = 60000;

const norm = (value) => (value || '').replace(/\s+/g, ' ').trim();

/**
 * Normalizes a link so equivalent URLs compare equal.
 * Same-origin links become path + query + hash, without a trailing slash.
 */
export function normalizeHref(href, baseUrl) {
  if (!href) return '';
  try {
    const url = new URL(href, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin) return url.href;
    const path = url.pathname.replace(/\.html$/, '').replace(/(.)\/$/, '$1');
    return `${path}${url.search}${url.hash}`;
  } catch {
    return norm(href);
  }
}

/**
 * Reads the offer the visitor sees from fragment markup (undecorated).
 * @param {Element} root Element containing the fragment markup
 * @param {string} baseUrl Page URL, used to resolve the button link
 * @returns {Object|null} The offer, or null when there is no usable offer block
 */
export function extractOffer(root, baseUrl) {
  const block = root?.querySelector('.offer');
  if (!block) return null;
  const [content, coupon, cta] = [...block.children].map((row) => row.firstElementChild);
  if (!content || !norm(content.textContent)) return null;
  const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
  const before = [];
  const after = [];
  let seenHeading = !heading;
  [...content.children].forEach((child) => {
    if (child === heading) seenHeading = true;
    else if (child.tagName === 'P') (seenHeading ? after : before).push(child);
  });
  const link = cta?.querySelector('a');
  return {
    eyebrow: norm(before.map((p) => p.textContent).join(' ')),
    title: norm(heading?.textContent),
    condition: norm(after.map((p) => p.textContent).join(' ')),
    coupon: norm(coupon?.textContent),
    label: norm(link?.textContent),
    href: normalizeHref(link?.getAttribute('href'), baseUrl),
  };
}

export function sameOffer(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Shows (or refreshes) the page-level notice. One element per page; the
 * visible card never takes focus, the hidden status region announces it.
 * @returns {Element} The notice
 */
export function showOfferNotice(doc, offer, rawHref) {
  let notice = doc.querySelector('.offer-notice');
  if (!notice) {
    notice = doc.createElement('aside');
    notice.className = 'offer-notice';
    notice.setAttribute('aria-label', 'Oferta atualizada');
    notice.innerHTML = `<div class="offer-notice-body">
      <p class="offer-notice-label">Oferta atualizada</p>
      <p class="offer-notice-title"></p>
      <p class="offer-notice-condition"></p>
      <p class="offer-notice-cta"><a class="button accent"></a></p>
    </div>
    <button type="button" class="offer-notice-close" aria-label="Fechar aviso">×</button>`;
    notice.querySelector('.offer-notice-close').addEventListener('click', () => {
      notice.hidden = true;
      // keyboard users continue from the offer itself, without moving the page
      doc.querySelector('main .offer a[href]')?.focus({ preventScroll: true });
    });
    const status = doc.createElement('div');
    status.className = 'offer-notice-status';
    status.setAttribute('role', 'status');
    doc.body.append(notice, status);
  }
  notice.querySelector('.offer-notice-title').textContent = offer.title;
  const condition = notice.querySelector('.offer-notice-condition');
  condition.textContent = offer.condition;
  condition.hidden = !offer.condition;
  const cta = notice.querySelector('.offer-notice-cta');
  const link = cta.querySelector('a');
  link.textContent = offer.label;
  if (rawHref) link.setAttribute('href', rawHref);
  cta.hidden = !(offer.label && rawHref);
  notice.dataset.count = String(Number(notice.dataset.count || 0) + 1);
  notice.hidden = false;
  doc.querySelector('.offer-notice-status').textContent = `Oferta atualizada: ${offer.title}${offer.condition ? `. ${offer.condition}` : ''}`;
  return notice;
}

const watchers = new Map();

/**
 * Starts watching an offer fragment for a page. One watcher per page and path.
 * @param {Object} options
 * @param {Element} options.block Fragment block holding the rendered offer
 * @param {string} options.path Fragment path, e.g. /fragments/oferta
 * @param {string} options.baselineHtml Markup that was rendered on load
 * @param {Window} options.win Page window (location, timers, events)
 * @param {Document} options.doc Page document
 * @param {Function} options.render html => Promise<Element> decorated fragment root
 * @param {Function} [options.fetch] Fetch implementation (defaults to win.fetch)
 * @param {number} [options.interval] Poll interval in ms
 * @returns {{check: Function, stop: Function}} Controller
 */
export function watchOffer({
  block, path, baselineHtml, win, doc, render,
  fetch = (...args) => win.fetch(...args),
  interval = POLL_INTERVAL,
  schedule = (fn, ms) => win.setTimeout(fn, ms),
  cancel = (id) => win.clearTimeout(id),
}) {
  const key = `${path}`;
  const existing = watchers.get(doc)?.get(key);
  if (existing) {
    existing.blocks.add(block);
    return existing.controller;
  }

  // Always the fragment on the page's own origin: a Live tab reads Live only.
  const url = new URL(`${path}.plain.html`, win.location.href).href;
  const parse = (html) => {
    const container = doc.createElement('div');
    container.innerHTML = html;
    return container;
  };

  const blocks = new Set([block]);
  const baselineRoot = parse(baselineHtml);
  let current = extractOffer(baselineRoot, win.location.href);
  let timer = null;
  let inFlight = false;
  let failures = 0;
  let stopped = false;

  const nextDelay = () => Math.min(interval * (2 ** failures), MAX_BACKOFF);

  async function swap(html) {
    await Promise.all([...blocks].map(async (target) => {
      const before = target.getBoundingClientRect?.();
      const scrollY = win.scrollY || 0;
      const focusClass = target.contains(doc.activeElement) ? doc.activeElement.className : null;
      const fresh = await render(html);
      target.replaceChildren(...fresh.childNodes);
      const after = target.getBoundingClientRect?.();
      // keep the reader where they were when the offer sits above the viewport
      if (before && after && before.bottom <= 0 && after.height !== before.height) {
        win.scrollTo?.(0, scrollY + (after.height - before.height));
      }
      if (focusClass) target.querySelector(`.${focusClass.split(' ').join('.')}`)?.focus({ preventScroll: true });
    }));
  }

  async function check() {
    if (stopped || inFlight || doc.visibilityState === 'hidden') return;
    inFlight = true;
    try {
      const resp = await fetch(url, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const root = parse(html);
      const offer = extractOffer(root, win.location.href);
      if (!offer) throw new Error('fragment without offer');
      failures = 0;
      if (!sameOffer(offer, current)) {
        await swap(html);
        current = offer;
        const rawHref = root.querySelector('.offer')?.children[2]?.querySelector('a')?.getAttribute('href');
        showOfferNotice(doc, offer, rawHref);
      }
    } catch {
      failures += 1;
    } finally {
      inFlight = false;
    }
  }

  function loop() {
    cancel(timer);
    timer = null;
    if (stopped || doc.visibilityState === 'hidden') return;
    timer = schedule(async () => {
      await check();
      loop();
    }, nextDelay());
  }

  const resume = () => {
    if (doc.visibilityState === 'hidden') {
      cancel(timer);
      timer = null;
      return;
    }
    check().then(loop);
  };
  const onShow = (event) => { if (event.persisted) resume(); };
  doc.addEventListener('visibilitychange', resume);
  win.addEventListener('pageshow', onShow);

  const controller = {
    check,
    get offer() { return current; },
    stop() {
      stopped = true;
      cancel(timer);
      doc.removeEventListener('visibilitychange', resume);
      win.removeEventListener('pageshow', onShow);
      watchers.get(doc)?.delete(key);
    },
  };
  if (!watchers.has(doc)) watchers.set(doc, new Map());
  watchers.get(doc).set(key, { blocks, controller });
  loop();
  return controller;
}
