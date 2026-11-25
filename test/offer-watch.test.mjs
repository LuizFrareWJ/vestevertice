/* global globalThis */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { watchOffer, extractOffer } from '../blocks/offer/offer-watch.js';
import decorateOffer from '../blocks/offer/offer.js';

const PREVIEW = 'https://main--vestevertice--luizfrarewj.aem.page';
const LIVE = 'https://main--vestevertice--luizfrarewj.aem.live';

const offerHtml = ({ title, label, href }) => `
<div>
  <div class="offer">
    <div><div><p>Black Friday</p><h2 id="x">${title}</h2><p>Use o cupom no carrinho.</p></div></div>
    <div><div>BLACK20</div></div>
    <div><div><a href="${href}">${label}</a></div></div>
  </div>
</div>`;

const INITIAL = offerHtml({ title: '20% em todo o site', label: 'Ver ofertas', href: '/catalogo' });
const FIXED = offerHtml({
  title: '20% em produtos selecionados', label: 'Ver produtos com desconto', href: '/produtos-participantes',
});

/* ---------------------------------------------------------------- network */
function createNetwork() {
  const origins = {
    [PREVIEW]: { html: INITIAL, fail: false },
    [LIVE]: { html: INITIAL, fail: false },
  };
  return {
    origins,
    publish(origin, html) { origins[origin].html = html; },
    fetchFor(page) {
      return async (url, options) => {
        const { origin, pathname } = new URL(url);
        page.requests.push({ origin, pathname, cache: options?.cache });
        const served = page.edge?.(origin) ?? origins[origin];
        if (!served || served.fail) throw new Error('offline');
        return { ok: true, status: 200, text: async () => served.html };
      };
    },
  };
}

/* ---------------------------------------------------------------- pages */
function withDocument(doc, fn) {
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    globalThis.document = previous;
  }
}

function openPage(network, origin, pathname) {
  const { document } = parseHTML(`<html><body><main>
    <div class="section"><div class="fragment-wrapper"><div class="fragment block"></div></div></div>
    <div class="section"><p class="rodape">Marca fictícia</p></div>
  </main></body></html>`);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });

  const listeners = {};
  const page = {
    document,
    requests: [],
    timers: new Map(),
    nextId: 1,
    win: {
      location: { href: `${origin}${pathname}` },
      scrollY: 1200,
      scrollTo() {},
      addEventListener(type, fn) { (listeners[type] ||= new Set()).add(fn); },
      removeEventListener(type, fn) { listeners[type]?.delete(fn); },
      dispatch(type, event) { listeners[type]?.forEach((fn) => fn(event)); },
    },
  };

  const render = async (html) => {
    const main = document.createElement('main');
    main.innerHTML = html;
    main.querySelectorAll('.offer').forEach((block) => withDocument(document, () => decorateOffer(block)));
    return main;
  };

  page.block = document.querySelector('.fragment');
  const served = network.origins[origin].html;
  return render(served).then((main) => {
    page.block.replaceChildren(...main.childNodes);
    page.controller = watchOffer({
      block: page.block,
      path: '/fragments/oferta',
      baselineHtml: served,
      win: page.win,
      doc: document,
      render,
      fetch: network.fetchFor(page),
      schedule: (fn, ms) => {
        const id = page.nextId;
        page.nextId += 1;
        page.timers.set(id, { fn, ms });
        return id;
      },
      cancel: (id) => page.timers.delete(id),
    });
    return page;
  });
}

/** Runs one poll cycle (the single pending timer) of a page. */
async function cycle(page, times = 1) {
  for (let i = 0; i < times; i += 1) {
    assert.equal(page.timers.size, 1, 'exactly one pending poll per page');
    const [[id, { fn }]] = page.timers;
    page.timers.delete(id);
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
}

const shown = (page) => ({
  title: page.block.querySelector('.offer h2')?.textContent.trim(),
  coupon: page.block.querySelector('.offer-coupon-code')?.textContent.trim(),
  label: page.block.querySelector('.offer-cta a')?.textContent.trim(),
  href: page.block.querySelector('.offer-cta a')?.getAttribute('href'),
});
const notices = (page) => Number(page.document.querySelector('.offer-notice')?.dataset.count || 0);

const SHOWN_INITIAL = {
  title: '20% em todo o site', coupon: 'BLACK20', label: 'Ver ofertas', href: '/catalogo',
};
const SHOWN_FIXED = {
  title: '20% em produtos selecionados', coupon: 'BLACK20', label: 'Ver produtos com desconto', href: '/produtos-participantes',
};

/* ---------------------------------------------------------------- demo scene */
test('Live tabs change only after Live serves the new offer, then restore', async () => {
  const network = createNetwork();
  const A = await openPage(network, LIVE, '/black-friday');
  const B = await openPage(network, LIVE, '/calcados');
  const P = await openPage(network, PREVIEW, '/black-friday');
  const publicTabs = [A, B];

  // Inicial
  publicTabs.forEach((tab) => {
    assert.deepEqual(shown(tab), SHOWN_INITIAL);
    assert.equal(notices(tab), 0);
  });

  // Editar no Author: nothing is published
  await Promise.all([A, B].map((tab) => cycle(tab, 3)));
  publicTabs.forEach((tab) => assert.equal(notices(tab), 0));

  // Publicar só em Preview
  network.publish(PREVIEW, FIXED);
  await Promise.all([A, B, P].map((tab) => cycle(tab, 3)));
  assert.deepEqual(shown(P), SHOWN_FIXED);
  publicTabs.forEach((tab) => {
    assert.deepEqual(shown(tab), SHOWN_INITIAL, 'Live tab must ignore Preview');
    assert.equal(notices(tab), 0);
    assert.ok(tab.requests.length >= 6);
    assert.ok(
      tab.requests.every((r) => r.origin === LIVE && r.pathname === '/fragments/oferta.plain.html'),
      'Live tab may only request the Live fragment',
    );
    assert.ok(tab.requests.every((r) => r.cache === 'no-cache'));
  });

  // Publicação Live confirmada, borda ainda serve o antigo
  await Promise.all(publicTabs.map((tab) => cycle(tab, 2)));
  publicTabs.forEach((tab) => assert.equal(notices(tab), 0));

  // Live passa a servir a oferta corrigida
  network.publish(LIVE, FIXED);
  await Promise.all(publicTabs.map((tab) => cycle(tab)));
  publicTabs.forEach((tab) => {
    assert.deepEqual(shown(tab), SHOWN_FIXED);
    assert.equal(notices(tab), 1);
    const notice = tab.document.querySelector('.offer-notice');
    assert.equal(notice.hidden, false);
    assert.equal(notice.querySelector('.offer-notice-title').textContent, '20% em produtos selecionados');
    assert.equal(notice.querySelector('.offer-notice-cta a').getAttribute('href'), '/produtos-participantes');
    assert.equal(tab.document.querySelector('.rodape').textContent, 'Marca fictícia', 'rest of page untouched');
  });

  // Mesma resposta por mais ciclos
  await Promise.all(publicTabs.map((tab) => cycle(tab, 4)));
  publicTabs.forEach((tab) => assert.equal(notices(tab), 1));

  // Jurado dispensa o aviso
  publicTabs.forEach((tab) => tab.document.querySelector('.offer-notice-close').click());

  // Restaurar em Preview antes do Live
  network.publish(PREVIEW, INITIAL);
  await Promise.all(publicTabs.map((tab) => cycle(tab, 3)));
  publicTabs.forEach((tab) => {
    assert.deepEqual(shown(tab), SHOWN_FIXED);
    assert.equal(notices(tab), 1);
  });

  // Live volta à original
  network.publish(LIVE, INITIAL);
  await Promise.all(publicTabs.map((tab) => cycle(tab)));
  publicTabs.forEach((tab) => {
    assert.deepEqual(shown(tab), SHOWN_INITIAL);
    assert.equal(notices(tab), 2);
    assert.equal(tab.document.querySelector('.offer-notice').hidden, false, 'restoration announced after dismissal');
  });
});

test('each phone reacts to its own response', async () => {
  const network = createNetwork();
  const A = await openPage(network, LIVE, '/black-friday');
  const B = await openPage(network, LIVE, '/calcados');
  let bEdgeStale = true;
  B.edge = (origin) => (origin === LIVE && bEdgeStale ? { html: INITIAL } : undefined);

  network.publish(LIVE, FIXED);
  await cycle(A);
  await cycle(B);
  assert.deepEqual(shown(A), SHOWN_FIXED);
  assert.deepEqual(shown(B), SHOWN_INITIAL);
  assert.equal(notices(B), 0);

  bEdgeStale = false;
  await cycle(B);
  await cycle(A);
  assert.deepEqual(shown(B), SHOWN_FIXED);
  assert.equal(notices(A), 1);
  assert.equal(notices(B), 1);
});

test('a tab opened after publication shows the current offer silently', async () => {
  const network = createNetwork();
  network.publish(LIVE, FIXED);
  const C = await openPage(network, LIVE, '/black-friday');
  await cycle(C, 3);
  assert.deepEqual(shown(C), SHOWN_FIXED);
  assert.equal(notices(C), 0);
});

test('a change of the button link alone is detected; equivalent markup is not', () => {
  const { document } = parseHTML('<div></div>');
  const read = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return JSON.stringify(extractOffer(div, `${LIVE}/black-friday`));
  };
  const base = read(INITIAL);
  assert.notEqual(read(INITIAL.replace('/catalogo', '/produtos-participantes')), base);
  assert.notEqual(read(INITIAL.replace('>Ver ofertas<', '>Ver todas as ofertas<')), base);
  const equivalent = INITIAL
    .replace('<h2 id="x">', '<h2 id="outro-id" data-aue-prop="text">')
    .replace('20% em todo o site', '  20%   em todo\n o site ')
    .replace('href="/catalogo"', `href="${LIVE}/catalogo/"`);
  assert.equal(read(equivalent), base);
  assert.equal(read(INITIAL.replace('href="/catalogo"', 'href="/catalogo.html"')), base);
});

test('network failure or invalid fragment keeps the offer and recovers once', async () => {
  const network = createNetwork();
  const A = await openPage(network, LIVE, '/black-friday');

  network.origins[LIVE].fail = true;
  await cycle(A);
  assert.equal([...A.timers.values()][0].ms, 10000, 'backs off after a failure');
  await cycle(A);
  assert.equal([...A.timers.values()][0].ms, 20000);
  assert.deepEqual(shown(A), SHOWN_INITIAL);

  network.origins[LIVE].fail = false;
  network.publish(LIVE, '<div><p>sem oferta</p></div>');
  await cycle(A);
  assert.deepEqual(shown(A), SHOWN_INITIAL, 'invalid fragment does not erase the band');
  assert.equal(notices(A), 0);

  network.publish(LIVE, FIXED);
  await cycle(A);
  assert.equal([...A.timers.values()][0].ms, 5000, 'back to normal pace');
  await cycle(A, 2);
  assert.deepEqual(shown(A), SHOWN_FIXED);
  assert.equal(notices(A), 1);
});

test('background and history return revalidate without duplicating the watcher', async () => {
  const network = createNetwork();
  const A = await openPage(network, LIVE, '/black-friday');

  A.document.visibilityState = 'hidden';
  A.document.dispatchEvent(new A.document.defaultView.Event('visibilitychange'));
  assert.equal(A.timers.size, 0, 'no polling while hidden');

  network.publish(LIVE, FIXED);
  A.document.visibilityState = 'visible';
  A.document.dispatchEvent(new A.document.defaultView.Event('visibilitychange'));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.deepEqual(shown(A), SHOWN_FIXED, 'revalidates on return');
  assert.equal(A.timers.size, 1);

  A.win.dispatch('pageshow', { persisted: true });
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(A.timers.size, 1, 'pageshow does not duplicate the loop');
  assert.equal(notices(A), 1);

  const again = watchOffer({
    block: A.block, path: '/fragments/oferta', baselineHtml: INITIAL, win: A.win, doc: A.document,
  });
  assert.equal(again, A.controller, 'one watcher per page and fragment');
});

test('copying BLACK20 still works after the offer is swapped', async () => {
  const network = createNetwork();
  const A = await openPage(network, LIVE, '/black-friday');
  network.publish(LIVE, FIXED);
  await cycle(A);

  const copied = [];
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (value) => { copied.push(value); } } },
    configurable: true,
  });
  try {
    A.block.querySelector('.offer-coupon-copy').click();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    assert.deepEqual(copied, ['BLACK20']);
    assert.match(A.block.querySelector('.offer-coupon-status').textContent, /BLACK20 copiado/);
  } finally {
    Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    A.controller.stop();
  }
});
