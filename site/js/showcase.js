// Project showcase: accessible tabs (click, arrow keys, links from the strip) and the Cubamii phone carousel.

export function initShowcase({ reduceMotion }) {
  const root = document.querySelector('[data-showcase]');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => {
    const p = document.getElementById(t.getAttribute('aria-controls'));
    if (!p) throw new Error(`showcase: panel for #${t.id} not found`);
    return p;
  });

  const select = (i, focus = false) => {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
  };

  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  root.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const cur = tabs.indexOf(document.activeElement);
    if (cur < 0) return;
    const next = { ArrowDown: cur + 1, ArrowRight: cur + 1, ArrowUp: cur - 1, ArrowLeft: cur - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select((next + tabs.length) % tabs.length, true);
  });
  window.addEventListener('showcase:open', (e) => {
    const i = tabs.findIndex((t) => t.dataset.tab === e.detail);
    if (i >= 0) select(i);
  });

  const phones = root.querySelector('[data-phones]');
  if (phones) initPhones(phones, reduceMotion);
}

// five screenshots on a circle: the active one in front, its neighbours fanned out behind
function initPhones(root, reduceMotion) {
  const items = [...root.querySelectorAll('.phone')];
  const ui = root.closest('.panel-visual');
  const cap = ui.querySelector('[data-phones-cap]');
  const n = items.length;
  let active = 0, auto = null, dragX = null, dragged = false;

  const render = () => {
    items.forEach((p, i) => {
      let o = (((i - active) % n) + n) % n;
      if (o > n / 2) o -= n;
      p.dataset.o = o;
      p.style.setProperty('--o', o);
      p.style.setProperty('--a', Math.abs(o));
      p.setAttribute('aria-hidden', String(o !== 0));
    });
    cap.textContent = items[active].dataset.caption;
  };
  const go = (to, byUser = true) => {
    if (byUser) stopAuto();
    active = ((to % n) + n) % n;
    render();
  };

  ui.querySelector('[data-phones-prev]').addEventListener('click', () => go(active - 1));
  ui.querySelector('[data-phones-next]').addEventListener('click', () => go(active + 1));
  items.forEach((p, i) => p.addEventListener('click', () => { if (!dragged && i !== active) go(i); }));

  root.addEventListener('pointerdown', (e) => { dragX = e.clientX; dragged = false; });
  root.addEventListener('pointerup', (e) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX; dragX = null;
    if (Math.abs(dx) > 45) { dragged = true; go(active + (dx < 0 ? 1 : -1)); }
  });
  root.addEventListener('pointercancel', () => { dragX = null; });

  // a gentle auto-advance while the phones are on screen, until the visitor takes over
  const stopAuto = () => { clearInterval(auto); auto = null; };
  if (!reduceMotion && 'IntersectionObserver' in window) {
    let wanted = true;
    new IntersectionObserver(([e]) => {
      stopAuto();
      if (e.isIntersecting && wanted) auto = setInterval(() => go(active + 1, false), 4800);
    }, { threshold: 0.5 }).observe(root);
    ui.addEventListener('pointerenter', () => { stopAuto(); wanted = false; });
  }
  render();
}
