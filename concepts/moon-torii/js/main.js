// Entry point of the "Moon Torii" hero: starts the scene and wires the mobile menu.

import { createScene } from './scene.js';

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!createScene(document.getElementById('scene'), { reduceMotion })) {
  // no WebGL2 on this device: the page keeps its plain background
  console.warn('WebGL2 is not available, the scene is not drawn.');
}

// ---- mobile menu: a modal <dialog> brings focus trap, Escape and inert background with it
const menu = document.getElementById('menu');
document.getElementById('menuBtn').addEventListener('click', () => menu.showModal());
menu.addEventListener('click', (e) => { if (e.target.closest('a, [data-close]')) menu.close(); });

// the text comes in once its font is there (or after a short wait on a slow connection)
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 1500))]).then(() => root.classList.add('is-ready'));
