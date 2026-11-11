// General page behaviour: mobile menu, header state, scroll reveal, section index, parallax,
// pointer effects (glow, tilt, magnetic buttons) and replayable seals.

export function initUI({ reduceMotion, petals }) {
  menu();
  header();
  reveal(reduceMotion);
  sectionIndex();
  parallax(reduceMotion);
  tabLinks();
  stamps(petals);
  if (matchMedia('(hover: hover)').matches) {
    glow();
    if (!reduceMotion) { tilt(); magnetic(); }
  }
}

function menu() {
  const overlay = document.getElementById('mobileOverlay');
  const btn = document.getElementById('menuBtn');
  if (!overlay || !btn) return;
  const set = (open) => {
    overlay.classList.toggle('open', open);
    overlay.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  btn.addEventListener('click', () => set(true));
  document.getElementById('closeMenu').addEventListener('click', () => set(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

// header turns into a frosted bar once the page has moved
function header() {
  const head = document.getElementById('head');
  if (!head) return;
  const update = () => head.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', update, { passive: true });
  update();
}

// content stays visible without JS (the hidden state is only applied under .js)
function reveal(reduceMotion) {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion) { items.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
}

// kanji numerals on the right edge follow the section in the middle of the viewport
function sectionIndex() {
  const links = [...document.querySelectorAll('.spy a[data-spy]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map();
  for (const a of links) {
    const id = a.dataset.spy === 'top' ? 'hero' : a.dataset.spy;
    const el = document.getElementById(id);
    if (!el) throw new Error(`section index: #${id} not found`);
    byId.set(el, a);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle('is-active', a === byId.get(e.target)));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  byId.forEach((_, el) => io.observe(el));
}

// elements with data-parallax drift against the scroll (positive = faster, negative = slower than the page)
function parallax(reduceMotion) {
  const els = [...document.querySelectorAll('[data-parallax]')];
  if (reduceMotion || !els.length) return;
  let queued = false;
  const update = () => {
    queued = false;
    const h = innerHeight;
    for (const el of els) {
      const host = el.parentElement.getBoundingClientRect(); // the parent's box is not moved by our own transform
      if (host.bottom < -300 || host.top > h + 300) continue;
      const off = (host.top + host.height / 2 - h / 2) * parseFloat(el.dataset.parallax);
      el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
    }
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
}

// "Games" / "Products" in the strip open the matching project tab
function tabLinks() {
  document.querySelectorAll('a[data-tab]').forEach((a) => {
    a.addEventListener('click', () => window.dispatchEvent(new CustomEvent('showcase:open', { detail: a.dataset.tab })));
  });
}

function glow() {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest('[data-glow]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

// product visuals lean towards the pointer
function tilt() {
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
      el.classList.add('is-tilting');
    });
    el.addEventListener('pointerleave', () => {
      el.style.removeProperty('--ry'); el.style.removeProperty('--rx');
      el.classList.remove('is-tilting');
    });
  });
}

// primary buttons are pulled a few pixels towards the pointer
function magnetic() {
  const els = [...document.querySelectorAll('.magnetic')];
  addEventListener('pointermove', (e) => {
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy), reach = Math.max(r.width, r.height) * 0.9;
      if (d < reach) {
        const k = (1 - d / reach) * 0.28;
        el.style.translate = `${(dx * k).toFixed(1)}px ${(dy * k).toFixed(1)}px`;
      } else if (el.style.translate) el.style.translate = '';
    }
  }, { passive: true });
}

// click a large seal: it is stamped again, with a few petals
function stamps(petals) {
  document.querySelectorAll('.hanko--lg').forEach((el) => {
    el.addEventListener('click', () => {
      el.style.animation = 'none';
      void el.offsetWidth; // restart the stamp keyframes
      el.style.animation = '';
      const r = el.getBoundingClientRect();
      petals.burst(r.left + r.width / 2, r.top + r.height / 2, 7);
    });
  });
}
