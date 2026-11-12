// Page behaviour entry point: wires the small modules together. Plain ES modules, no dependencies.
// The interactive hero lives in hero.js and is loaded separately.
import { initUI } from './ui.js';
import { initPetals } from './petals.js';
import { initShowcase } from './showcase.js';
import { initProcess } from './process.js';
import { initWaves } from './waves.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The hero is what the visitor waits for: the petals, two full-window canvases, start once it is on screen
// (hero.js sets data-hero and fires hero:done; a hero that never answers does not hold them back for good).
const HERO_WAIT = 4000;
const heroDone = () => new Promise((resolve) => {
  if (document.documentElement.dataset.hero) { resolve(); return; }
  document.addEventListener('hero:done', resolve, { once: true });
  setTimeout(resolve, HERO_WAIT);
});

let petals = { burst() {} };
heroDone().then(() => { petals = initPetals({ reduceMotion }); });

initUI({ reduceMotion, petals: { burst: (...args) => petals.burst(...args) } });
initShowcase({ reduceMotion });
initProcess({ reduceMotion });
initWaves();
