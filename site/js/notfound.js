// The 404 page: the main page's code-drawn backdrop (js/backdrop.js: sky, window light, water, shimmer, ripples) behind the brush circle.
// Like js/hero.js it tells the page when it is on screen (data-hero on <html>, 'hero:done'), so the petals wait for it.

import { makeBackdrop, makeShimmer } from './backdrop.js';

const hero = document.getElementById('hero');
const bgc = document.getElementById('bg');
const fxc = document.getElementById('bg-fx');
const target = document.getElementById('lost');
if (!hero || !bgc || !fxc || !target) throw new Error('notfound: markup is incomplete');

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

let shimmer = [], bgInfo = null;

// drawn once per layout; only the water below the horizon moves. The ripples spread round the circle.
function buildBackdrop() {
  const vw = hero.clientWidth, vh = hero.clientHeight;
  if (!vw || !vh) return;
  const hr = hero.getBoundingClientRect(), cr = target.getBoundingClientRect();
  const ix = cr.left - hr.left + cr.width / 2, iy = cr.top - hr.top + cr.height * 0.92;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = cr.width / 700;
  const W = Math.round(vw * dpr), H = Math.round(vh * dpr);
  if (bgInfo && bgInfo.W === W && bgInfo.H === H && bgInfo.px === ix * dpr && bgInfo.py === iy * dpr && bgInfo.k === k * dpr) return;
  const yH = Math.max(Math.round(H * 0.15), Math.round((iy - 0.4 * vh) * dpr));
  const sd = Math.min(dpr, 1);
  bgc.width = Math.round(vw * sd); bgc.height = Math.round(vh * sd);
  bgx.setTransform(1, 0, 0, 1, 0, 0);
  bgx.drawImage(makeBackdrop(bgc.width, bgc.height, sd, yH * sd / dpr, vw >= WIDE, { x: ix * sd, y: (iy + 40 * k) * sd }), 0, 0);
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

buildBackdrop();
if (!raf && !reduceMotion) raf = requestAnimationFrame(loop);
// the first frame is on its way: show the scene
requestAnimationFrame(() => requestAnimationFrame(() => markHero('ready')));
