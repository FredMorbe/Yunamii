// Yunamii bonsai prototype: bare tree image + code-driven blossoms with spring physics.
// Pure canvas 2D, no dependencies.

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- World (tree.png coordinate space, 1254 x 1254, plus margin) ----------
const WORLD = { x0: -60, y0: -60, w: 1380 };

// world size of a sprite = original sprite px * typeScale
const TYPE_SCALE = { blossom: 0.25, cluster: 0.3, leaf: 0.2, petal: 0.17 };

// ---- hero layout: code-drawn backdrop, island placed at 70% / 80% of the hero ----------
import { makeBackdrop, makeShimmer } from './backdrop.js';
const hero = document.getElementById('hero');
const bgc = document.getElementById('bg');
const bgx = bgc.getContext('2d');
const ISLAND = { fx: (630 - WORLD.x0) / WORLD.w, fy: (1120 - WORLD.y0) / WORLD.w }; // island footprint centre inside the canvas
const WIDE = 900;
let bgStatic = null, shimmer = [], bgInfo = null;

function layoutScene() {
  const vw = hero.clientWidth, vh = hero.clientHeight; if (!vw || !vh) return;
  const wide = vw >= WIDE;
  hero.classList.toggle('aligned', wide);
  if (wide) {
    const px = vw * 0.7, py = vh * 0.8;
    const size = Math.min(vh * 0.85, vw * 0.56, py / ISLAND.fy); // keep the crown inside the hero
    canvas.style.width = size + 'px';
    canvas.style.left = (px - ISLAND.fx * size) + 'px';
    canvas.style.top = (py - ISLAND.fy * size) + 'px';
  } else { canvas.style.width = ''; canvas.style.left = ''; canvas.style.top = ''; }
  // island footprint on screen (the canvas is in flow on narrow screens, so measure it)
  const hr = hero.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
  const ix = cr.left - hr.left + ISLAND.fx * cr.width, iy = cr.top - hr.top + ISLAND.fy * cr.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(vw * dpr), H = Math.round(vh * dpr);
  if (bgInfo && bgInfo.W === W && bgInfo.H === H && bgInfo.px === ix * dpr && bgInfo.py === iy * dpr && bgInfo.k === (cr.width / WORLD.w) * dpr) return;
  const yH = Math.max(Math.round(H * 0.15), Math.round((iy - 0.33 * vh) * dpr));
  bgc.width = W; bgc.height = H;
  bgStatic = makeBackdrop(W, H, dpr, yH, wide, { x: ix * dpr, y: (iy + 40 * (cr.width / WORLD.w)) * dpr });
  shimmer = makeShimmer(W, H, dpr, yH);
  bgInfo = { W, H, dpr, px: ix * dpr, py: iy * dpr, k: (cr.width / WORLD.w) * dpr };
  if (reduceMotion) drawBg(0);
}

function drawBg(t) {
  if (!bgStatic) return;
  const { px, py, k, dpr } = bgInfo;
  bgx.setTransform(1, 0, 0, 1, 0, 0);
  bgx.drawImage(bgStatic, 0, 0);
  for (const s of shimmer) { // slow shimmer streaks
    const a = 0.03 + 0.1 * Math.max(0, Math.sin(t * s.sp + s.ph));
    bgx.fillStyle = s.pink ? `rgba(255,210,235,${a})` : `rgba(215,250,255,${a})`;
    bgx.fillRect(s.x, s.y, s.w, s.h);
  }
  bgx.lineWidth = 1.6 * dpr; // ripple rings spreading around the island
  for (let i = 0; i < 4; i++) {
    const f = reduceMotion ? 0.35 + i * 0.15 : ((t * 0.045 + i / 4) % 1);
    const r = (520 + f * 600) * k;
    bgx.strokeStyle = `rgba(215,252,255,${(0.2 * Math.sin(f * Math.PI)).toFixed(3)})`;
    bgx.beginPath(); bgx.ellipse(px, py + 40 * k, r, r * 0.17, 0, 0, Math.PI * 2); bgx.stroke();
  }
}

// ---- helpers -------------------------------------------------------------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240611);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load: ' + src));
    img.src = src;
  });
}
async function loadJSON(src) {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
  return r.json();
}

// High-quality downscale by repeated halving (canvas has no mipmaps).
function prescale(img, factor) {
  const tw = Math.max(1, Math.round(img.width * factor));
  const th = Math.max(1, Math.round(img.height * factor));
  let src = img, w = img.width, h = img.height;
  while (w / 2 >= tw && h / 2 >= th) {
    w = Math.round(w / 2); h = Math.round(h / 2);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    src = c;
  }
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);
  return out;
}

// ---- state ---------------------------------------------------------------
const view = { S: 1, tx: 0, ty: 0, dpr: 1, cssW: 0 };
let treeImg, treeCanvas, spriteImgs = {}, spriteMeta = {}, sprites = {};
let items = [];
let petals = [];
let ripples = [];
const pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, lastT: 0 };
let bloomStart = 0;
let running = true;
let lastFrame = 0, fpsEMA = 60;

const HAND_RADIUS = 150;
const HAND_GAIN = 0.9;   // how strongly pointer speed pushes elements
const MAX_DISPLACE = 32; // world px an element may be pushed away from its branch
const MAX_ROT = 0.55;    // rad

// ---- build ---------------------------------------------------------------
function spriteDirAngle(meta, flip) {
  // direction from stem pivot to the visual centre of the sprite
  const dx = meta.centroid[0] - meta.pivot[0];
  const dy = meta.centroid[1] - meta.pivot[1];
  return Math.atan2(dy, flip ? -dx : dx);
}

function buildItems(anchorData) {
  const out = [];
  const add = (type, a, jitter, extra, R = rnd) => {
    const v = 1 + Math.floor(R() * 4);
    const name = type + v;
    const flip = R() < 0.5;
    let rot;
    if (type === 'blossom') rot = R() * Math.PI * 2;
    else rot = a.ang - spriteDirAngle(spriteMeta[name], flip) + (R() - 0.5) * 1.1;
    const ox = (R() - 0.5) * 2 * jitter, oy = (R() - 0.5) * 2 * jitter;
    out.push({
      type, name, flip, rot0: rot,
      x: a.x + ox, y: a.y + oy,
      s: (0.85 + R() * 0.3) * (extra ? 0.92 : 1),
      d: a.d, tip: a.tip,
      birth: 0.5 + a.d * 2.8 + R() * 0.6,
      ox: 0, oy: 0, vx: 0, vy: 0, th: 0, vth: 0,
      k: 55 + R() * 45,
      phase: R() * 6.28,
      z: type === 'leaf' ? 0 : type === 'cluster' ? 1 : 2,
    });
  };
  // smooth "cloud" field: blossoms gather in loose groups with gaps between them
  const cloud = (x, y) => 0.5 + 0.5 * (Math.sin(x * 0.012 + y * 0.007) + Math.sin(x * 0.005 - y * 0.011 + 2) + Math.sin(x * 0.02 + y * 0.016 + 1)) / 3;
  for (const a of anchorData.anchors) {
    const p = clamp((a.tip ? 0.8 : 0.3) * (0.3 + 1.0 * cloud(a.x, a.y)), 0, 0.95);
    if (rnd() > p) continue;
    const r = rnd();
    add(r < 0.55 ? 'blossom' : 'cluster', a, 5);
    if (r >= 0.85) out.pop(); // former leaf slot: leaves are added in their own pass below
  }
  // leaves: separate pass so blossom density stays untouched; fills the gaps along the branches
  const rndLeaf = mulberry32(777);
  const rndFix = mulberry32(4242);
  // hand-tuned spots (world px) that were too leafy: fewer leaves, a couple of extra blossoms
  const FIX = [{ x: 800, y: 70, r: 125 }, { x: 1165, y: 385, r: 150 }];
  const inFix = (a) => FIX.find((f) => Math.hypot(a.x - f.x, a.y - f.y) < f.r);
  for (const a of anchorData.anchors) {
    if (rndLeaf() > (a.tip ? 0.85 : 0.65)) continue;
    const fix = inFix(a);
    add('leaf', a, 7, false, rndLeaf);
    if (fix && rndFix() < 0.7) out.pop();
    if (rndLeaf() < 0.45) {
      add('leaf', a, 12, false, rndLeaf);
      if (fix) out.pop();
    }
  }
  for (const f of FIX) {
    const near = anchorData.anchors
      .filter((a) => Math.hypot(a.x - f.x, a.y - f.y) < f.r)
      .sort((p, q) => Math.hypot(p.x - f.x, p.y - f.y) - Math.hypot(q.x - f.x, q.y - f.y));
    const pool = near.filter((a) => a.tip);
    for (const a of (pool.length >= 2 ? pool : near).slice(0, 2)) add('blossom', a, 10, false, rndFix);
  }
  out.sort((p, q) => p.z - q.z || p.y - q.y);
  return out;
}

function buildSprites() {
  sprites = {};
  for (const name of Object.keys(spriteImgs)) {
    const type = name.replace(/\d+$/, '');
    const F = TYPE_SCALE[type] * view.S; // device px per original sprite px
    const c = prescale(spriteImgs[name], F);
    const m = spriteMeta[name];
    sprites[name] = { c, px: m.pivot[0] * F, py: m.pivot[1] * F, cx: (type === 'blossom' || type === 'petal') ? c.width / 2 : m.pivot[0] * F, cy: (type === 'blossom' || type === 'petal') ? c.height / 2 : m.pivot[1] * F };
  }
  treeCanvas = prescale(treeImg, view.S);
  gradeTree(treeCanvas);
  buildWater();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth;
  if (!cssW) return;
  const px = Math.round(cssW * dpr);
  if (canvas.width === px && view.dpr === dpr && treeCanvas) return;
  canvas.width = px; canvas.height = px;
  view.dpr = dpr; view.cssW = cssW;
  view.S = px / WORLD.w;
  view.tx = -WORLD.x0 * view.S;
  view.ty = -WORLD.y0 * view.S;
  if (treeImg) buildSprites();
}

// ---- integration: colour grade, waterline, reflection, glow ----------------
// The tree is a separate render; these passes make it share light, colour and water with the scene.
const SINK = 30;        // world px of the island base that sit below the water surface
const REFLECT_H = 120;  // world px of mirrored island below the waterline
let waterY = null, wlMin = 0, wlMax = 0; // waterline (world y) per tree column, valid column range
let layer, lctx, refl, rctx, bloomC, bctx, subMask, fadeMask, reflFade;

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// one-time colour pass on the bare tree: calmer moss, cooler shadows, a little less saturation
function gradeTree(c) {
  const g = c.getContext('2d');
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i], gr = d[i + 1], b = d[i + 2];
    const lum = 0.3 * r + 0.59 * gr + 0.11 * b;
    r = lum + (r - lum) * 0.82; gr = lum + (gr - lum) * 0.82; b = lum + (b - lum) * 0.88;
    const m = Math.min(1, Math.max(0, (gr - Math.max(r, b)) / 70)); // how mossy-green this pixel is
    r *= 1 - 0.3 * m; gr *= 1 - 0.1 * m; b += (gr - b) * 0.2 * m;
    const dk = 1 - lum / 255;
    r *= 1 - 0.1 * dk; b *= 1 + 0.1 * dk;
    d[i] = r; d[i + 1] = gr; d[i + 2] = b;
  }
  g.putImageData(im, 0, 0);
}

// lowest opaque pixel of every column of the island, smoothed, minus SINK = the waterline
function computeWaterline() {
  const w = treeImg.width, h = treeImg.height;
  const g = mkCanvas(w, h).getContext('2d', { willReadFrequently: true });
  g.drawImage(treeImg, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  const bot = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 1060; y--) if (d[(y * w + x) * 4 + 3] > 140) { bot[x] = y; break; }
  const sm = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let k = -14; k <= 14; k++) { const v = bot[x + k]; if (v === v) { s += v; n++; } }
    if (n > 14 && bot[x] === bot[x]) sm[x] = s / n;
  }
  let first = sm.findIndex((v) => v === v), last = w - 1;
  while (last > 0 && sm[last] !== sm[last]) last--;
  if (first < 0) throw new Error('computeWaterline: no island pixels found');
  wlMin = first; wlMax = last;
  waterY = new Float32Array(w);
  for (let x = 0; x < w; x++) waterY[x] = sm[clamp(x, first, last)] - SINK;
}

const wlAt = (xw) => waterY[clamp(Math.round(xw), 0, waterY.length - 1)];

function buildWater() {
  const W = canvas.width, H = canvas.height, S = view.S, dpr = view.dpr;
  if (!waterY) computeWaterline();
  layer = mkCanvas(W, H); lctx = layer.getContext('2d');
  refl = mkCanvas(W, H); rctx = refl.getContext('2d');
  bloomC = mkCanvas(Math.ceil(W / 5), Math.ceil(H / 5)); bctx = bloomC.getContext('2d');
  // everything below the waterline, tinted like water (applied with source-atop, so only the tree is affected)
  subMask = mkCanvas(W, H);
  const sg = subMask.getContext('2d');
  sg.setTransform(S, 0, 0, S, view.tx, view.ty);
  sg.beginPath(); sg.moveTo(WORLD.x0, waterY[0]);
  for (let x = 0; x < waterY.length; x++) sg.lineTo(x, waterY[x]);
  sg.lineTo(WORLD.x0 + WORLD.w, waterY[waterY.length - 1]); sg.lineTo(WORLD.x0 + WORLD.w, 1500); sg.lineTo(WORLD.x0, 1500); sg.closePath();
  const tg = sg.createLinearGradient(0, 1090, 0, 1210);
  tg.addColorStop(0, 'rgba(34,140,165,0.5)'); tg.addColorStop(1, 'rgba(10,90,120,0.75)');
  sg.fillStyle = tg; sg.fill();
  // opacity ramps: the island fades into the water below the line; the reflection fades with depth
  const fm = mkCanvas(W, H), rf = mkCanvas(W, H);
  const fi = fm.getContext('2d').createImageData(W, H), ri = rf.getContext('2d').createImageData(W, H);
  for (let xd = 0; xd < W; xd++) {
    const wl = wlAt((xd - view.tx) / S);
    for (let yd = 0; yd < H; yd++) {
      const dist = (yd - view.ty) / S - wl;
      if (dist <= 0) continue;
      const i = (yd * W + xd) * 4;
      fi.data[i + 3] = 255 * (0.12 + 0.75 * Math.min(1, dist / 34));
      if (dist < REFLECT_H) ri.data[i + 3] = 255 * 0.85 * Math.pow(1 - dist / REFLECT_H, 1.3);
    }
  }
  fm.getContext('2d').putImageData(fi, 0, 0); rf.getContext('2d').putImageData(ri, 0, 0);
  fadeMask = fm; reflFade = rf;
}

// tree + blossoms on their own layer, graded to the scene light, base sunk into the water
function drawLayer(t) {
  const S = view.S, W = layer.width, H = layer.height;
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, W, H);
  lctx.setTransform(1, 0, 0, 1, view.tx, view.ty);
  lctx.drawImage(treeCanvas, 0, 0);
  drawItems(lctx, t);
  // scene light: teal bounce from the water below, pink window light from the upper right, a touch of haze
  lctx.globalCompositeOperation = 'source-atop';
  lctx.setTransform(S, 0, 0, S, view.tx, view.ty);
  let g = lctx.createLinearGradient(0, 1200, 0, 880);
  g.addColorStop(0, 'rgba(40,175,195,0.30)'); g.addColorStop(1, 'rgba(40,175,195,0)');
  lctx.fillStyle = g; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.w);
  g = lctx.createLinearGradient(1254, 0, 560, 560);
  g.addColorStop(0, 'rgba(255,175,210,0.20)'); g.addColorStop(1, 'rgba(255,175,210,0)');
  lctx.fillStyle = g; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.w);
  lctx.fillStyle = 'rgba(130,205,225,0.05)'; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.w);
  // sink the base: water tint, then fade towards the bottom
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.drawImage(subMask, 0, 0);
  lctx.globalCompositeOperation = 'destination-out';
  lctx.drawImage(fadeMask, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
}

// mirror image of the island base under the waterline, rippled column by column
function drawReflection(t) {
  const S = view.S, W = refl.width, H = refl.height, dpr = view.dpr;
  const sw = Math.max(2, Math.round(3 * dpr)), hs = Math.round(REFLECT_H * S);
  rctx.globalCompositeOperation = 'source-over';
  rctx.setTransform(1, 0, 0, 1, 0, 0); rctx.clearRect(0, 0, W, H);
  const x0 = Math.floor((wlMin * S + view.tx) / sw) * sw - sw * 4, x1 = (wlMax * S + view.tx) + sw * 4;
  for (let xd = Math.max(0, x0); xd < Math.min(W, x1); xd += sw) {
    const wl = wlAt((xd + sw / 2 - view.tx) / S) * S + view.ty;
    const y0 = Math.max(0, wl - hs), hh = wl - y0;
    if (hh <= 0) continue;
    const wob = Math.round(Math.sin(xd * 0.05 / dpr + t * 1.7) * 1.6 * dpr); // whole pixels: no soft seams between strips
    rctx.setTransform(1, 0, 0, -1, 0, 2 * wl);
    rctx.drawImage(layer, xd, y0, sw + 2, hh, xd + wob, y0, sw + 2, hh); // 2px overlap hides gaps where neighbours shift apart
  }
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.globalCompositeOperation = 'destination-in'; rctx.drawImage(reflFade, 0, 0);
  rctx.globalCompositeOperation = 'source-atop'; rctx.fillStyle = 'rgba(12,100,130,0.22)'; rctx.fillRect(0, 0, W, H);
  rctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(refl, 0, 0);
}

function drawContactShadow() {
  ctx.setTransform(view.S, 0, 0, view.S, view.tx, view.ty);
  ctx.save();
  ctx.translate(630, 1165); ctx.scale(1, 0.17);
  const g = ctx.createRadialGradient(0, 0, 40, 0, 0, 620);
  g.addColorStop(0, 'rgba(3,40,58,0.6)'); g.addColorStop(1, 'rgba(3,40,58,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 620, 0, 7); ctx.fill();
  ctx.restore();
}

function drawWaterEdge(t) {
  const S = view.S;
  ctx.setTransform(S, 0, 0, S, view.tx, view.ty);
  const g = ctx.createLinearGradient(wlMin, 0, wlMax, 0);
  g.addColorStop(0, 'rgba(215,252,255,0)'); g.addColorStop(0.12, 'rgba(215,252,255,0.55)');
  g.addColorStop(0.88, 'rgba(215,252,255,0.55)'); g.addColorStop(1, 'rgba(215,252,255,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = wlMin; x <= wlMax; x += 4) {
    const y = waterY[x] + 1 + Math.sin(x * 0.07 + t * 2.1) * 0.9;
    if (x === wlMin) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// light mist over the tree: a haze that thickens towards the water plus a few slowly drifting soft patches
let mistBlob = null;
const MIST = [ // [x, y, size, speed, phase, alpha] in world units
  [380, 1010, 520, 9, 0.0, 0.2], [880, 960, 560, -7, 2.1, 0.18], [640, 780, 600, 5, 4.0, 0.12],
  [250, 640, 460, -6, 1.2, 0.09], [1010, 600, 480, 8, 3.3, 0.1], [660, 1110, 720, -4, 5.2, 0.22],
  [330, 1150, 560, 6, 1.7, 0.16], [960, 1140, 560, -5, 3.9, 0.16], [640, 900, 700, 4, 2.8, 0.1],
];
function drawMist(t) {
  const S = view.S;
  if (!mistBlob) {
    mistBlob = mkCanvas(128, 128);
    const g = mistBlob.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(205,240,248,1)'); rg.addColorStop(0.5, 'rgba(205,240,248,0.45)'); rg.addColorStop(1, 'rgba(205,240,248,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  }
  ctx.setTransform(S, 0, 0, S, view.tx, view.ty);
  for (const [x, y, size, sp, ph, a] of MIST) {
    const dx = reduceMotion ? 0 : Math.sin(t * 0.006 * Math.abs(sp) + ph) * 70 * Math.sign(sp);
    ctx.globalAlpha = a * (0.8 + 0.2 * Math.sin(t * 0.3 + ph));
    ctx.drawImage(mistBlob, x + dx - size / 2, y - size * 0.3, size, size * 0.6);
  }
  ctx.globalAlpha = 1;
}

function drawGlow() {
  bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, bloomC.width, bloomC.height);
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(layer, 0, 0, bloomC.width, bloomC.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2;
  ctx.drawImage(bloomC, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

// ---- pointer -------------------------------------------------------------
function toWorld(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: WORLD.x0 + ((ev.clientX - r.left) / r.width) * WORLD.w,
    y: WORLD.y0 + ((ev.clientY - r.top) / r.height) * WORLD.w,
  };
}
canvas.addEventListener('pointermove', (ev) => {
  const p = toWorld(ev);
  const now = performance.now();
  if (pointer.active) {
    const dt = Math.max(0.004, (now - pointer.lastT) / 1000);
    const ivx = (p.x - pointer.x) / dt, ivy = (p.y - pointer.y) / dt;
    pointer.vx = clamp(pointer.vx * 0.55 + ivx * 0.45, -3500, 3500);
    pointer.vy = clamp(pointer.vy * 0.55 + ivy * 0.45, -3500, 3500);
  }
  pointer.x = p.x; pointer.y = p.y; pointer.lastT = now; pointer.active = true;
});
canvas.addEventListener('pointerleave', () => { pointer.active = false; pointer.vx = pointer.vy = 0; });
canvas.addEventListener('pointercancel', () => { pointer.active = false; pointer.vx = pointer.vy = 0; });
canvas.addEventListener('pointerdown', (ev) => {
  const p = toWorld(ev);
  // click = a burst of petals around the pointer
  for (const it of items) {
    if (it.type !== 'blossom') continue;
    const dx = it.x + it.ox - p.x, dy = it.y + it.oy - p.y;
    const d = Math.hypot(dx, dy);
    if (d < HAND_RADIUS && Math.random() < 0.35) {
      const f = 1 - d / HAND_RADIUS;
      it.vx += (dx / (d + 1)) * 500 * f; it.vy += (dy / (d + 1)) * 500 * f;
      spawnPetal(it, dx / (d + 1) * 120, dy / (d + 1) * 60);
    }
  }
});

// ---- petals / ripples ----------------------------------------------------
function spawnPetal(it, vx = 0, vy = 0) {
  if (petals.length > 45) return;
  petals.push({
    name: 'petal' + (1 + Math.floor(Math.random() * 4)),
    x: it.x + it.ox, y: it.y + it.oy,
    vx: vx + (Math.random() - 0.5) * 30, vy: vy,
    fall: 60 + Math.random() * 50,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2.2,
    ph: Math.random() * 6.28, fr: 1.6 + Math.random() * 1.6,
    s: 0.8 + Math.random() * 0.5,
    floor: 1110 + Math.random() * 100,
    landed: false, tl: 0,
  });
}
function spawnRipple(x, y) {
  ripples.push({ x, y, t: 0 });
  if (ripples.length > 40) ripples.shift();
}

// ---- simulation ----------------------------------------------------------
function wind(t, x, y) {
  const gust = 0.65 + 0.35 * Math.sin(t * 0.21 + 1.3);
  return gust * (Math.sin(t * 0.85 + x * 0.0035 + y * 0.002) * 0.7 + Math.sin(t * 1.9 + x * 0.008 - y * 0.003) * 0.3);
}

function step(dt, t) {
  const sp = Math.hypot(pointer.vx, pointer.vy);
  const bloomT = t - bloomStart;
  for (const it of items) {
    const w = reduceMotion ? 0 : wind(t, it.x, it.y);
    const eqx = w * 2.4 * (0.5 + it.d);
    const eqy = w * 0.9;
    const eqth = w * 0.075 * (0.4 + it.d * 0.8);
    let ax = -it.k * (it.ox - eqx) - 2 * 0.22 * Math.sqrt(it.k) * it.vx;
    let ay = -it.k * (it.oy - eqy) - 2 * 0.22 * Math.sqrt(it.k) * it.vy;
    let ath = -80 * (it.th - eqth) - 2 * 0.2 * Math.sqrt(80) * it.vth;
    if (pointer.active && sp > 20 && bloomT > it.birth) {
      const dx = it.x + it.ox - pointer.x, dy = it.y + it.oy - pointer.y;
      const d = Math.hypot(dx, dy);
      if (d < HAND_RADIUS) {
        const f = (1 - d / HAND_RADIUS) ** 2;
        ax += pointer.vx * f * HAND_GAIN; ay += pointer.vy * f * HAND_GAIN;
        // slight push away from the hand centre so leaves part around it
        ax += (dx / (d + 1)) * sp * f * 0.1; ay += (dy / (d + 1)) * sp * f * 0.1;
        ath += pointer.vx * f * 0.005 * (it.type === 'blossom' ? 1.3 : 1);
        if (it.type === 'blossom' && Math.random() < f * Math.min(1, sp / 1400) * 0.0175) spawnPetal(it, pointer.vx * 0.12, pointer.vy * 0.12);
      }
    }
    it.vx += ax * dt; it.vy += ay * dt; it.vth += ath * dt;
    it.ox += it.vx * dt; it.oy += it.vy * dt; it.th += it.vth * dt;
    const m = Math.hypot(it.ox, it.oy);
    if (m > MAX_DISPLACE) { it.ox *= MAX_DISPLACE / m; it.oy *= MAX_DISPLACE / m; }
    it.th = clamp(it.th, -MAX_ROT, MAX_ROT);
  }
  pointer.vx *= Math.exp(-dt * 9); pointer.vy *= Math.exp(-dt * 9);

  // ambient petals
  if (!reduceMotion && bloomT > 4 && Math.random() < dt * 0.5) {
    const cand = items[Math.floor(Math.random() * items.length)];
    if (cand.type === 'blossom') spawnPetal(cand);
  }

  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    if (!p.landed) {
      p.ph += dt * p.fr;
      p.vy += (p.fall - p.vy) * Math.min(1, dt * 1.8);
      const wv = wind(t, p.x, p.y) * 18;
      p.x += (p.vx + Math.sin(p.ph) * 34 + wv) * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 0.8);
      p.rot += (p.vr + Math.cos(p.ph) * 1.2) * dt;
      if (p.y >= p.floor) { p.landed = true; spawnRipple(p.x, p.y + 6); }
    } else {
      p.tl += dt;
      if (p.tl > 3.2) petals.splice(i, 1);
    }
  }
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.8) ripples.splice(i, 1); }
}

// ---- drawing -------------------------------------------------------------
function drawRipples() {
  ctx.setTransform(view.S, 0, 0, view.S, view.tx, view.ty);
  ctx.lineWidth = 2.5;
  for (const r of ripples) {
    const k = r.t / 1.8;
    ctx.strokeStyle = `rgba(215,252,255,${(0.55 * (1 - k)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + k * 70, (8 + k * 70) * 0.28, 0, 0, 7); ctx.stroke();
  }
}

function drawItems(ctx, t) {
  const bloomT = t - bloomStart;
  const S = view.S;
  for (const it of items) {
    const gT = clamp((bloomT - it.birth) / 0.9, 0, 1);
    if (gT <= 0) continue;
    const g = easeOutBack(gT);
    const spr = sprites[it.name];
    const sc = it.s * g;
    const rot = it.rot0 + it.th;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const sx = it.flip ? -sc : sc;
    ctx.setTransform(cos * sx, sin * sx, -sin * sc, cos * sc, (it.x + it.ox) * S + view.tx, (it.y + it.oy) * S + view.ty);
    ctx.drawImage(spr.c, -spr.cx, -spr.cy);
  }
}

function drawPetals() {
  const S = view.S;
  for (const p of petals) {
    const spr = sprites[p.name];
    let alpha = 1, fy;
    if (p.landed) { alpha = 1 - clamp((p.tl - 1.6) / 1.6, 0, 1); fy = 0.45; }
    else fy = 0.3 + 0.7 * Math.abs(Math.cos(p.ph * 0.8));
    ctx.globalAlpha = alpha;
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    const sc = p.s;
    ctx.setTransform(cos * sc, sin * sc, -sin * sc * fy, cos * sc * fy, p.x * S + view.tx, p.y * S + view.ty);
    ctx.drawImage(spr.c, -spr.cx, -spr.cy);
  }
  ctx.globalAlpha = 1;
}

function render(t) {
  drawBg(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawContactShadow();
  drawLayer(t);
  drawReflection(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  drawGlow();
  drawMist(t);
  drawWaterEdge(t);
  drawRipples();
  drawPetals();
}

// ---- loop ----------------------------------------------------------------
function frame(now) {
  if (!running) return;
  const t = now / 1000;
  const dt = clamp(t - lastFrame, 0, 1 / 30);
  if (lastFrame) fpsEMA += (1 / Math.max(t - lastFrame, 0.001) - fpsEMA) * 0.05;
  lastFrame = t;
  step(dt, t);
  render(t);
  if ((frame.n = (frame.n || 0) + 1) % 20 === 0) hud.textContent = `${Math.round(fpsEMA)} fps · ${items.length} elements · ${petals.length} petals`;
  requestAnimationFrame(frame);
}

function start() {
  if (reduceMotion) { bloomStart = -100; resize(); render(0); return; }
  running = true; lastFrame = 0; requestAnimationFrame(frame);
}
function stop() { running = false; }

function replay() {
  bloomStart = performance.now() / 1000;
  petals = []; ripples = [];
  for (const it of items) { it.ox = it.oy = it.vx = it.vy = it.th = it.vth = 0; }
}

async function init() {
  const [tree, meta, anchors] = await Promise.all([
    loadImage('assets/tree.png'),
    loadJSON('assets/sprites.json'),
    loadJSON('assets/anchors.json'),
  ]);
  treeImg = tree; spriteMeta = meta;
  await Promise.all(Object.keys(meta).map(async (n) => { spriteImgs[n] = await loadImage(`assets/sprites/${n}.png`); }));
  items = buildItems(anchors);
  layoutScene();
  resize();
  new ResizeObserver(layoutScene).observe(hero);
  bloomStart = performance.now() / 1000;
  start();
  new ResizeObserver(() => { resize(); if (reduceMotion) render(0); }).observe(canvas);
  new IntersectionObserver(([e]) => {
    if (reduceMotion) return;
    if (e.isIntersecting && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); }
    else if (!e.isIntersecting) stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (!reduceMotion && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); } });
  document.getElementById('replay').addEventListener('click', replay);
}

init().catch((err) => { console.error(err); hud.textContent = 'Error: ' + err.message; });
