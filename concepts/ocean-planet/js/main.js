// Entry point: starts the hero scene, then the page behaviour around it.

import { createOcean } from './scene/ocean.js';
import { initTheme } from './theme.js';
import { initUI } from './ui.js';
import { initProducts } from './products.js';
import { initPlanet } from './planet.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ocean = createOcean(document.getElementById('scene'), { theme: root.dataset.theme, reduceMotion });
if (!ocean) {
  // no WebGL2 on this device: the CSS sky behind the canvas stays visible instead
  console.warn('WebGL2 is not available, the hero scene is replaced by its static backdrop.');
  document.getElementById('hero').classList.add('no-gl');
}

const planet = initPlanet({ reduceMotion });

initTheme({
  reduceMotion,
  // the new scheme spreads from the sun while it is on screen, otherwise from the switch
  origin(toggle) {
    const sun = ocean?.sunPosition();
    if (sun && sun.y > 0 && sun.y < innerHeight) return sun;
    const rect = toggle.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  },
  onChange(theme) {
    ocean?.setTheme(theme);
    planet.setTheme();
  },
});

initUI({ reduceMotion });
initProducts({ reduceMotion });

// the headline rises once its fonts are there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
