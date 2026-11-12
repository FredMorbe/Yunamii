// Entry point of the "Mesh Tide" hero: starts the water and wires the theme switch and the menu.

import { createTide } from './tide.js';

const THEME_KEY = 'yunamii-theme';
const PAGE = { dark: '#04070c', light: '#f8f5ef' };

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const tide = createTide(document.getElementById('tide'), { theme: root.dataset.theme, reduceMotion });
// no WebGL2 on this device: the page keeps its plain background
if (!tide) console.warn('WebGL2 is not available, the water is not drawn.');

// ---- theme: stored choice, otherwise the system setting (see the inline script in <head>)
const toggle = document.getElementById('themeToggle');
const themeColor = document.querySelector('meta[name="theme-color"]');
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeColor.content = PAGE[theme];
  toggle.setAttribute('aria-checked', String(theme === 'dark'));
  tide?.setTheme(theme);
}
applyTheme(root.dataset.theme);

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
  if (reduceMotion || !document.startViewTransition || !tide) { applyTheme(next); return; }

  // the new scheme spreads as a circle from the switch
  const rect = toggle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
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

// the text comes in once its fonts are there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
