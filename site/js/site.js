// Page behaviour entry point: wires the small modules together. Plain ES modules, no dependencies.
// The interactive hero lives in hero.js and is loaded separately.
import { initUI } from './ui.js';
import { initPetals } from './petals.js';
import { initShowcase } from './showcase.js';
import { initProcess } from './process.js';
import { initWaves } from './waves.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const petals = initPetals({ reduceMotion });
initUI({ reduceMotion, petals });
initShowcase({ reduceMotion });
initProcess({ reduceMotion });
initWaves();
