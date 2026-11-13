// Page behaviour of the Ahorn Bonsai concept: colour scheme, menu, the products dropdown, a few leaves drifting
// across the hero, and the fade-in once the scene is drawn. The scene itself is js/scene.js.
import './scene.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- colour scheme: light is the design, dark the same page at night; the choice is stored ----------------------------
const KEY = 'yunamii-ahorn-theme';
const PAGE = { light: '#f6ebe3', dark: '#15151b' };
const toggle = document.getElementById('themeToggle');
const themeMeta = document.querySelector('meta[name="theme-color"]');

function apply(theme) {
  root.dataset.theme = theme;
  themeMeta.content = PAGE[theme];
  toggle.setAttribute('aria-checked', String(theme === 'dark'));
  document.dispatchEvent(new Event('themechange')); // the canvases carry the colours of the scheme
}
toggle.setAttribute('aria-checked', String(root.dataset.theme === 'dark'));
themeMeta.content = PAGE[root.dataset.theme];
toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
  if (reduceMotion || !document.startViewTransition) { apply(next); return; }
  document.startViewTransition(() => apply(next));
});

// ---- the products dropdown ------------------------------------------------------------------------------------------------
const drop = document.getElementById('navDrop');
const dropBtn = document.getElementById('dropBtn');
let closeTimer = 0;
function setDrop(open) {
  clearTimeout(closeTimer);
  drop.classList.toggle('is-open', open);
  dropBtn.setAttribute('aria-expanded', String(open));
}
dropBtn.addEventListener('click', () => setDrop(!drop.classList.contains('is-open')));
drop.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setDrop(true); });
drop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') closeTimer = setTimeout(() => setDrop(false), 160); });
drop.addEventListener('focusout', (e) => { if (!drop.contains(e.relatedTarget)) setDrop(false); });
document.addEventListener('pointerdown', (e) => { if (!drop.contains(e.target)) setDrop(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drop.classList.contains('is-open')) { setDrop(false); dropBtn.focus(); } });

// ---- the menu on narrow screens -----------------------------------------------------------------------------------------------
const menu = document.getElementById('menu');
document.getElementById('menuBtn').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', (e) => { if (e.target.closest('[data-close], a')) menu.close(); });

// ---- leaves drifting across the hero: a few, slowly, tumbling as they go (all in CSS) ------------------------------------
const drift = document.getElementById('drift');
if (!reduceMotion) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 7; i++) {
    const fall = document.createElement('div'), sway = document.createElement('div'), img = document.createElement('img');
    fall.className = 'fall'; sway.className = 'sway';
    img.src = `assets/scene/leaves/leaf${1 + Math.floor(Math.random() * 6)}.webp`; img.alt = ''; img.decoding = 'async';
    const t = rnd(30, 52);
    fall.style.cssText = `--x:${rnd(2, 96).toFixed(1)}%;--t:${t.toFixed(1)}s;--d:${(-rnd(0, t)).toFixed(1)}s;--dx:${rnd(-10, 16).toFixed(1)}vw`;
    sway.style.cssText = `--sw:${rnd(18, 54).toFixed(0)}px;--ts:${rnd(3.5, 6.5).toFixed(1)}s;--d:${(-rnd(0, 6)).toFixed(1)}s`;
    img.style.cssText = `--w:${rnd(22, 44).toFixed(0)}px;--tt:${rnd(3, 5.5).toFixed(1)}s;--d:${(-rnd(0, 5)).toFixed(1)}s;--r0:${rnd(-180, 0).toFixed(0)}deg;--r1:${rnd(0, 180).toFixed(0)}deg`;
    sway.append(img); fall.append(sway); drift.append(fall);
  }
}

// ---- fade-in: the page appears once the scene is drawn (or after a moment, whatever happens to the scene) ------------------
let ready = false;
function show() {
  if (ready) return;
  ready = true;
  root.classList.add('is-ready');
}
if (root.dataset.hero) show();
document.addEventListener('hero:done', show);
setTimeout(show, 4500);
