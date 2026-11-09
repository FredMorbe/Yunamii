// Yunamii hero, fully code-drawn: procedural stylized bonsai (branches, blossoms, leaves),
// mossy island, water with reflection and ripples. Canvas 2D, no dependencies.

import { mulberry32, clamp, easeOutBack, TAU } from './util.js';
import { buildTree, updateFK, stepTree, updateElems, drawBranches } from './tree.js';
import { makeSprites, makeIsland, makeBackdrop, makeShimmer, ISLAND_RECT } from './art.js';

const hero = document.getElementById('hero');
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const FOCUS = new URLSearchParams(location.search).get('focus');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// layer that holds island + tree (world rect), used for drawing and for the reflection
const LAYER = { x0: -540, y0: -790, w: 1080, h: 840 };
const REFLECT_H = 360;      // world units of tree that get mirrored
const HAND_RADIUS = 85;     // world units
const HAND_GAIN = 0.025;    // rad/s^2 per (world unit/s) of pointer speed
const WIND_GAIN = 1.6;      // rad/s^2

const tree = buildTree(11);
let sprites, island, backdrop, shimmer;
let layer, lg, refl, rg;
let view = null;
let petals = [], ripples = [];
const pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, lastT: 0 };
const hand = { active: false, x: 0, y: 0, vx: 0, vy: 0, sp: 0, radius: HAND_RADIUS, gain: HAND_GAIN };
let growStart = 0;
let running = true;
let lastFrame = 0, fpsEMA = 60;

function wind(t, x, y) {
  const gust = 0.65 + 0.35 * Math.sin(t * 0.21 + 1.3);
  return gust * (Math.sin(t * 0.85 + x * 0.004 + y * 0.002) * 0.7 + Math.sin(t * 1.9 + x * 0.009 - y * 0.003) * 0.3);
}

// ---- layout ---------------------------------------------------------------------------
function layout() {
  const vw = hero.clientWidth, vh = hero.clientHeight;
  if (!vw || !vh) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(vw * dpr), H = Math.round(vh * dpr);
  const wide = vw >= 900;
  let oyC = wide ? vh * 0.8 : vh * 0.88;
  let oxC = wide ? vw * 0.7 : vw * 0.5;
  let S = Math.max(0.25, wide ? Math.min((oyC - vh * 0.04) / 830, (vw * 0.55) / 920) : Math.min((vw * 0.98) / 920, (oyC - vh * 0.36) / 830));
  // inspection modes (?focus=island | trunk): zoom in on a part of the scene
  if (FOCUS === 'island') { S = Math.min(vw / 560, vh / 280); oxC = vw / 2; oyC = vh / 2 + 60 * S; }
  else if (FOCUS === 'trunk') { S = vh / 560; oxC = vw / 2; oyC = vh / 2 + 280 * S; }
  const u = S * dpr;
  const ox = oxC * dpr, oy = oyC * dpr;
  if (view && view.W === W && view.H === H && view.u === u && view.ox === ox) return false;

  canvas.width = W; canvas.height = H;
  const lx = Math.round(ox + LAYER.x0 * u), ly = Math.round(oy + LAYER.y0 * u);
  view = { W, H, dpr, u, ox, oy, wide, lx, ly, tx: ox - lx, ty: oy - ly, yH: Math.round(oy - 0.33 * H) };

  sprites = makeSprites(u);
  island = makeIsland(u);
  backdrop = makeBackdrop(W, H, dpr, view.yH, wide);
  shimmer = makeShimmer(W, H, dpr, view.yH);

  layer = document.createElement('canvas');
  layer.width = Math.ceil(LAYER.w * u); layer.height = Math.ceil(LAYER.h * u);
  lg = layer.getContext('2d');
  view.rh = Math.min(Math.ceil(REFLECT_H * u), view.ty);
  refl = document.createElement('canvas');
  refl.width = Math.ceil(layer.width / 2); refl.height = Math.max(1, Math.ceil(view.rh / 2));
  rg = refl.getContext('2d');
  return true;
}

// ---- pointer --------------------------------------------------------------------------
function toWorld(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) * view.dpr - view.ox) / view.u, y: ((ev.clientY - r.top) * view.dpr - view.oy) / view.u };
}
canvas.addEventListener('pointermove', (ev) => {
  if (!view) return;
  const p = toWorld(ev), now = performance.now();
  if (pointer.active) {
    const dt = Math.max(0.004, (now - pointer.lastT) / 1000);
    pointer.vx = clamp(pointer.vx * 0.55 + ((p.x - pointer.x) / dt) * 0.45, -2600, 2600);
    pointer.vy = clamp(pointer.vy * 0.55 + ((p.y - pointer.y) / dt) * 0.45, -2600, 2600);
  }
  pointer.x = p.x; pointer.y = p.y; pointer.lastT = now; pointer.active = true;
});
const leave = () => { pointer.active = false; pointer.vx = pointer.vy = 0; };
canvas.addEventListener('pointerleave', leave);
canvas.addEventListener('pointercancel', leave);
canvas.addEventListener('pointerdown', (ev) => {
  if (!view) return;
  const p = toWorld(ev);
  // click: a gust of petals around the pointer
  for (const e of tree.elems) {
    if (e.type !== 'blossom' || !e.init) continue;
    const dx = e.wx - p.x, dy = e.wy - p.y, d = Math.hypot(dx, dy);
    if (d < HAND_RADIUS * 1.6 && Math.random() < 0.3) {
      e.va += (dx / (d + 1)) * 9;
      spawnPetal(e, (dx / (d + 1)) * 70, (dy / (d + 1)) * 30);
    }
  }
});

// ---- petals / ripples -----------------------------------------------------------------
function spawnPetal(e, vx = 0, vy = 0) {
  if (petals.length > 45) return;
  petals.push({
    v: Math.floor(Math.random() * 3), x: e.wx, y: e.wy,
    vx: vx + (Math.random() - 0.5) * 20, vy,
    fall: 38 + Math.random() * 34,
    rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 2.2,
    ph: Math.random() * TAU, fr: 1.6 + Math.random() * 1.6,
    s: 0.85 + Math.random() * 0.45,
    floor: 8 + Math.random() * 62,
    landed: false, tl: 0,
  });
}
function spawnRipple(x, y) {
  ripples.push({ x, y, t: 0 });
  if (ripples.length > 40) ripples.shift();
}

// ---- simulation -----------------------------------------------------------------------
function step(dt, t) {
  const tg = t - growStart;
  const sp = Math.hypot(pointer.vx, pointer.vy);
  hand.active = pointer.active && sp > 25;
  hand.x = pointer.x; hand.y = pointer.y; hand.vx = pointer.vx; hand.vy = pointer.vy; hand.sp = sp;
  const windOn = !reduceMotion;
  const env = { windFn: wind, windGain: WIND_GAIN, windOn, hand };
  for (let i = 0; i < 2; i++) { updateFK(tree, tg); stepTree(tree, dt / 2, t, env); }
  updateFK(tree, tg);
  updateElems(tree, dt, t, tg, wind, windOn, hand);

  // petals shaken loose by the hand
  if (hand.active) {
    for (const e of tree.elems) {
      if (e.type !== 'blossom' || !e.init || tg < e.birth + 0.8) continue;
      const dx = e.wx - hand.x, dy = e.wy - hand.y, d = Math.hypot(dx, dy);
      if (d < HAND_RADIUS) {
        const f = 1 - d / HAND_RADIUS;
        if (Math.random() < f * Math.min(1, sp / 900) * 0.012) spawnPetal(e, hand.vx * 0.1, hand.vy * 0.1);
      }
    }
  }
  pointer.vx *= Math.exp(-dt * 9); pointer.vy *= Math.exp(-dt * 9);

  // ambient petals
  if (windOn && tg > 5 && Math.random() < dt * 0.5) {
    const e = tree.elems[Math.floor(Math.random() * tree.elems.length)];
    if (e.type === 'blossom' && e.init) spawnPetal(e);
  }
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    if (!p.landed) {
      p.ph += dt * p.fr;
      p.vy += (p.fall - p.vy) * Math.min(1, dt * 1.8);
      p.x += (p.vx + Math.sin(p.ph) * 22 + wind(t, p.x, p.y) * 12) * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 0.8);
      p.rot += (p.vr + Math.cos(p.ph) * 1.2) * dt;
      if (p.y >= p.floor) { p.landed = true; p.y = p.floor; spawnRipple(p.x, p.y); }
    } else {
      p.tl += dt;
      if (p.tl > 3.2) petals.splice(i, 1);
    }
  }
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.8) ripples.splice(i, 1); }
}

// ---- drawing --------------------------------------------------------------------------
function drawElems(g, tg) {
  const { u, tx, ty } = view;
  for (const e of tree.elems) {
    if (!e.init) continue;
    const gT = clamp((tg - e.birth) / 0.8, 0, 1);
    if (gT <= 0) continue;
    const sc = e.size * easeOutBack(gT);
    const spr = sprites[e.type][e.v];
    const co = Math.cos(e.a) * sc, si = Math.sin(e.a) * sc;
    g.setTransform(co, si, -si, co, tx + e.wx * u, ty + e.wy * u);
    g.drawImage(spr.c, -spr.ox, -spr.oy);
  }
}

function drawLayer(tg) {
  const { u, tx, ty } = view;
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.clearRect(0, 0, layer.width, layer.height);
  lg.drawImage(island.c, Math.round(tx + ISLAND_RECT.x0 * u), Math.round(ty + ISLAND_RECT.y0 * u));
  lg.setTransform(u, 0, 0, u, tx, ty);
  drawBranches(lg, tree);
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.drawImage(island.front, Math.round(tx + ISLAND_RECT.x0 * u), Math.round(ty + ISLAND_RECT.y0 * u));
  drawElems(lg, tg);
}

function drawReflection(t) {
  const { ty, dpr, lx, ly } = view;
  const rw = refl.width, rh = refl.height;
  rg.setTransform(1, 0, 0, 1, 0, 0);
  rg.clearRect(0, 0, rw, rh);
  rg.setTransform(0.5, 0, 0, -0.5, 0, ty * 0.5);
  rg.drawImage(layer, 0, 0);
  rg.setTransform(1, 0, 0, 1, 0, 0);
  rg.globalCompositeOperation = 'source-atop';
  rg.fillStyle = 'rgba(14,92,118,0.45)';
  rg.fillRect(0, 0, rw, rh);
  rg.globalCompositeOperation = 'source-over';
  const bh = 2 * Math.max(1, Math.round(1.5 * dpr));
  const N = Math.floor(view.rh / bh);
  const wy = ly + ty;
  for (let k = 0; k < N; k++) {
    const f = k / N;
    ctx.globalAlpha = 0.5 * Math.pow(1 - f, 1.4);
    const dx = Math.sin(k * 0.5 + t * 1.7) * (1.2 + f * 3.5) * dpr;
    ctx.drawImage(refl, 0, k * (bh / 2), rw, bh / 2, lx + dx, wy + k * bh, layer.width, bh);
  }
  ctx.globalAlpha = 1;
}

function drawWater(t) {
  const { u, ox, oy, dpr } = view;
  // slow shimmer streaks
  for (const s of shimmer) {
    const a = 0.03 + 0.1 * Math.max(0, Math.sin(t * s.sp + s.ph));
    ctx.fillStyle = s.pink ? `rgba(255,210,235,${a})` : `rgba(215,250,255,${a})`;
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }
  // ripple rings spreading around the island
  ctx.setTransform(u, 0, 0, u, ox, oy);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const f = ((t * 0.045 + i / 4) % 1);
    const r = 215 + f * 300;
    ctx.strokeStyle = `rgba(215,252,255,${(0.2 * Math.sin(f * Math.PI)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(0, 6, r, r * 0.17, 0, 0, TAU); ctx.stroke();
  }
  ctx.lineWidth = 1.6;
  for (const r of ripples) {
    const k = r.t / 1.8, rad = 5 + k * 48;
    ctx.strokeStyle = `rgba(225,253,255,${(0.6 * (1 - k)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.28, 0, 0, TAU); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawPetals() {
  const { u, ox, oy } = view;
  for (const p of petals) {
    const spr = sprites.petal[p.v];
    let alpha = 1, fy;
    if (p.landed) { alpha = 1 - clamp((p.tl - 1.6) / 1.6, 0, 1); fy = 0.4; }
    else fy = 0.3 + 0.7 * Math.abs(Math.cos(p.ph * 0.8));
    ctx.globalAlpha = alpha;
    const co = Math.cos(p.rot) * p.s, si = Math.sin(p.rot) * p.s;
    ctx.setTransform(co, si, -si * fy, co * fy, ox + p.x * u, oy + p.y * u);
    ctx.drawImage(spr.c, -spr.ox, -spr.oy);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function render(t) {
  const tg = t - growStart;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(backdrop, 0, 0);
  drawLayer(tg);
  drawReflection(t);
  drawWater(t);
  ctx.drawImage(layer, view.lx, view.ly);
  drawPetals();
}

// ---- loop -----------------------------------------------------------------------------
function frame(now) {
  if (!running) return;
  const t = now / 1000;
  const dt = clamp(t - lastFrame, 0, 1 / 30);
  if (lastFrame) fpsEMA += (1 / Math.max(t - lastFrame, 0.001) - fpsEMA) * 0.05;
  lastFrame = t;
  step(dt, t);
  render(t);
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) hud.textContent = `${Math.round(fpsEMA)} fps · ${tree.segs.length} branches · ${tree.elems.length} elements · ${petals.length} petals`;
  requestAnimationFrame(frame);
}
function resume() { if (!running && !reduceMotion) { running = true; lastFrame = 0; requestAnimationFrame(frame); } }

function renderStatic() {
  const t = 100;
  growStart = 0;
  for (let i = 0; i < 3; i++) { updateFK(tree, t); updateElems(tree, 0.016, t, t, wind, false, hand); }
  render(t);
}

function replay() {
  growStart = performance.now() / 1000;
  petals = []; ripples = [];
  for (const s of tree.segs) { s.bend = 0; s.vel = 0; }
  for (const e of tree.elems) { e.init = false; e.va = 0; }
}

function init() {
  if (!layout()) throw new Error('hero has no size');
  growStart = performance.now() / 1000;
  if (reduceMotion) renderStatic(); else { running = true; requestAnimationFrame(frame); }
  new ResizeObserver(() => { if (layout() && reduceMotion) renderStatic(); }).observe(hero);
  new IntersectionObserver(([e]) => { if (e.isIntersecting) resume(); else running = false; }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else resume(); });
  document.getElementById('replay').addEventListener('click', replay);
}

window.__scene = { tree, pointer, hand }; // debug handle for inspection in the browser console
try { init(); } catch (err) { console.error(err); hud.textContent = 'Error: ' + err.message; }
