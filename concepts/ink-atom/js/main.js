// Entry point of the "Ink Atom" hero: samples the orbitals, starts the atom around the
// headline's full stop and wires the theme switch, the orbital buttons and the menu.

import { scatter, sampleOrbital } from './orbital.js';
import { createAtom } from './atom.js';

// the orbitals the cloud moves through; all are real hydrogen states
const ORBITALS = [
  { name: '2p', n: 2, l: 1, m: 0 },
  { name: '3d', n: 3, l: 2, m: 0 },
  { name: '4f', n: 4, l: 3, m: 0 },
  { name: '4d', n: 4, l: 2, m: 2 },
];
const START = 1;
const AUTO_SECONDS = 12;          // the cloud changes on its own ...
const AUTO_AFTER_CHOICE = 28;     // ... and waits longer after a choice by hand
const THEME_KEY = 'yunamii-theme';
const PAGE = { dark: '#070d16', light: '#f8fafc' };

const root = document.documentElement;
const hero = document.getElementById('hero');
const nucleus = document.getElementById('nucleus');
const title = document.getElementById('heroTitle');
const lead = hero.querySelector('.lead');
const cta = hero.querySelector('.cta');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- the cloud: fewer points on small screens, each orbital sampled when it is first needed
const { quantiles, seeds } = scatter(Math.min(innerWidth, innerHeight) < 700 ? 60000 : 120000);
const cache = new Map();
function clouds(key) {
  if (!cache.has(key)) {
    if (key === 'origin') {
      // the atom folded into its nucleus: same directions as the first orbital, radius zero
      const folded = clouds(START).slice();
      for (let i = 0; i < folded.length; i += 3) folded[i] = 0;
      cache.set(key, folded);
    } else {
      cache.set(key, sampleOrbital(ORBITALS[key], quantiles));
    }
  }
  return cache.get(key);
}

const atom = createAtom(document.getElementById('atom'), { seeds, clouds, start: START, theme: root.dataset.theme, reduceMotion });
if (!atom) {
  // no WebGL2 on this device: the halo and the full stop stay, the cloud is left out
  console.warn('WebGL2 is not available, the electron cloud is not drawn.');
}

// ---- layout: the atom is centred on the headline's full stop
function place() {
  const frame = hero.getBoundingClientRect();
  const dot = nucleus.getBoundingClientRect();
  // a box around the given elements, relative to the hero
  const box = (...elements) => {
    const rects = elements.map((el) => el.getBoundingClientRect());
    return [
      Math.min(...rects.map((r) => r.left)) - frame.left, Math.min(...rects.map((r) => r.top)) - frame.top,
      Math.max(...rects.map((r) => r.right)) - frame.left, Math.max(...rects.map((r) => r.bottom)) - frame.top,
    ];
  };
  const x = dot.left + dot.width / 2 - frame.left;
  const y = dot.top + dot.height / 2 - frame.top;
  hero.style.setProperty('--nx', `${x.toFixed(1)}px`);
  hero.style.setProperty('--ny', `${y.toFixed(1)}px`);
  atom?.setLayout({
    x,
    y,
    radius: frame.width < 760 ? Math.min(frame.width * 0.5, frame.height * 0.3) : Math.min(frame.height * 0.38, frame.width * 0.27),
    text: box(title),
    copy: box(lead, cta),
  });
}
place();
// the hero resizes with the window, the headline when its font arrives
const resized = new ResizeObserver(place);
resized.observe(hero);
resized.observe(title);

// ---- orbitals
const stateName = document.getElementById('stateName');
const stateNumbers = document.getElementById('stateNumbers');
const stateSet = document.getElementById('stateSet');
let current = START;
let timer = 0;

const buttons = ORBITALS.map((orbital, i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = orbital.name;
  button.addEventListener('click', () => select(i, AUTO_AFTER_CHOICE));
  stateSet.append(button);
  return button;
});

function select(index, pause) {
  current = index;
  const { name, n, l, m } = ORBITALS[index];
  stateName.textContent = name;
  stateNumbers.textContent = `n ${n} · l ${l} · m ${m}`;
  buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  atom?.setState(index);
  if (reduceMotion || !atom) return;
  clearTimeout(timer);
  timer = setTimeout(() => select((current + 1) % ORBITALS.length, AUTO_SECONDS), pause * 1000);
}
select(START, AUTO_SECONDS);

// a click on the open hero moves on to the next orbital
hero.addEventListener('click', (e) => {
  if (!e.target.closest('a, button')) select((current + 1) % ORBITALS.length, AUTO_AFTER_CHOICE);
});

// the remaining orbitals are sampled while the page is idle, so a morph never waits for them
const idle = window.requestIdleCallback ?? ((run) => setTimeout(run, 200));
ORBITALS.forEach((_, i) => idle(() => clouds(i)));

// ---- theme: stored choice, otherwise the system setting (see the inline script in <head>)
const toggle = document.getElementById('themeToggle');
const themeColor = document.querySelector('meta[name="theme-color"]');
function applyTheme(theme) {
  root.dataset.theme = theme;
  themeColor.content = PAGE[theme];
  toggle.setAttribute('aria-checked', String(theme === 'dark'));
  atom?.setTheme(theme);
}
applyTheme(root.dataset.theme);

toggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: the choice lasts for this page view */ }
  if (reduceMotion || !document.startViewTransition) { applyTheme(next); return; }

  // the new scheme opens as a circle from the nucleus
  const dot = nucleus.getBoundingClientRect();
  const x = dot.left + dot.width / 2;
  const y = dot.top + dot.height / 2;
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

// the text fades in once its fonts are there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
