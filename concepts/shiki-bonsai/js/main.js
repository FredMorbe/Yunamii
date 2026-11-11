// Entry point of the "Shiki Bonsai" hero: grows a tree from a number, places it on the page
// and wires the seasons, the theme switch and the menu.

import { growBonsai } from './grow.js';
import { createTree } from './tree.js';

const THEME_KEY = 'yunamii-theme';
const PAGE = { dark: '#0d1016', light: '#f3efe6' };

const root = document.documentElement;
const hero = document.getElementById('hero');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the tree starts in the season of the visitor's calendar (northern hemisphere): 0 spring .. 3 winter
const month = new Date().getMonth();
const season = month >= 2 && month <= 4 ? 0 : month >= 5 && month <= 7 ? 1 : month >= 8 && month <= 10 ? 2 : 3;
const leafBudget = Math.min(innerWidth, innerHeight) < 700 ? 45000 : 90000;

const tree = createTree(document.getElementById('tree'), { theme: root.dataset.theme, season, reduceMotion });
if (!tree) {
  // no WebGL2 on this device: sun or moon and the empty table stay
  console.warn('WebGL2 is not available, the bonsai is not drawn.');
}

// ---- a new tree from a new number
const treeNo = document.getElementById('treeNo');
const treeFacts = document.getElementById('treeFacts');
function plant() {
  const seed = 1 + Math.floor(Math.random() * 9999);
  const grown = growBonsai(seed, leafBudget);
  treeNo.textContent = String(seed).padStart(4, '0');
  treeFacts.textContent = `Moyogi · ${grown.branches} Äste · ${leafBudget.toLocaleString('de-DE')} Blätter`;
  tree?.plant(grown);
}
plant();
document.getElementById('regrow').addEventListener('click', plant);

// ---- layout: the pot stands on the table line, sun or moon behind the crown
function place() {
  const frame = hero.getBoundingClientRect();
  const narrow = frame.width < 760;
  const scale = narrow ? Math.min(frame.width * 0.62, frame.height * 0.29) : Math.min(frame.height * 0.58, frame.width * 0.33);
  const x = frame.width * (narrow ? 0.56 : 0.73);
  const y = narrow ? frame.height - 172 : frame.height * 0.86;   // on a phone the tree stands just above the controls
  hero.style.setProperty('--tx', `${x.toFixed(1)}px`);
  hero.style.setProperty('--ty', `${y.toFixed(1)}px`);
  hero.style.setProperty('--ts', `${scale.toFixed(1)}px`);
  tree?.setLayout({ x, y, scale });
}
place();
new ResizeObserver(place).observe(hero);

// ---- seasons
const seasonButtons = [...document.querySelectorAll('#seasons button')];
function setSeason(index) {
  seasonButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  tree?.setSeason(index);
}
seasonButtons.forEach((button, i) => button.addEventListener('click', () => setSeason(i)));
setSeason(season);

// a click on the open hero shakes the tree
hero.addEventListener('click', (e) => { if (!e.target.closest('a, button')) tree?.shake(); });

// ---- theme: stored choice, otherwise the system setting (see the inline script in <head>)
const toggle = document.getElementById('themeToggle');
const themeColor = document.querySelector('meta[name="theme-color"]');
const disc = hero.querySelector('.disc');
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeColor.content = PAGE[theme];
  toggle.setAttribute('aria-checked', String(theme === 'dark'));
  tree?.setTheme(theme);
}
applyTheme(root.dataset.theme);

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
  if (reduceMotion || !document.startViewTransition) { applyTheme(next); return; }

  // day and night change places as a circle that opens from the sun or the moon
  const rect = disc.getBoundingClientRect();
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
