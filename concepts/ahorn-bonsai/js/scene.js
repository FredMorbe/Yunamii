// The hero of Ahorn Bonsai: a bare maple on a stone slab, a laptop beside it, and the red leaves drawn on the
// twigs by code, each one on a spring, so that wind and the pointer move them. Built the way the main page builds
// its cherry tree (js/hero.js there): a still picture of the tree, sprites placed on anchor points on its twigs,
// the island sunk into the water with a rippled reflection, a painted backdrop behind it. Pure canvas 2D.
import { makeBackdrop, makeShimmer } from './backdrop.js';

const hero = document.getElementById('hero');
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const bgc = document.getElementById('bg');
const fxc = document.getElementById('bg-fx');
const bgx = bgc.getContext('2d');
const fxx = fxc.getContext('2d');
const orbitSvg = document.getElementById('orbits');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const theme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

// ---- world: the pixels of the picture of the slab (1536 x 1024) with a margin round it ---------------------
const WORLD = { x0: -50, y0: -120, w: 1700, h: 1320 };
const ISLAND = { x: 787, y: 975 };          // the waterline in the middle of the slab
const SLAB = { w: 1457, top: 56 };          // width of the slab and the row of the top of the crown
const WIDE = 900;                           // from this width on the scene stands on the right of the text

// world size of a sprite = sprite px * TYPE_SCALE (a blade is about 85 world px across)
const TYPE_SCALE = { leaf: 0.25, side: 0.25, fall: 0.15 };

// The foliage. The leaves of a maple stand in pairs on the nodes of a twig, so that is how they are put on the twigs
// of the picture: a pair on a node, one more at the end of a twig.
const NODE_SHARE = [0.5, 0.95]; // how many of the nodes carry leaves: near the trunk, at the edge of the crown
const NODE_ALONE = [70, 3];     // a node with fewer than [1] others within [0] world px is a knot on the trunk, not a twig: it stays bare
const PAIR_OPEN = [0.7, 1.5];   // rad between the twig and a leaf of a pair
const LEAF_FLAT = [0.5, 0.82];  // the blades lie nearly level, in layers, and are looked at from the side: their picture is this much lower than wide
const LEAF_DROOP = [0.05, 0.4]; // rad a blade hangs down from the level, to the side it points to
const EDGE_LEVEL = 0.85;        // how far a leaf seen edge-on is turned to the horizontal (0 = as the twig has it, 1 = it lies flat)
const EDGE_DROOP = 0.25;        // how far it hangs down
const EDGE_SHARE = [0.07, 0.65]; // share of leaves seen edge-on (side1..4), inside the crown and on the underside of a pad; all others show their blade (leaf1..12)
const UNDER = [60, 110, 4];     // a node is on the underside of a pad when no other node lies below it, up to [0] world px to the side and [1] down; with [2] of them it is inside the pad
const BACK = 0.45;              // a leaf with a depth below this is behind the twigs, the others are in front of them

// Light: the sun is up on the left. A leaf with many leaves between it and the sun is in their shade; the tones
// go from a blade in the sun to one deep inside the crown.
const LIGHT = [-0.5, -0.866];
const SHADE_REACH = 150;        // world px: leaves nearer than this shade each other
const SHADE_FULL = 7;           // this much foliage towards the sun is full shade
const TONES = [
  ['screen', 'rgba(255,138,58,0.3)'], ['screen', 'rgba(255,118,52,0.13)'], null,
  ['multiply', 'rgb(214,150,158)'], ['multiply', 'rgb(160,92,110)'], ['multiply', 'rgb(110,50,74)'],
];
const SHADOW_OFF = [5, 14];     // world px: how far the shadow of the deepest and of the nearest leaf falls
const SHADOW_BLUR = 5;          // world px

// the laptop stands on the left, flat part of the slab; its base line is at LAPTOP.base
const LAPTOP = { scale: 0.8, cx: 640, base: 862, front: 880, top: 340 }; // right of the column `front` and above the row `top` the slab, the moss and the tree are in front of the laptop
const CROWN_Y = 560;   // the crown is the part of the tree above this row (as in tools/build-ahorn-assets.py)

// what the mockup (1672 x 941) shows, in world units, relative to the slab: the sun and the horizon
const MOCKUP_K = 870 / SLAB.w;                                   // css px per world unit in the mockup
const SUN = { x: ISLAND.x - 133 / MOCKUP_K, y: ISLAND.y - 460 / MOCKUP_K, r: 142 / MOCKUP_K };
const HORIZON_Y = ISLAND.y - 71 / MOCKUP_K;

// Thin rings round the sun, as in an atom (the page is about software, trading and quantum physics): centre and
// radius in units of the sun's radius; the dots move along them, very slowly.
const ORBITS = [
  { cx: -0.92, cy: 0.28, r: 1.58, dots: [{ a: -1.55, w: 0.03, s: 3.6 }, { a: 3.2, w: 0.03, s: 3 }] },
  { cx: -0.52, cy: 0.1, r: 1.14, dots: [{ a: 3.95, w: -0.045, s: 3.2 }, { a: 4.7, w: -0.045, s: 2.4 }] },
];

// ---- palette: the same scene by day and at night ------------------------------------------------------------
const PAL = {
  light: {
    shadow: '70,45,42', shadowA: 0.34, leaf: '52,0,14', leafA: 0.44,
    sink: [[34, 'rgba(236,226,221,0.5)'], [120, 'rgba(228,216,212,0.82)']], reflTint: 'rgba(176,156,150,0.2)', reflA: 0.78,
    rim: 'rgba(255,204,168,0.16)', bounce: 'rgba(190,200,222,0.2)', haze: 'rgba(246,235,227,0.05)', night: null,
    edge: '255,255,255', edgeA: 0.7, ripple: '120,100,96', rippleA: 0.5, ring: '128,108,104', ringA: 0.34,
    mist: '250,242,238', mistK: 0.8, streak: ['255,255,255', '222,178,168'], bloom: 0,
  },
  dark: {
    shadow: '0,0,0', shadowA: 0.62, leaf: '0,0,6', leafA: 0.7,
    sink: [[34, 'rgba(22,22,32,0.5)'], [120, 'rgba(14,14,22,0.85)']], reflTint: 'rgba(40,40,70,0.3)', reflA: 0.8,
    rim: 'rgba(255,120,92,0.16)', bounce: 'rgba(80,90,150,0.18)', haze: 'rgba(60,60,100,0.05)', night: 'rgba(16,20,52,0.42)',
    edge: '200,215,255', edgeA: 0.35, ripple: '200,208,240', rippleA: 0.5, ring: '190,198,235', ringA: 0.3,
    mist: '90,92,128', mistK: 0.55, streak: ['190,205,255', '255,150,130'], bloom: 0.14,
  },
};

// ---- helpers --------------------------------------------------------------------------------------------------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261113);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

// Loads a picture and hands back an ImageBitmap: it is decoded off the main thread (createImageBitmap does not wait
// for a frame, so it also settles on a page that is not being drawn).
async function loadImage(src) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Image failed to load: ' + src));
    el.src = src;
  });
  return createImageBitmap(img);
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
    const c = mkCanvas(w, h);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    src = c;
  }
  const out = mkCanvas(tw, th);
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);
  return out;
}

// ---- state ----------------------------------------------------------------------------------------------------
const view = { S: 1, tx: 0, ty: 0, dpr: 1, cssW: 0 };
let data, platImg, lapImg, spriteImgs = {}, sprites = {};
let platCanvas, lapCanvas;
let items = [], backCount = 0, fallen = [], ripples = [];
const pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, lastT: 0 };
let running = true, lastFrame = 0;
let shimmer = [], bgInfo = null;

const HAND_RADIUS = 150;
const HAND_GAIN = 0.9;     // how strongly pointer speed pushes the leaves
const MAX_DISPLACE = 30;   // world px a leaf may be pushed away from its twig
const MAX_ROT = 0.6;       // rad

// ---- layout ---------------------------------------------------------------------------------------------------
// where the slab stands on the screen, and how many css px one world unit is
function geometry() {
  const vw = hero.clientWidth, vh = hero.clientHeight;
  const hr = hero.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
  const k = cr.width / WORLD.w;
  const at = (xw, yw) => ({ x: cr.left - hr.left + (xw - WORLD.x0) * k, y: cr.top - hr.top + (yw - WORLD.y0) * k });
  return { vw, vh, k, at, island: at(ISLAND.x, ISLAND.y), sun: { ...at(SUN.x, SUN.y), r: SUN.r * k }, horizon: at(0, HORIZON_Y).y };
}

// cheap: runs on every resize event (moves the canvas, nothing is redrawn)
function placeScene() {
  const vw = hero.clientWidth, vh = hero.clientHeight; if (!vw || !vh) return false;
  const wide = vw >= WIDE;
  hero.classList.toggle('aligned', wide);
  if (wide) {
    const px = vw * 0.675, py = vh * 0.8;
    // the slab takes 52 % of the width as in the mockup, but the crown must stay below the header
    const k = Math.min(vw * 0.52 / SLAB.w, (py - vh * 0.15) / (ISLAND.y - SLAB.top));
    canvas.style.width = `${WORLD.w * k}px`;
    canvas.style.left = `${px - (ISLAND.x - WORLD.x0) * k}px`;
    canvas.style.top = `${py - (ISLAND.y - WORLD.y0) * k}px`;
  } else { canvas.style.width = ''; canvas.style.left = ''; canvas.style.top = ''; }
  return true;
}

// heavy: redraws the backdrop; only after resizing has settled (see scheduleRebuild)
function buildBackdrop(force) {
  const g = geometry(); if (!g.vw || !g.vh) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const th = theme();
  const W = Math.round(g.vw * dpr), H = Math.round(g.vh * dpr);
  const yH = Math.round(clamp(g.horizon, g.vh * 0.2, g.vh * 0.92) * dpr);
  if (!force && bgInfo && bgInfo.W === W && bgInfo.H === H && bgInfo.px === g.island.x * dpr && bgInfo.py === g.island.y * dpr && bgInfo.k === g.k * dpr && bgInfo.theme === th) return;
  // the backdrop is out of focus anyway: one pixel per css pixel is plenty
  const sd = Math.min(dpr, 1);
  bgc.width = Math.round(g.vw * sd); bgc.height = Math.round(g.vh * sd);
  bgx.setTransform(1, 0, 0, 1, 0, 0);
  bgx.drawImage(makeBackdrop(bgc.width, bgc.height, sd, yH * sd / dpr, th,
    { sx: g.sun.x * sd, sy: g.sun.y * sd, sr: g.sun.r * sd, fx: g.island.x * sd, fy: g.island.y * sd, u: g.k * sd / MOCKUP_K }), 0, 0);
  // the water layer at full resolution (thin lines), from the horizon down
  fxc.width = W; fxc.height = H - yH;
  fxc.style.top = `${yH / dpr}px`; fxc.style.height = `${(H - yH) / dpr}px`;
  shimmer = makeShimmer(W, H, dpr, yH, th);
  bgInfo = { W, H, yH, dpr, px: g.island.x * dpr, py: g.island.y * dpr, k: g.k * dpr, theme: th, vw: g.vw, vh: g.vh, sun: g.sun };
  layoutOrbits(g);
  if (reduceMotion) drawFx(0);
}

function layoutScene() { if (placeScene()) buildBackdrop(); }

// While the window is being dragged only the css size changes (the old bitmaps are stretched for a moment);
// sprites, masks and backdrop are rebuilt once, after resize events have stopped.
let rebuildTimer = 0;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { buildBackdrop(); resize(); if (reduceMotion) render(0); }, 150);
}

// ---- the rings round the sun ------------------------------------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
let orbitDots = [];
function layoutOrbits(g) {
  orbitSvg.setAttribute('viewBox', `0 0 ${g.vw} ${g.vh}`);
  orbitSvg.replaceChildren();
  orbitDots = [];
  const { x, y, r } = g.sun;
  for (const o of ORBITS) {
    const ring = document.createElementNS(SVGNS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('cx', x + o.cx * r); ring.setAttribute('cy', y + o.cy * r); ring.setAttribute('r', o.r * r);
    orbitSvg.append(ring);
    for (const d of o.dots) {
      const halo = document.createElementNS(SVGNS, 'circle'), dot = document.createElementNS(SVGNS, 'circle');
      halo.setAttribute('class', 'halo'); halo.setAttribute('r', d.s * 3.4);
      dot.setAttribute('class', 'dot'); dot.setAttribute('r', d.s);
      orbitSvg.append(halo, dot);
      orbitDots.push({ o, d, halo, dot, cx: x + o.cx * r, cy: y + o.cy * r, R: o.r * r });
    }
  }
  moveOrbitDots(0);
}
function moveOrbitDots(t) {
  for (const p of orbitDots) {
    const a = p.d.a + (reduceMotion ? 0 : t * p.d.w);
    const x = p.cx + Math.cos(a) * p.R, y = p.cy + Math.sin(a) * p.R;
    p.dot.setAttribute('cx', x); p.dot.setAttribute('cy', y); p.halo.setAttribute('cx', x); p.halo.setAttribute('cy', y);
  }
}

// the moving part of the backdrop: shimmer on the water and the rings spreading from the slab. The layer starts at the
// horizon, so everything is drawn shifted up by it.
function drawFx(t) {
  if (!bgInfo) return;
  const P = PAL[bgInfo.theme];
  const { px, py, k, dpr, yH, W } = bgInfo;
  fxx.setTransform(1, 0, 0, 1, 0, 0);
  fxx.clearRect(0, 0, W, fxc.height);
  fxx.setTransform(1, 0, 0, 1, 0, -yH);
  for (const s of shimmer) {
    const a = 0.03 + 0.17 * Math.max(0, Math.sin(t * s.sp + s.ph));
    fxx.fillStyle = `rgba(${P.streak[s.warm ? 1 : 0]},${a.toFixed(3)})`;
    fxx.fillRect(s.x, s.y, s.w, s.h);
  }
  fxx.lineWidth = 1.1 * dpr;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const f = reduceMotion ? 0.12 + i * 0.19 : ((t * 0.035 + i / n) % 1);
    const r = (690 + f * 640) * k;
    fxx.strokeStyle = `rgba(${P.ring},${(P.ringA * Math.sin(f * Math.PI)).toFixed(3)})`;
    fxx.beginPath(); fxx.ellipse(px, py + 6 * k, r, r * 0.125, 0, 0, Math.PI * 2); fxx.stroke();
  }
}

// ---- sprites and the leaf items -------------------------------------------------------------------------------------
// direction from the stem to the visual centre of a sprite
function spriteDirAngle(meta, flip) {
  const dx = meta.centroid[0] - meta.pivot[0];
  const dy = meta.centroid[1] - meta.pivot[1];
  return Math.atan2(dy, flip ? -dx : dx);
}

function buildItems(anchors) {
  const out = [];
  const blades = Object.keys(data.sprites).filter((n) => n.startsWith('leaf'));
  const edges = Object.keys(data.sprites).filter((n) => n.startsWith('side'));
  const mix = (r) => r[0] + rnd() * (r[1] - r[0]);
  const add = (a, twig, z, under) => {
    const edge = rnd() < EDGE_SHARE[0] + (EDGE_SHARE[1] - EDGE_SHARE[0]) * under;
    const names = edge ? edges : blades;
    const name = names[Math.floor(rnd() * names.length)];
    const m = data.sprites[name];
    const side = Math.cos(twig) < 0 ? -1 : 1; // the leaf points to the left or to the right of its node
    // a blade lies in its layer the way the twig has it; the layer is seen from the side (`flat`) and hangs a little (`tilt`).
    // A leaf seen edge-on is such a picture already: it is only turned to the horizontal
    const dir = edge ? Math.atan2(Math.sin(twig) * (1 - EDGE_LEVEL) + EDGE_DROOP, Math.cos(twig) + side * EDGE_LEVEL) : twig;
    const flat = edge ? 1 : mix(LEAF_FLAT);
    const tilt = edge ? 0 : side * mix(LEAF_DROOP);
    // a leaf seen edge-on keeps its upper side up: it is mirrored to the side it points to
    const flip = edge ? (side > 0) !== (m.centroid[0] > m.pivot[0]) : rnd() < 0.5, f = flip ? -1 : 1;
    const s = 0.78 + rnd() * 0.4;
    // no two blades are alike: a little shorter, a little narrower
    const fl = edge ? 1 : 0.8 + rnd() * 0.2;
    const fw = edge ? 1 : 0.85 + rnd() * 0.15;
    const phi = spriteDirAngle(m, flip), cp = Math.cos(phi), sp = Math.sin(phi);
    const x = a.x + (rnd() - 0.5) * 8, y = a.y + (rnd() - 0.5) * 8;
    const reach = Math.hypot(m.centroid[0] - m.pivot[0], m.centroid[1] - m.pivot[1]) * TYPE_SCALE[edge ? 'side' : 'leaf'] * s * fl;
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const rx = Math.cos(dir) * reach, ry = Math.sin(dir) * reach * flat;
    out.push({
      name, x, y, z, dir0: dir,
      // sprite px (from the end of the stem) -> the leaf lying along +x, flipped, foreshortened and scaled
      b: [fl * s * cp * f, fl * s * sp, -fw * s * sp * f, fw * s * cp],
      flat, ct, st,
      cx: x + ct * rx - st * ry, cy: y + st * rx + ct * ry, // the middle of the blade
      tone: 0,
      d: a.d, tip: a.tip,
      ox: 0, oy: 0, vx: 0, vy: 0, th: 0, vth: 0,
      k: 55 + rnd() * 45,
      phase: rnd() * 6.28,
    });
  };
  for (const a of anchors) {
    if (anchors.filter((q) => q !== a && Math.hypot(q.x - a.x, q.y - a.y) < NODE_ALONE[0]).length < NODE_ALONE[1]) continue;
    if (!a.tip && rnd() > NODE_SHARE[0] + (NODE_SHARE[1] - NODE_SHARE[0]) * a.d) continue;
    // a pair: one leaf on each side of the twig, one of them behind it and one in front
    const below = anchors.filter((q) => Math.abs(q.x - a.x) < UNDER[0] && q.y > a.y + 20 && q.y < a.y + UNDER[1]).length;
    const under = Math.max(0, 1 - below / UNDER[2]);
    const near = rnd() < 0.5 ? 1 : -1;
    add(a, a.ang + near * mix(PAIR_OPEN), 0.5 + rnd() * 0.5, under);
    add(a, a.ang - near * mix(PAIR_OPEN), rnd() * 0.5, under);
    // the end of a twig carries one more, pointing on the way the twig grows
    if (a.tip) add(a, a.ang + (rnd() - 0.5) * 0.6, 0.55 + rnd() * 0.45, under);
  }
  // the shade: how much foliage lies between a leaf and the sun
  for (const p of out) {
    let shade = 0;
    for (const q of out) {
      const dx = q.cx - p.cx, dy = q.cy - p.cy, dist = Math.hypot(dx, dy);
      if (q === p || dist < 1 || dist > SHADE_REACH) continue;
      const toSun = (dx * LIGHT[0] + dy * LIGHT[1]) / dist;
      if (toSun > 0.15) shade += (1 - dist / SHADE_REACH) * toSun;
    }
    // the leaves in front are in the light whatever is above them; the deeper a leaf, the more the shade counts
    const deep = 1 - p.z;
    const dark = 0.55 * deep + 0.45 * Math.min(1, shade / SHADE_FULL) * (0.5 + 0.5 * deep) + (rnd() - 0.5) * 0.14;
    p.tone = Math.floor(clamp(dark, 0, 0.999) * TONES.length);
  }
  // the deepest leaf is drawn first; the first `backCount` are behind the twigs
  out.sort((p, q) => p.z - q.z);
  backCount = out.findIndex((p) => p.z >= BACK);
  if (backCount < 0) backCount = out.length;
  return out;
}

function buildSprites() {
  sprites = {};
  for (const name of Object.keys(spriteImgs)) {
    const type = name.replace(/\d+$/, '');
    const F = TYPE_SCALE[type] * view.S;            // device px per sprite px
    const c = prescale(spriteImgs[name], F);
    const m = data.sprites[name];
    const px = m.pivot[0] * F, py = m.pivot[1] * F, cx = m.centroid[0] * F, cy = m.centroid[1] * F;
    sprites[name] = { c, px, py, cx, cy, F };
    if (type === 'side' || type === 'leaf') {
      // one picture per tone. Every blade is a little darker towards its stem (it lies in its own shade there), which
      // is what makes a leaf read as a body and not as a flat cut-out.
      sprites[name].tones = TONES.map((tone) => {
        const v = mkCanvas(c.width, c.height), g = v.getContext('2d');
        g.drawImage(c, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        const gr = g.createLinearGradient(px, py, px + (cx - px) * 2, py + (cy - py) * 2);
        gr.addColorStop(0, 'rgba(90,0,20,0.3)'); gr.addColorStop(0.65, 'rgba(90,0,20,0)');
        g.fillStyle = gr; g.fillRect(0, 0, v.width, v.height);
        if (tone) {
          // the blend keeps the veins; it also paints beside the leaf, so the leaf is cut out again afterwards
          g.globalCompositeOperation = tone[0]; g.fillStyle = tone[1]; g.fillRect(0, 0, v.width, v.height);
          g.globalCompositeOperation = 'destination-in'; g.drawImage(c, 0, 0);
        }
        return v;
      });
      // the soft shadow of the blade: its silhouette, blurred by scaling down and up again
      const blur = SHADOW_BLUR * view.S, pad = Math.ceil(blur * 2);
      const sil = mkCanvas(c.width + 2 * pad, c.height + 2 * pad), sg = sil.getContext('2d');
      sg.drawImage(c, pad, pad);
      sg.globalCompositeOperation = 'source-in';
      const P = PAL[theme()];
      sg.fillStyle = `rgba(${P.leaf},${P.leafA})`; sg.fillRect(0, 0, sil.width, sil.height);
      const small = prescale(sil, 1 / Math.max(2, blur * 0.8));
      const shadow = mkCanvas(sil.width, sil.height), hg = shadow.getContext('2d');
      hg.imageSmoothingQuality = 'high'; hg.drawImage(small, 0, 0, sil.width, sil.height);
      sprites[name].shadow = shadow; sprites[name].pad = pad;
    }
    // the same picture at the size of a falling leaf
    if (type === 'leaf') {
      const f2 = TYPE_SCALE.fall * view.S;
      sprites[`fall:${name}`] = { c: prescale(spriteImgs[name], f2), cx: m.centroid[0] * f2, cy: m.centroid[1] * f2 };
    }
  }
  platCanvas = prescale(platImg, view.S);
  lapCanvas = prescale(lapImg, view.S * LAPTOP.scale);
  buildWater();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth;
  if (!cssW) return;
  const px = Math.round(cssW * dpr), py = Math.round(cssW * dpr * WORLD.h / WORLD.w);
  if (canvas.width === px && view.dpr === dpr && platCanvas && view.theme === theme()) return;
  canvas.width = px; canvas.height = py;
  view.dpr = dpr; view.cssW = cssW; view.theme = theme();
  view.S = px / WORLD.w;
  view.tx = -WORLD.x0 * view.S;
  view.ty = -WORLD.y0 * view.S;
  if (platImg) buildSprites();
}

// ---- integration: waterline, reflection ------------------------------------------------------------------------------
// The tree is a separate render; these passes make it share light, colour and water with the scene.
const SINK = 22;         // world px of the slab that sit below the water surface
const REFLECT_H = 150;   // world px of mirrored slab below the waterline
const WATER_ROW = 900;   // the waterline is searched for from the bottom of the picture up to this world row
let waterY = null, wlMin = 0, wlMax = 0; // waterline (world y) per world column, valid column range
let layer, lctx, refl, rctx, subMask, fadeMask, reflFade;

// lowest opaque pixel of every column of the slab, smoothed, minus SINK = the waterline
function computeWaterline() {
  const P = data.platform;
  const w = platImg.width, h = platImg.height, y0 = Math.max(0, WATER_ROW - P.y), rows = h - y0;
  const g = mkCanvas(w, rows).getContext('2d', { willReadFrequently: true });
  g.drawImage(platImg, 0, y0, w, rows, 0, 0, w, rows);
  const d = g.getImageData(0, 0, w, rows).data;
  const bot = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= y0; y--) if (d[((y - y0) * w + x) * 4 + 3] > 140) { bot[x] = y + P.y; break; }
  const sm = new Float32Array(w).fill(NaN);
  for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let k = -14; k <= 14; k++) { const v = bot[x + k]; if (v === v) { s += v; n++; } }
    if (n > 14 && bot[x] === bot[x]) sm[x] = s / n;
  }
  let first = sm.findIndex((v) => v === v), last = w - 1;
  while (last > 0 && sm[last] !== sm[last]) last--;
  if (first < 0) throw new Error('computeWaterline: no slab pixels found');
  wlMin = first + P.x; wlMax = last + P.x;
  waterY = new Float32Array(w);
  for (let x = 0; x < w; x++) waterY[x] = sm[clamp(x, first, last)] - SINK;
}
const wlAt = (xw) => waterY[clamp(Math.round(xw - data.platform.x), 0, waterY.length - 1)];

function buildWater() {
  const W = canvas.width, H = canvas.height, S = view.S, dpr = view.dpr;
  const P = PAL[theme()];
  if (!waterY) computeWaterline();
  layer = mkCanvas(W, H); lctx = layer.getContext('2d');
  refl = mkCanvas(W, H); rctx = refl.getContext('2d');
  // everything below the waterline, tinted like water (applied with source-atop, so only the slab is affected)
  subMask = mkCanvas(W, H);
  const sg = subMask.getContext('2d');
  sg.setTransform(S, 0, 0, S, view.tx, view.ty);
  const px0 = data.platform.x;
  sg.beginPath(); sg.moveTo(WORLD.x0, waterY[0]);
  for (let x = 0; x < waterY.length; x++) sg.lineTo(x + px0, waterY[x]);
  sg.lineTo(WORLD.x0 + WORLD.w, waterY[waterY.length - 1]); sg.lineTo(WORLD.x0 + WORLD.w, 1500); sg.lineTo(WORLD.x0, 1500); sg.closePath();
  const tg = sg.createLinearGradient(0, ISLAND.y - 30, 0, ISLAND.y + 100);
  tg.addColorStop(0, P.sink[0][1]); tg.addColorStop(1, P.sink[1][1]);
  sg.fillStyle = tg; sg.fill();
  // opacity ramps: the slab fades into the water below the line; the reflection fades with depth
  const fm = mkCanvas(W, H), rf = mkCanvas(W, H);
  let wlLo = Infinity, wlHi = -Infinity;
  for (let x = 0; x < waterY.length; x++) { if (waterY[x] < wlLo) wlLo = waterY[x]; if (waterY[x] > wlHi) wlHi = waterY[x]; }
  const rx0 = Math.max(0, Math.floor(wlMin * S + view.tx) - 4), rx1 = Math.min(W, Math.ceil(wlMax * S + view.tx) + 4);
  const ry0 = Math.max(0, Math.floor(wlLo * S + view.ty)), ry1 = Math.min(H, Math.ceil((wlHi + REFLECT_H) * S + view.ty) + 1);
  const rw = rx1 - rx0, rh = ry1 - ry0;
  if (rw > 0 && rh > 0) {
    const fi = new ImageData(rw, rh), ri = new ImageData(rw, rh);
    for (let xd = rx0; xd < rx1; xd++) {
      const wl = wlAt((xd - view.tx) / S);
      for (let yd = ry0; yd < ry1; yd++) {
        const dist = (yd - view.ty) / S - wl;
        if (dist <= 0) continue;
        const i = ((yd - ry0) * rw + (xd - rx0)) * 4;
        fi.data[i + 3] = 255 * (0.12 + 0.75 * Math.min(1, dist / 34));
        if (dist < REFLECT_H) ri.data[i + 3] = 255 * P.reflA * Math.pow(1 - dist / REFLECT_H, 1.35);
      }
    }
    fm.getContext('2d').putImageData(fi, rx0, ry0); rf.getContext('2d').putImageData(ri, rx0, ry0);
  }
  fadeMask = fm; reflFade = rf;
  void dpr;
}

// slab, laptop, leaves on their own layer, graded to the scene light, base sunk into the water
function drawLayer(t) {
  const S = view.S, W = layer.width, H = layer.height, P = PAL[theme()];
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, W, H);
  lctx.drawImage(platCanvas, Math.round(view.tx + data.platform.x * S), Math.round(view.ty + data.platform.y * S));
  drawLaptop(lctx);
  drawItems(lctx, 0, backCount);
  drawTreeInFront(lctx, CROWN_Y);
  drawItems(lctx, backCount, items.length);
  // scene light: a warm rim from the sun's side, a cool bounce from the water below, a touch of haze; at night everything is bluer
  lctx.globalCompositeOperation = 'source-atop';
  lctx.setTransform(S, 0, 0, S, view.tx, view.ty);
  let g = lctx.createLinearGradient(0, 1040, 0, 720);
  g.addColorStop(0, P.bounce); g.addColorStop(1, 'rgba(0,0,0,0)');
  lctx.fillStyle = g; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.h);
  g = lctx.createLinearGradient(300, 0, 1000, 520);
  g.addColorStop(0, P.rim); g.addColorStop(1, 'rgba(0,0,0,0)');
  lctx.fillStyle = g; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.h);
  lctx.fillStyle = P.haze; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.h);
  if (P.night) { lctx.fillStyle = P.night; lctx.fillRect(WORLD.x0, WORLD.y0, WORLD.w, WORLD.h); }
  // sink the base: water tint, then fade towards the bottom
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.drawImage(subMask, 0, 0);
  lctx.globalCompositeOperation = 'destination-out';
  lctx.drawImage(fadeMask, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  void t;
}

// the laptop on the flat part of the slab, with the soft shadow of its base
function drawLaptop(g) {
  const S = view.S, P = PAL[theme()];
  const w = lapCanvas.width, h = lapCanvas.height;
  const x = view.tx + LAPTOP.cx * S - w / 2, y = view.ty + LAPTOP.base * S - h;
  g.save();
  g.translate(view.tx + LAPTOP.cx * S, view.ty + (LAPTOP.base + 3) * S); g.scale(1, 0.05);
  const sh = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.54);
  sh.addColorStop(0, `rgba(${P.shadow},${P.shadowA})`); sh.addColorStop(0.7, `rgba(${P.shadow},${P.shadowA * 0.4})`); sh.addColorStop(1, `rgba(${P.shadow},0)`);
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, w * 0.54, 0, Math.PI * 2); g.fill();
  g.restore();
  g.drawImage(lapCanvas, Math.round(x), Math.round(y));
  drawTreeInFront(g, WORLD.y0 + WORLD.h);
}

// The slab on the right, the moss, the trunk and the branches that reach over the laptop are in front of it: the
// picture of the tree is drawn again there (it is transparent everywhere else, so what is behind it stays visible),
// down to the world row `bottom`. The same puts the twigs in front of the leaves that are behind them.
function drawTreeInFront(g, bottom) {
  const S = view.S;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath();
  g.rect(view.tx + LAPTOP.front * S, 0, g.canvas.width, view.ty + bottom * S);
  g.rect(0, 0, g.canvas.width, view.ty + Math.min(bottom, LAPTOP.top) * S);
  g.clip();
  g.drawImage(platCanvas, Math.round(view.tx + data.platform.x * S), Math.round(view.ty + data.platform.y * S));
  g.restore();
}

// mirror image of the slab under the waterline, rippled column by column
function drawReflection(t) {
  const S = view.S, W = refl.width, H = refl.height, dpr = view.dpr, P = PAL[theme()];
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
  rctx.globalCompositeOperation = 'source-atop'; rctx.fillStyle = P.reflTint; rctx.fillRect(0, 0, W, H);
  rctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(refl, 0, 0);
}

function drawContactShadow() {
  const P = PAL[theme()];
  ctx.setTransform(view.S, 0, 0, view.S, view.tx, view.ty);
  ctx.save();
  ctx.translate(ISLAND.x, ISLAND.y + 22); ctx.scale(1, 0.1);
  const g = ctx.createRadialGradient(0, 0, 80, 0, 0, 840);
  g.addColorStop(0, `rgba(${P.shadow},${P.shadowA * 0.7})`); g.addColorStop(1, `rgba(${P.shadow},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 840, 0, 7); ctx.fill();
  ctx.restore();
}

function drawWaterEdge(t) {
  const S = view.S, P = PAL[theme()];
  ctx.setTransform(S, 0, 0, S, view.tx, view.ty);
  const g = ctx.createLinearGradient(wlMin, 0, wlMax, 0);
  g.addColorStop(0, `rgba(${P.edge},0)`); g.addColorStop(0.1, `rgba(${P.edge},${P.edgeA})`);
  g.addColorStop(0.9, `rgba(${P.edge},${P.edgeA})`); g.addColorStop(1, `rgba(${P.edge},0)`);
  ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = wlMin; x <= wlMax; x += 4) {
    const y = wlAt(x) + 1 + Math.sin(x * 0.07 + t * 2.1) * 0.9;
    if (x === wlMin) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// light mist over the water: a haze that thickens towards the slab plus a few slowly drifting soft patches
let mistBlob = null, mistRgb = '';
const MIST = [ // [x, y, size, speed, phase, alpha] in world units
  [260, 1010, 640, 9, 0.0, 0.2], [820, 1030, 720, -7, 2.1, 0.22], [1380, 1000, 640, 5, 4.0, 0.2],
  [560, 1090, 800, -4, 1.2, 0.18], [1100, 1080, 760, 6, 3.3, 0.18],
];
function drawMist(t) {
  const S = view.S, P = PAL[theme()];
  if (!mistBlob || mistRgb !== P.mist) {
    mistRgb = P.mist; mistBlob = mkCanvas(128, 128);
    const g = mistBlob.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, `rgba(${P.mist},1)`); rg.addColorStop(0.5, `rgba(${P.mist},0.45)`); rg.addColorStop(1, `rgba(${P.mist},0)`);
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  }
  ctx.setTransform(S, 0, 0, S, view.tx, view.ty);
  for (const [x, y, size, sp, ph, a] of MIST) {
    const dx = reduceMotion ? 0 : Math.sin(t * 0.006 * Math.abs(sp) + ph) * 70 * Math.sign(sp);
    ctx.globalAlpha = a * P.mistK * (0.8 + 0.2 * Math.sin(t * 0.3 + ph));
    ctx.drawImage(mistBlob, x + dx - size / 2, y - size * 0.18, size, size * 0.36);
  }
  ctx.globalAlpha = 1;
}

// at night the leaves glow a little
function drawGlow() {
  const P = PAL[theme()];
  if (!P.bloom) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = P.bloom;
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

// ---- pointer --------------------------------------------------------------------------------------------------------
function toWorld(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: WORLD.x0 + ((ev.clientX - r.left) / r.width) * WORLD.w,
    y: WORLD.y0 + ((ev.clientY - r.top) / r.height) * WORLD.h,
  };
}
// the canvas lets the page's text and buttons through, so the pointer is followed on the hero
hero.addEventListener('pointermove', (ev) => {
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
hero.addEventListener('pointerleave', () => { pointer.active = false; pointer.vx = pointer.vy = 0; });
hero.addEventListener('pointercancel', () => { pointer.active = false; pointer.vx = pointer.vy = 0; });
hero.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest('a, button')) return;
  const p = toWorld(ev);
  // a click shakes a few leaves loose around the pointer
  for (const it of items) {
    const dx = it.x + it.ox - p.x, dy = it.y + it.oy - p.y;
    const d = Math.hypot(dx, dy);
    if (d < HAND_RADIUS && Math.random() < 0.3) {
      const f = 1 - d / HAND_RADIUS;
      it.vx += (dx / (d + 1)) * 500 * f; it.vy += (dy / (d + 1)) * 500 * f;
      spawnFall(it, dx / (d + 1) * 120, dy / (d + 1) * 60);
    }
  }
});

// ---- falling leaves / ripples ---------------------------------------------------------------------------------------
function spawnFall(it, vx = 0, vy = 0) {
  if (fallen.length > 40) return;
  const names = Object.keys(data.sprites).filter((n) => n.startsWith('leaf'));
  fallen.push({
    name: 'fall:' + names[Math.floor(Math.random() * names.length)],
    x: it.x + it.ox, y: it.y + it.oy,
    vx: vx + (Math.random() - 0.5) * 30, vy,
    fall: 42 + Math.random() * 38,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.8,
    ph: Math.random() * 6.28, fr: 1.2 + Math.random() * 1.4,
    s: 0.8 + Math.random() * 0.5,
    floor: 1010 + Math.random() * 95,
    landed: false, tl: 0,
  });
}
function spawnRipple(x, y) {
  ripples.push({ x, y, t: 0 });
  if (ripples.length > 40) ripples.shift();
}

// ---- simulation -----------------------------------------------------------------------------------------------------
function wind(t, x, y) {
  const gust = 0.65 + 0.35 * Math.sin(t * 0.21 + 1.3);
  return gust * (Math.sin(t * 0.85 + x * 0.0035 + y * 0.002) * 0.7 + Math.sin(t * 1.9 + x * 0.008 - y * 0.003) * 0.3);
}

function step(dt, t) {
  const sp = Math.hypot(pointer.vx, pointer.vy);
  for (const it of items) {
    const w = reduceMotion ? 0 : wind(t, it.x, it.y);
    const eqx = w * 2.6 * (0.5 + it.d);
    const eqy = w * 1.0;
    const eqth = w * 0.09 * (0.4 + it.d * 0.8);
    let ax = -it.k * (it.ox - eqx) - 2 * 0.22 * Math.sqrt(it.k) * it.vx;
    let ay = -it.k * (it.oy - eqy) - 2 * 0.22 * Math.sqrt(it.k) * it.vy;
    let ath = -80 * (it.th - eqth) - 2 * 0.2 * Math.sqrt(80) * it.vth;
    if (pointer.active && sp > 20) {
      const dx = it.x + it.ox - pointer.x, dy = it.y + it.oy - pointer.y;
      const d = Math.hypot(dx, dy);
      if (d < HAND_RADIUS) {
        const f = (1 - d / HAND_RADIUS) ** 2;
        ax += pointer.vx * f * HAND_GAIN; ay += pointer.vy * f * HAND_GAIN;
        // slight push away from the hand centre so leaves part around it
        ax += (dx / (d + 1)) * sp * f * 0.1; ay += (dy / (d + 1)) * sp * f * 0.1;
        ath += pointer.vx * f * 0.005;
        if (Math.random() < f * Math.min(1, sp / 1400) * 0.006) spawnFall(it, pointer.vx * 0.12, pointer.vy * 0.12);
      }
    }
    it.vx += ax * dt; it.vy += ay * dt; it.vth += ath * dt;
    it.ox += it.vx * dt; it.oy += it.vy * dt; it.th += it.vth * dt;
    const m = Math.hypot(it.ox, it.oy);
    if (m > MAX_DISPLACE) { it.ox *= MAX_DISPLACE / m; it.oy *= MAX_DISPLACE / m; }
    it.th = clamp(it.th, -MAX_ROT, MAX_ROT);
  }
  pointer.vx *= Math.exp(-dt * 9); pointer.vy *= Math.exp(-dt * 9);

  // ambient leaves: now and then one lets go
  if (!reduceMotion && Math.random() < dt * 0.45) {
    const cand = items[Math.floor(Math.random() * items.length)];
    spawnFall(cand);
  }

  for (let i = fallen.length - 1; i >= 0; i--) {
    const p = fallen[i];
    if (!p.landed) {
      p.ph += dt * p.fr;
      p.vy += (p.fall - p.vy) * Math.min(1, dt * 1.6);
      const wv = wind(t, p.x, p.y) * 20;
      p.x += (p.vx + Math.sin(p.ph) * 38 + wv) * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 0.7);
      p.rot += (p.vr + Math.cos(p.ph) * 1.3) * dt;
      if (p.y >= p.floor) { p.landed = true; spawnRipple(p.x, p.y + 4); }
    } else {
      p.tl += dt;
      if (p.tl > 4.2) fallen.splice(i, 1);
    }
  }
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 2) ripples.splice(i, 1); }
}

// ---- drawing --------------------------------------------------------------------------------------------------------
function drawRipples() {
  const P = PAL[theme()];
  ctx.setTransform(view.S, 0, 0, view.S, view.tx, view.ty);
  ctx.lineWidth = 2;
  for (const r of ripples) {
    const k = r.t / 2;
    ctx.strokeStyle = `rgba(${P.ripple},${(P.rippleA * (1 - k)).toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, 8 + k * 80, (8 + k * 80) * 0.24, 0, 0, 7); ctx.stroke();
  }
}

// the leaves `from` to `to` (they are sorted from the deepest to the nearest)
function drawItems(g, from, to) {
  const S = view.S;
  for (let i = from; i < to; i++) {
    const it = items[i];
    const spr = sprites[it.name];
    const rot = it.dir0 + it.th;
    const cos = Math.cos(rot), sin = Math.sin(rot), b = it.b;
    // the leaf in its layer, the layer seen from the side, the layer hanging
    const pa = cos * b[0] - sin * b[2], pb = (sin * b[0] + cos * b[2]) * it.flat, pc = cos * b[1] - sin * b[3], pd = (sin * b[1] + cos * b[3]) * it.flat;
    const ma = it.ct * pa - it.st * pb, mb = it.st * pa + it.ct * pb, mc = it.ct * pc - it.st * pd, md = it.st * pc + it.ct * pd;
    const X = (it.x + it.ox) * S + view.tx, Y = (it.y + it.oy) * S + view.ty;
    const off = (SHADOW_OFF[0] + (SHADOW_OFF[1] - SHADOW_OFF[0]) * it.z) * S;
    // the shadow of the leaf falls on what lies behind it (twigs, trunk, laptop, the leaves drawn before), and only there
    g.globalCompositeOperation = 'source-atop';
    g.setTransform(ma, mb, mc, md, X - LIGHT[0] * off, Y - LIGHT[1] * off);
    g.drawImage(spr.shadow, -spr.px - spr.pad, -spr.py - spr.pad);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(ma, mb, mc, md, X, Y);
    g.drawImage(spr.tones[it.tone], -spr.px, -spr.py);
  }
}

function drawFallen() {
  const S = view.S;
  for (const p of fallen) {
    const spr = sprites[p.name];
    let alpha = 1, fy;
    if (p.landed) { alpha = 1 - clamp((p.tl - 2.2) / 2, 0, 1); fy = 0.4; }
    else fy = 0.25 + 0.75 * Math.abs(Math.cos(p.ph * 0.8));
    ctx.globalAlpha = alpha;
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    const sc = p.s;
    ctx.setTransform(cos * sc, sin * sc, -sin * sc * fy, cos * sc * fy, p.x * S + view.tx, p.y * S + view.ty);
    ctx.drawImage(spr.c, -spr.cx, -spr.cy);
  }
  ctx.globalAlpha = 1;
}

function render(t) {
  if (!layer) return; // not laid out yet: nothing to draw on (the rebuild after the first resize draws it)
  drawFx(t);
  moveOrbitDots(t);
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
  drawFallen();
}

// ---- loop -----------------------------------------------------------------------------------------------------------
// The hero moves slowly and softly, so a very fast display gets no faster hero (see the main page).
const FRAME_GAP = 1 / 110;

// Tells the page that the hero is on screen (or that it failed): the text and the picture fade in then.
let heroDone = false;
function markHero(state) {
  if (heroDone) return;
  heroDone = true;
  root.dataset.hero = state;
  document.dispatchEvent(new Event('hero:done'));
}

function frame(now) {
  if (!running) return;
  const t = now / 1000;
  // the canvas has no size yet (a hidden page, a hero that is not laid out): there is nothing to draw on, so wait
  if (!layer || (lastFrame && t - lastFrame < FRAME_GAP)) { requestAnimationFrame(frame); return; }
  const dt = clamp(t - lastFrame, 0, 1 / 30);
  lastFrame = t;
  step(dt, t);
  render(t);
  markHero('ready');
  requestAnimationFrame(frame);
}

function start() {
  if (reduceMotion) { resize(); render(0); markHero('ready'); return; }
  running = true; lastFrame = 0; requestAnimationFrame(frame);
}
function stop() { running = false; }

// a change of the colour scheme: the masks and the backdrop carry its colours, so they are drawn again
document.addEventListener('themechange', () => {
  if (!platImg) return;
  buildBackdrop(true);
  resize();
  if (reduceMotion) render(0);
});

// Everything the hero needs is fetched at once: the data file, the slab with the tree, the laptop and all sprites.
async function init() {
  const meta = await loadJSON('assets/scene/scene.json');
  const [plat, lap, sprs] = await Promise.all([
    loadImage('assets/scene/' + meta.platform.file),
    loadImage('assets/scene/' + meta.laptop.file),
    Promise.all(Object.keys(meta.sprites).map(async (n) => [n, await loadImage(`assets/scene/leaves/${n}.webp`)])),
  ]);
  data = meta; platImg = plat; lapImg = lap; spriteImgs = Object.fromEntries(sprs);
  items = buildItems(meta.anchors.map(([x, y, ang, d, tip]) => ({ x, y, ang, d, tip: !!tip })));
  layoutScene();
  resize();
  new ResizeObserver(() => { if (placeScene()) scheduleRebuild(); }).observe(hero);
  start();
  new ResizeObserver(scheduleRebuild).observe(canvas);
  new IntersectionObserver(([e]) => {
    if (reduceMotion) return;
    if (e.isIntersecting && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); }
    else if (!e.isIntersecting) stop();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (!reduceMotion && !running) { running = true; lastFrame = 0; requestAnimationFrame(frame); } });
}

init().catch((err) => { console.error(err); hero.classList.add('hero--static'); markHero('static'); });
