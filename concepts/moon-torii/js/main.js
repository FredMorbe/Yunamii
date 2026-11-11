// Entry point of the "Moon Torii" hero: starts the scene and wires the planet picker and the mobile menu.

import { createScene, PLANETS } from './scene.js';
import { createPicker } from './picker.js';

const PLANET_KEY = 'yunamii-planet';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the body in the sky: the moon, unless the visitor has chosen another one before
let planet = PLANETS[0];
try {
  const saved = localStorage.getItem(PLANET_KEY);
  if (PLANETS.includes(saved)) planet = saved;
} catch { /* storage blocked: it is the moon */ }

// a click on the water drops a ring, except on links, text and the picker
const scene = createScene(document.getElementById('scene'), { reduceMotion, solid: 'a, button, .eyebrow, .title, .lead, .planet', planet });
const picker = document.getElementById('planet');
if (scene) {
  createPicker(picker, {
    initial: planet,
    onChange(id) {
      scene.setPlanet(id);
      try { localStorage.setItem(PLANET_KEY, id); } catch { /* storage blocked: the choice lasts for this page view */ }
    },
  });
} else {
  // no WebGL2 on this device: the page keeps its plain background, and there is nothing to choose
  picker.hidden = true;
  console.warn('WebGL2 is not available, the scene is not drawn.');
}

// ---- mobile menu: a modal <dialog> brings focus trap, Escape and inert background with it
const menu = document.getElementById('menu');
document.getElementById('menuBtn').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', (e) => { if (e.target.closest('a, [data-close]')) menu.close(); });

// the text comes in once its font is there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
