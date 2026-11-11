// Entry point of the "Gravity Lens" hero: starts the lens and wires its readout,
// the theme switch and the menu.

import { createLens } from './lens.js';

const THEME_KEY = 'yunamii-theme';
const PAGE = { dark: '#0b0c0f', light: '#f6f5f2' };

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- readout: what a point-mass lens does at the pointer, x being its distance in Einstein radii
const outR = document.getElementById('outR');
const outA = document.getElementById('outA');
const outM = document.getElementById('outM');
function probe(x) {
  const magnification = 1 / Math.abs(1 - x ** -4);
  outR.textContent = x.toFixed(2);
  outA.textContent = (1 / x).toFixed(2);                       // deflection: θ_E² / θ
  outM.textContent = magnification > 99 ? '> 99' : magnification.toFixed(2);
}

const lens = createLens(document.getElementById('lens'), { theme: root.dataset.theme, reduceMotion, onProbe: probe });
if (!lens) {
  // no WebGL2 on this device: the page keeps its plain background
  console.warn('WebGL2 is not available, the gravitational lens is not drawn.');
}

// ---- theme: stored choice, otherwise the system setting (see the inline script in <head>)
const toggle = document.getElementById('themeToggle');
const themeColor = document.querySelector('meta[name="theme-color"]');
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeColor.content = PAGE[theme];
  toggle.setAttribute('aria-checked', String(theme === 'dark'));
  lens?.setTheme(theme);
}
applyTheme(root.dataset.theme);

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
  if (reduceMotion || !document.startViewTransition || !lens) { applyTheme(next); return; }

  // the new scheme opens as a circle from the hole
  const { x, y } = lens.centre();
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add('theme-change');
  const transition = document.startViewTransition(() => applyTheme(next));
  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 1100, easing: 'cubic-bezier(.5, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }, () => { /* transition skipped (e.g. tab in the background): the theme is applied anyway */ });
  transition.finished.finally(() => root.classList.remove('theme-change'));
});

// ---- mobile menu: a modal <dialog> brings focus trap, Escape and inert background with it
const menu = document.getElementById('menu');
document.getElementById('menuBtn').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', (e) => { if (e.target.closest('a, [data-close]')) menu.close(); });

// the text comes in once its font is there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
