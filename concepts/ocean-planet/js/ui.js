// General page behaviour: header state, mobile menu, scroll reveal, the travelling dot
// beside the principles and magnetic buttons.

export function initUI({ reduceMotion }) {
  header();
  menu();
  reveal(reduceMotion);
  principles();
  if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) magnetic();
}

// header turns into a frosted bar once the page has moved
function header() {
  const head = document.getElementById('head');
  const update = () => head.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', update, { passive: true });
  update();
}

// a modal <dialog> brings focus trap, Escape and inert background with it
function menu() {
  const dialog = document.getElementById('menu');
  document.getElementById('menuBtn').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', (e) => { if (e.target.closest('a, [data-close]')) dialog.close(); });
}

// content stays visible without JS (the hidden state only exists under .js)
function reveal(reduceMotion) {
  const items = document.querySelectorAll('.reveal');
  if (reduceMotion) { items.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
}

// the dot runs down the line with the scroll position, the principle it has reached is lit
function principles() {
  const list = document.querySelector('[data-principles]');
  const items = [...list.children];
  let queued = false;
  const update = () => {
    queued = false;
    const focus = innerHeight * 0.55;
    const rect = list.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (focus - rect.top) / rect.height));
    let current = items[0];
    for (const item of items) if (item.getBoundingClientRect().top <= focus) current = item;
    list.style.setProperty('--p', p.toFixed(4));
    list.classList.toggle('is-tracking', p > 0 && p < 1);
    items.forEach((item) => item.classList.toggle('is-current', item === current));
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) addEventListener('scroll', onScroll, { passive: true });
    else removeEventListener('scroll', onScroll);
    update();
  }).observe(list);
}

// buttons lean a few pixels towards the cursor
function magnetic() {
  for (const el of document.querySelectorAll('.magnetic')) {
    let raf = 0;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    const step = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      const moving = Math.abs(tx - x) + Math.abs(ty - y) > 0.05;
      el.style.transform = moving || tx || ty ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` : '';
      raf = moving ? requestAnimationFrame(step) : 0;
    };
    const aim = (nx, ny) => { tx = nx; ty = ny; if (!raf) raf = requestAnimationFrame(step); };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      aim((e.clientX - r.left - r.width / 2) * 0.22, (e.clientY - r.top - r.height / 2) * 0.3);
    });
    el.addEventListener('pointerleave', () => aim(0, 0));
  }
}
