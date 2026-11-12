// Entry point of the "Moon Torii" hero: starts the scene and wires the two pickers (the planet, and
// the way the sun moves), the switch between night and day, and the mobile menu.

import { createScene, PLANETS, SUN_MODES } from './scene.js';
import { createPicker } from './picker.js';
import { initTheme } from './theme.js';

const PLANET_KEY = 'yunamii-planet';
const SUN_KEY = 'yunamii-sun';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the body in the sky: Mars, unless the visitor has chosen another one before
let planet = 'mars';
try {
  const saved = localStorage.getItem(PLANET_KEY);
  if (PLANETS.includes(saved)) planet = saved;
} catch { /* storage blocked: it is Mars */ }

// the sun follows the mouse, unless the visitor has chosen another way before
let sunMode = SUN_MODES[0];
try {
  const saved = localStorage.getItem(SUN_KEY);
  if (SUN_MODES.includes(saved)) sunMode = saved;
} catch { /* storage blocked: it follows the mouse */ }

// An eclipse that begins in the light scheme turns the page dark for its length, and its end brings the
// light back. One that begins in the dark scheme leaves it alone. Using the switch in between is the
// visitor's own choice: the page does not go back on it.
// The page changes its scheme as slowly as the eclipse comes in and goes out (see scene.js).
const ECLIPSE_IN = 3.5;
const ECLIPSE_OUT = 5;
let theme = null;
let restoreLight = false;

// a click on the water drops a ring, except on links, text and the controls
const scene = createScene(document.getElementById('scene'), {
  reduceMotion,
  solid: 'a, button, .eyebrow, .title, .lead, .hero-controls',
  planet,
  sunMode,
  theme: root.dataset.theme,
  onEclipse(on) {
    if (on && theme.current() === 'light') {
      restoreLight = true;
      theme.set('dark', ECLIPSE_IN);
    } else if (!on && restoreLight) {
      restoreLight = false;
      theme.set('light', ECLIPSE_OUT);
    }
  },
});

// light or dark: the inline script in <head> has set data-theme; the new scheme spreads from the planet
// while it is on screen, otherwise from the switch
theme = initTheme({
  reduceMotion,
  origin(toggle) {
    const body = scene && scene.bodyPosition();
    if (body && body.y > 0 && body.y < innerHeight) return body;
    const rect = toggle.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  },
  onChange(name) { if (scene) scene.setTheme(name); },
  onToggle() { restoreLight = false; },
});

if (scene) {
  const remember = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: the choice lasts for this page view */ }
  };
  createPicker(document.getElementById('planet'), {
    initial: planet,
    onChange(id) {
      scene.setPlanet(id);
      remember(PLANET_KEY, id);
    },
  });
  createPicker(document.getElementById('sunPick'), {
    initial: sunMode,
    onChange(mode) {
      scene.setSunMode(mode);
      remember(SUN_KEY, mode);
    },
  });
  // with reduced motion the light stays where it is, so there is nothing to choose for the sun
  if (reduceMotion) document.getElementById('sunPick').hidden = true;
} else {
  // no WebGL2 on this device: the page keeps its plain background, and there is nothing to choose
  document.getElementById('controls').hidden = true;
  console.warn('WebGL2 is not available, the scene is not drawn.');
}

// ---- mobile menu: a modal <dialog> brings focus trap, Escape and inert background with it
const menu = document.getElementById('menu');
document.getElementById('menuBtn').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', (e) => { if (e.target.closest('a, [data-close]')) menu.close(); });

// the text comes in once its font is there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
