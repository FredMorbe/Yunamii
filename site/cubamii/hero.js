// Hero of the Cubamii product page: the main page's code-drawn backdrop (js/backdrop.js: sky, window light, water, shimmer, ripples)
// with the game's own 7x7x7 block in front of it instead of the bonsai. The block is the interactive cube of cube.js (three.js,
// bundled by tools/cubamii-cube, ~480 kB, loaded here and not before): it can be dragged round at any time and chiselled once.
// Like js/hero.js this tells the page when it is on screen (data-hero on <html>, 'hero:done'), so the petals wait for it.

import { makeBackdrop, makeShimmer } from '../js/backdrop.js';

const hero = document.getElementById('hero');
const bgc = document.getElementById('bg');
const fxc = document.getElementById('bg-fx');
const wrap = document.getElementById('cubeWrap');
const canvas = document.getElementById('cube');
const button = document.getElementById('carve');
const caption = document.getElementById('cubeCaption');
if (!hero || !bgc || !fxc || !wrap || !canvas || !button || !caption) throw new Error('cubamii hero: markup is incomplete');

const bgx = bgc.getContext('2d');
const fxx = fxc.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WIDE = 900;

let heroDone = false;
function markHero(state) {
  if (heroDone) return;
  heroDone = true;
  document.documentElement.dataset.hero = state;
  document.dispatchEvent(new Event('hero:done'));
}

// ---- backdrop: drawn once per layout, only the water below the horizon moves ----
let shimmer = [], bgInfo = null;

function buildBackdrop() {
  const vw = hero.clientWidth, vh = hero.clientHeight;
  if (!vw || !vh) return;
  const wide = vw >= WIDE;
  const hr = hero.getBoundingClientRect(), cr = wrap.getBoundingClientRect();
  // the ring under the block: centred, a little below the middle of the canvas
  const ix = cr.left - hr.left + cr.width / 2, iy = cr.top - hr.top + cr.height * 0.7;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = cr.width / 1000; // css px per unit of the ripples (the bonsai's world units on the main page)
  const W = Math.round(vw * dpr), H = Math.round(vh * dpr);
  if (bgInfo && bgInfo.W === W && bgInfo.H === H && bgInfo.px === ix * dpr && bgInfo.py === iy * dpr && bgInfo.k === k * dpr) return;
  const yH = Math.max(Math.round(H * 0.15), Math.round((iy - 0.33 * vh) * dpr));
  const sd = Math.min(dpr, 1); // out of focus anyway: one pixel per css pixel
  bgc.width = Math.round(vw * sd); bgc.height = Math.round(vh * sd);
  bgx.setTransform(1, 0, 0, 1, 0, 0);
  bgx.drawImage(makeBackdrop(bgc.width, bgc.height, sd, yH * sd / dpr, wide, { x: ix * sd, y: (iy + 40 * k) * sd }), 0, 0);
  fxc.width = W; fxc.height = H - yH;
  fxc.style.top = `${yH / dpr}px`; fxc.style.height = `${(H - yH) / dpr}px`;
  shimmer = makeShimmer(W, H, dpr, yH);
  bgInfo = { W, H, yH, dpr, px: ix * dpr, py: iy * dpr, k: k * dpr };
  if (reduceMotion) drawFx(0);
}

function drawFx(t) {
  if (!bgInfo) return;
  const { px, py, k, dpr, yH, W } = bgInfo;
  fxx.setTransform(1, 0, 0, 1, 0, 0);
  fxx.clearRect(0, 0, W, fxc.height);
  fxx.setTransform(1, 0, 0, 1, 0, -yH);
  for (const s of shimmer) {
    const a = 0.03 + 0.1 * Math.max(0, Math.sin(t * s.sp + s.ph));
    fxx.fillStyle = s.pink ? `rgba(255,210,235,${a})` : `rgba(215,250,255,${a})`;
    fxx.fillRect(s.x, s.y, s.w, s.h);
  }
  fxx.lineWidth = 1.6 * dpr;
  for (let i = 0; i < 4; i++) {
    const f = reduceMotion ? 0.35 + i * 0.15 : ((t * 0.045 + i / 4) % 1);
    const r = (520 + f * 600) * k;
    fxx.strokeStyle = `rgba(215,252,255,${(0.2 * Math.sin(f * Math.PI)).toFixed(3)})`;
    fxx.beginPath(); fxx.ellipse(px, py + 40 * k, r, r * 0.17, 0, 0, Math.PI * 2); fxx.stroke();
  }
}

let visible = true, raf = 0;
function loop(now) {
  raf = 0;
  if (!visible || reduceMotion) return;
  drawFx(now / 1000);
  raf = requestAnimationFrame(loop);
}
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  if (visible && !raf && !reduceMotion) raf = requestAnimationFrame(loop);
}).observe(hero);

let rebuildTimer = 0;
addEventListener('resize', () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildBackdrop, 150); });

// ---- the block ----
const LABEL = { block: 'Chisel the block', carving: 'Carving…', done: 'Play again' };
const CAPTION = {
  block: 'A 7 × 7 × 7 block. Somewhere inside it hides a fox.',
  carving: 'Empty rows go first, then the sure cubes get their colour.',
  done: 'There it is: a voxel fox, found by pure logic.',
};
const onPhase = (phase) => {
  button.textContent = LABEL[phase];
  button.disabled = phase === 'carving';
  caption.textContent = CAPTION[phase];
};

async function start() {
  buildBackdrop();
  // the clue numbers are drawn into a texture once, so the page font has to be there first
  try { await document.fonts.load('700 40px "DM Sans"'); } catch (err) { console.warn('cubamii: DM Sans did not load, the clue numbers use the system font', err); }
  const { createCubamiiCube } = await import('./cube.js');
  const cube = createCubamiiCube(canvas, { reducedMotion: reduceMotion, onPhase });
  onPhase(cube.phase);
  button.addEventListener('click', () => cube.replay());
  // the block carves itself once if the visitor has not touched it; a drag or a click on the button takes over
  let touched = false;
  const touch = () => { touched = true; };
  canvas.addEventListener('pointerdown', touch, { once: true });
  button.addEventListener('click', touch, { once: true });
  if (!reduceMotion) setTimeout(() => { if (!touched && cube.phase === 'block') cube.replay(); }, 3600);
  // first frame is on its way: show the scene
  requestAnimationFrame(() => requestAnimationFrame(() => markHero('ready')));
  if (!raf && !reduceMotion) raf = requestAnimationFrame(loop);
}

start().catch((err) => {
  // no WebGL or the bundle did not load: the page stays usable with a screenshot in place of the block
  console.error('cubamii hero: the block could not start', err);
  hero.classList.add('hero--static');
  markHero('static');
});
