// Behaviour of the page below the hero: wires the small modules together. Plain ES modules, no
// dependencies. The hero (scene, pickers, colour scheme, menu) lives in main.js and is loaded separately.
import { initUI } from './ui.js';
import { initShowcase } from './showcase.js';
import { initProcess } from './process.js';
import { initRipples } from './ripples.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

initUI({ reduceMotion });
initShowcase({ reduceMotion });
initProcess({ reduceMotion });
initRipples();
