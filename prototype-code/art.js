// All artwork drawn in code: blossom / bud / leaf / petal sprites, the mossy island and the backdrop.
// Sprites are rendered once per layout at device resolution (u = device px per world unit).

import { mulberry32, TAU, lerp } from './util.js';

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// ---- sprites ---------------------------------------------------------------------------
const BLOSSOM_R = 12.5, LEAF_L = 31, BUD_L = 13, PETAL_R = 9;

function petalPath(g, R) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(R * 0.2, -R * 0.42, R * 0.8, -R * 0.54, R * 0.98, -R * 0.17);
  g.quadraticCurveTo(R * 0.94, -R * 0.05, R * 0.86, 0);
  g.quadraticCurveTo(R * 0.94, R * 0.05, R * 0.98, R * 0.17);
  g.bezierCurveTo(R * 0.8, R * 0.54, R * 0.2, R * 0.42, 0, 0);
  g.closePath();
}

function petalFill(g, R, tint) {
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
  gr.addColorStop(0, tint[0]); gr.addColorStop(0.3, tint[1]); gr.addColorStop(0.7, tint[2]); gr.addColorStop(1, tint[3]);
  return gr;
}

const TINTS = [
  ['#e98aa6', '#f6c2d1', '#fce6ed', '#fff7f9'],
  ['#ea93ab', '#f8cbd8', '#fdecf1', '#fffafb'],
  ['#e07f9e', '#f3b6c8', '#fadbe4', '#fff0f4'],
  ['#ee9db3', '#f9d2de', '#fdeff3', '#ffffff'],
];

function drawBlossom(g, size, variant, R) {
  const rnd = mulberry32(900 + variant * 31);
  const rad = R;
  g.save();
  g.translate(size / 2, size / 2);
  const squash = variant >= 4;
  if (squash) { g.rotate(rnd() * TAU); g.scale(1, 0.5 + rnd() * 0.12); }
  const tint = TINTS[variant % TINTS.length];
  const rot0 = rnd() * TAU;
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate(rot0 + (i * TAU) / 5 + (rnd() - 0.5) * 0.18);
    const rr = rad * (0.9 + rnd() * 0.18);
    petalPath(g, rr);
    g.fillStyle = petalFill(g, rr, tint);
    g.fill();
    g.strokeStyle = 'rgba(205,110,145,0.42)'; g.lineWidth = Math.max(0.6, rad * 0.045); g.stroke();
    // faint central vein
    g.beginPath(); g.moveTo(rr * 0.1, 0); g.lineTo(rr * 0.62, 0);
    g.strokeStyle = 'rgba(214,120,150,0.28)'; g.lineWidth = Math.max(0.5, rad * 0.03); g.stroke();
    g.restore();
  }
  // warm centre + stamens
  const cg = g.createRadialGradient(0, 0, 0, 0, 0, rad * 0.3);
  cg.addColorStop(0, 'rgba(224,96,138,0.8)'); cg.addColorStop(1, 'rgba(224,96,138,0)');
  g.fillStyle = cg; g.beginPath(); g.arc(0, 0, rad * 0.3, 0, TAU); g.fill();
  g.lineWidth = Math.max(0.5, rad * 0.04);
  for (let i = 0; i < 8; i++) {
    const a = rnd() * TAU, l = rad * (0.3 + rnd() * 0.16);
    g.strokeStyle = 'rgba(214,92,132,0.85)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
    g.fillStyle = '#f6d98a';
    g.beginPath(); g.arc(Math.cos(a) * l, Math.sin(a) * l, Math.max(0.6, rad * 0.055), 0, TAU); g.fill();
  }
  g.restore();
}

function drawBud(g, L, variant) {
  const W = L * 0.36;
  g.save();
  g.translate(2, L * 0.5);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(L * 0.2, -W * 1.1, L * 0.78, -W * 0.95, L, 0);
  g.bezierCurveTo(L * 0.78, W * 0.95, L * 0.2, W * 1.1, 0, 0);
  const gr = g.createLinearGradient(0, 0, L, 0);
  gr.addColorStop(0, variant ? '#d27a96' : '#d98aa2'); gr.addColorStop(0.6, '#f0a9bf'); gr.addColorStop(1, '#fbd3de');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(190,90,125,0.5)'; g.lineWidth = Math.max(0.6, L * 0.05); g.stroke();
  // little green sepal at the base
  g.fillStyle = '#6fa57a'; g.beginPath(); g.ellipse(L * 0.05, 0, L * 0.12, W * 0.55, 0, 0, TAU); g.fill();
  g.restore();
}

function drawLeaf(g, L, variant) {
  const asp = [0.4, 0.5, 0.34][variant % 3];
  const W = L * asp * 0.5;
  const bendY = [0.06, -0.05, 0.1][variant % 3] * L; // slight curve
  g.save();
  g.translate(2, L * 0.4);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(L * 0.22, -W * 1.05 + bendY, L * 0.68, -W * 0.95 + bendY, L, bendY * 0.4);
  g.bezierCurveTo(L * 0.7, W * 0.8 + bendY, L * 0.25, W * 1.0 + bendY, 0, 0);
  const gr = g.createLinearGradient(0, -W, 0, W);
  const hue = [['#a9de9d', '#4aa67f'], ['#9bd994', '#3f9877'], ['#b6e4a4', '#58b087']][variant % 3];
  gr.addColorStop(0, hue[0]); gr.addColorStop(1, hue[1]);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(30,100,80,0.5)'; g.lineWidth = Math.max(0.6, L * 0.03); g.stroke();
  // midrib and faint side veins
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(235,255,225,0.55)'; g.lineWidth = Math.max(0.6, L * 0.035);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, bendY * 0.9, L * 0.92, bendY * 0.4); g.stroke();
  g.strokeStyle = 'rgba(235,255,225,0.28)'; g.lineWidth = Math.max(0.5, L * 0.02);
  for (let i = 1; i <= 3; i++) {
    const x = L * (0.16 + i * 0.18), y = bendY * (i * 0.2);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * 0.14, y - W * 0.55); g.moveTo(x, y); g.lineTo(x + L * 0.14, y + W * 0.5); g.stroke();
  }
  g.restore();
  return { ox: 2, oy: L * 0.4 };
}

export function makeSprites(u) {
  const sp = { blossom: [], bud: [], leaf: [], petal: [] };
  const R = BLOSSOM_R * u, size = Math.ceil(R * 2 + 4);
  for (let v = 0; v < 6; v++) {
    const c = canvasOf(size, size); drawBlossom(c.getContext('2d'), c.width, v, R);
    sp.blossom.push({ c, ox: c.width / 2, oy: c.height / 2 });
  }
  const bl = BUD_L * u;
  for (let v = 0; v < 2; v++) {
    const c = canvasOf(bl + 6, bl * 0.9 + 4); drawBud(c.getContext('2d'), bl, v);
    sp.bud.push({ c, ox: 2, oy: bl * 0.5 });
  }
  const ll = LEAF_L * u;
  for (let v = 0; v < 3; v++) {
    const c = canvasOf(ll + 6, ll * 0.9 + 4); const o = drawLeaf(c.getContext('2d'), ll, v);
    sp.leaf.push({ c, ox: o.ox, oy: o.oy });
  }
  const pr = PETAL_R * u, ps = Math.ceil(pr * 1.2);
  for (let v = 0; v < 3; v++) {
    const c = canvasOf(ps + 4, pr * 1.2 + 4); const g = c.getContext('2d');
    g.translate(2, c.height / 2); g.rotate(0);
    petalPath(g, pr); g.fillStyle = petalFill(g, pr, TINTS[v]); g.fill();
    g.strokeStyle = 'rgba(205,110,145,0.4)'; g.lineWidth = Math.max(0.5, pr * 0.05); g.stroke();
    sp.petal.push({ c, ox: 2 + pr * 0.45, oy: c.height / 2 });
  }
  return sp;
}

// ---- island ---------------------------------------------------------------------------
export const ISLAND_RECT = { x0: -270, y0: -150, w: 540, h: 190 };

// Rounded polygon: straight edges with softened corners (reads as a faceted stone)
function stonePath(g, v, k = 0.3) {
  const n = v.length;
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const p = v[(i + n - 1) % n], a = v[i], b = v[(i + 1) % n];
    const s = lerp2(a, p, k), e = lerp2(a, b, k);
    if (i === 0) g.moveTo(s[0], s[1]); else g.lineTo(s[0], s[1]);
    g.quadraticCurveTo(a[0], a[1], e[0], e[1]);
  }
  g.closePath();
}

const LIGHT_ANG = Math.atan2(-0.83, -0.55); // direction towards the light (upper left)

const STONES = [
  // [palette light, mid, dark]
  ['#cdbcc6', '#8d7a89', '#4f4152'],
  ['#c9c0c3', '#857d84', '#493f4b'],
  ['#d3bfc2', '#907a82', '#52414b'],
  ['#c3c4c9', '#7d808f', '#444659'],
  ['#d0c2bd', '#8c7d77', '#4e423f'],
];

function drawStone(g, rock, rnd) {
  const { cx, cy, rx, ry, pal } = rock;
  const n = 9 + Math.floor(rnd() * 3), rot = rnd() * TAU;
  const v = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU + (rnd() - 0.5) * 0.25, k = 0.84 + rnd() * 0.24;
    v.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  stonePath(g, v);
  const gr = g.createLinearGradient(cx - rx * 0.6, cy - ry, cx + rx * 0.5, cy + ry);
  gr.addColorStop(0, pal[0]); gr.addColorStop(0.5, pal[1]); gr.addColorStop(1, pal[2]);
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  // facets, lit by direction
  const c2 = [cx - rx * 0.12, cy - ry * 0.22];
  for (let i = 0; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n];
    const ang = Math.atan2((a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cx);
    const L = Math.cos(ang - LIGHT_ANG);
    g.beginPath(); g.moveTo(c2[0], c2[1]); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath();
    g.fillStyle = L > 0 ? `rgba(255,242,246,${(0.2 * L).toFixed(3)})` : `rgba(28,18,40,${(0.3 * -L).toFixed(3)})`;
    g.fill();
  }
  // soft top light
  const hl = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.6, 2, cx - rx * 0.35, cy - ry * 0.6, rx * 0.75);
  hl.addColorStop(0, 'rgba(255,240,246,0.3)'); hl.addColorStop(1, 'rgba(255,240,246,0)');
  g.fillStyle = hl; g.fillRect(cx - rx * 1.2, cy - ry * 1.2, rx * 2.4, ry * 2.4);
  // cracks and speckles
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let j = 0; j < 2; j++) {
    let x = cx + (rnd() - 0.5) * rx * 1.2, y = cy - ry * (0.2 + rnd() * 0.5);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (rnd() - 0.4) * rx * 0.22; y += rnd() * ry * 0.3; g.lineTo(x, y); }
    g.strokeStyle = 'rgba(36,24,44,0.4)'; g.lineWidth = 1.1; g.stroke();
  }
  for (let i = 0; i < 46; i++) {
    const x = cx + (rnd() - 0.5) * rx * 1.9, y = cy + (rnd() - 0.5) * ry * 1.8;
    g.fillStyle = rnd() < 0.5 ? 'rgba(30,20,40,0.16)' : 'rgba(255,245,250,0.16)';
    g.beginPath(); g.arc(x, y, 0.7 + rnd() * 1.7, 0, TAU); g.fill();
  }
  // submerged part: teal tint below the waterline (y = 0) and a bright wet edge
  g.fillStyle = 'rgba(8,76,96,0.58)'; g.fillRect(cx - rx * 1.3, 0, rx * 2.6, ry * 2);
  g.fillStyle = 'rgba(210,250,255,0.4)'; g.fillRect(cx - rx * 1.3, -1, rx * 2.6, 1.6);
  g.restore();
  stonePath(g, v);
  g.strokeStyle = 'rgba(38,26,46,0.55)'; g.lineWidth = 1.4; g.stroke();
}

const MOSS_TONES = [['#2c5e48', '#478a57', '#8fcf78'], ['#33684d', '#54975c', '#a2dc82'], ['#285a47', '#3f7f52', '#7cc072'], ['#3a704e', '#63a460', '#b3e48a']];

function roughEllipse(g, cx, cy, rx, ry, rnd) {
  const n = 36, p1 = rnd() * TAU, p2 = rnd() * TAU;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, k = 1 + 0.09 * Math.sin(a * 5 + p1) + 0.06 * Math.sin(a * 9 + p2);
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

// one soft moss cushion: a few overlapping lobes, dark underneath, light on top
function cushion(g, x, y, r, rnd) {
  const t = MOSS_TONES[Math.floor(rnd() * MOSS_TONES.length)];
  const lobes = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < lobes; i++) {
    const ox = (rnd() - 0.5) * r * 1.3, oy = (rnd() - 0.5) * r * 0.5, lr = r * (0.55 + rnd() * 0.35);
    g.fillStyle = t[0]; g.beginPath(); g.ellipse(x + ox, y + oy + lr * 0.25, lr, lr * 0.72, 0, 0, TAU); g.fill();
    g.fillStyle = t[1]; g.beginPath(); g.ellipse(x + ox, y + oy, lr * 0.95, lr * 0.68, 0, 0, TAU); g.fill();
    g.fillStyle = t[2]; g.globalAlpha = 0.45; g.beginPath(); g.ellipse(x + ox - lr * 0.25, y + oy - lr * 0.3, lr * 0.5, lr * 0.3, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
}

function mossArea(g, reg, rnd, blades = true) {
  // continuous moss cap underneath so the cushions blend into one surface
  const grd = g.createLinearGradient(0, reg.cy - reg.ry, 0, reg.cy + reg.ry);
  grd.addColorStop(0, '#5b9f5f'); grd.addColorStop(1, '#2f6a50');
  roughEllipse(g, reg.cx, reg.cy + reg.ry * 0.1, reg.rx * 0.98, reg.ry * 0.95, rnd);
  g.fillStyle = grd; g.fill();
  const n = Math.round((reg.rx * reg.ry) / 7);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd());
    pts.push([reg.cx + Math.cos(a) * reg.rx * d, reg.cy + Math.sin(a) * reg.ry * d]);
  }
  pts.sort((p, q) => p[1] - q[1]);
  for (const [x, y] of pts) cushion(g, x, y, 1.8 + rnd() * 3.2, rnd);
  if (!blades) return;
  g.lineCap = 'round';
  const tones = ['#6fb066', '#8cc874', '#4f9a5c', '#a2d680'];
  for (let i = 0; i < n * 0.22; i++) {
    const x = reg.cx + (rnd() * 2 - 1) * reg.rx;
    const e = Math.sqrt(Math.max(0, 1 - ((x - reg.cx) / reg.rx) ** 2));
    const y = reg.cy - reg.ry * e + rnd() * 3;
    const lean = (rnd() - 0.5) * 4, h = 2.5 + rnd() * 3.5;
    g.strokeStyle = tones[Math.floor(rnd() * tones.length)]; g.lineWidth = 0.9 + rnd() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); g.stroke();
  }
}

export function makeIsland(u) {
  const { x0, y0, w, h } = ISLAND_RECT;
  const c = canvasOf(w * u, h * u);
  const g = c.getContext('2d');
  g.setTransform(u, 0, 0, u, -x0 * u, -y0 * u);
  const rnd = mulberry32(5150);

  // dark water under the island
  const sh = g.createRadialGradient(0, 0, 10, 0, 0, 235);
  sh.addColorStop(0, 'rgba(4,40,54,0.7)'); sh.addColorStop(1, 'rgba(4,40,54,0)');
  g.save(); g.translate(0, 6); g.scale(1, 0.13); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, 235, 0, TAU); g.fill(); g.restore();

  // stones, back to front: [cx, cy, rx, ry, palette]
  const stones = [
    [0, -66, 142, 52, 0], [-146, -50, 76, 36, 3], [154, -52, 80, 38, 1],
    [-104, -26, 82, 34, 2], [96, -24, 86, 35, 4], [-6, -9, 76, 25, 0],
    [-198, -13, 46, 21, 1], [196, -14, 50, 22, 3],
  ];
  const drawn = [];
  for (const [cx, cy, rx, ry, p] of stones) {
    const rock = { cx, cy, rx, ry, pal: STONES[p] };
    drawStone(g, rock, rnd);
    drawn.push(rock);
  }

  // moss on the tops and in the crevices
  const areas = [
    { cx: 0, cy: -96, rx: 134, ry: 22 }, { cx: -146, cy: -76, rx: 58, ry: 13 }, { cx: 154, cy: -79, rx: 62, ry: 13 },
    { cx: -104, cy: -48, rx: 58, ry: 11 }, { cx: 96, cy: -46, rx: 62, ry: 11 },
    { cx: -44, cy: -64, rx: 54, ry: 9 }, { cx: 58, cy: -62, rx: 56, ry: 9 },
    { cx: -196, cy: -30, rx: 28, ry: 6 }, { cx: 198, cy: -32, rx: 30, ry: 6 },
  ];
  for (const a of areas) mossArea(g, a, rnd);

  // foam line where stones meet the water
  g.strokeStyle = 'rgba(225,252,255,0.34)'; g.lineWidth = 1.2; g.setLineDash([16, 10]);
  g.beginPath(); g.ellipse(0, 4, 214, 9, 0, 0.1, Math.PI - 0.1); g.stroke();
  g.setLineDash([]);

  // front moss: drawn over the roots so they sink into the island
  const cf = canvasOf(w * u, h * u);
  const f = cf.getContext('2d');
  f.setTransform(u, 0, 0, u, -x0 * u, -y0 * u);
  const fr = mulberry32(8080);
  mossArea(f, { cx: 0, cy: -86, rx: 78, ry: 13 }, fr);
  mossArea(f, { cx: -96, cy: -78, rx: 44, ry: 8 }, fr);
  mossArea(f, { cx: 100, cy: -80, rx: 48, ry: 8 }, fr);
  return { c, front: cf, x0, y0 };
}

function softColumn(g, x, top, w, bottom, rgb, aTop, aMid, aBot) {
  const tmp = canvasOf(w, bottom - top);
  const t = tmp.getContext('2d');
  const v = t.createLinearGradient(0, 0, 0, tmp.height);
  v.addColorStop(0, `rgba(${rgb},${aTop})`); v.addColorStop(0.4, `rgba(${rgb},${aMid})`); v.addColorStop(1, `rgba(${rgb},${aBot})`);
  t.fillStyle = v; t.fillRect(0, 0, tmp.width, tmp.height);
  t.globalCompositeOperation = 'destination-in';
  const h = t.createLinearGradient(0, 0, tmp.width, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
  t.fillStyle = h; t.fillRect(0, 0, tmp.width, tmp.height);
  g.drawImage(tmp, x, top);
}

// ---- backdrop (static; the water shimmer and ripples are drawn per frame) -----------------
export function makeBackdrop(W, H, dpr, yH, wide) {
  const c = canvasOf(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(2026);
  // sky
  let gr = g.createLinearGradient(0, 0, 0, yH);
  gr.addColorStop(0, '#0a3045'); gr.addColorStop(0.55, '#14566f'); gr.addColorStop(1, '#3a9bb1');
  g.fillStyle = gr; g.fillRect(0, 0, W, yH + 2);
  // bokeh discs
  const cols = [[120, 235, 225], [140, 250, 190], [255, 190, 225], [150, 220, 255], [255, 215, 235]];
  for (let i = 0; i < 34; i++) {
    const big = i < 6;
    const r = (big ? 50 + rnd() * 60 : 10 + rnd() * 30) * dpr;
    const x = (big && i % 2 ? 0.55 + rnd() * 0.45 : rnd()) * W, y = rnd() * yH * 0.95;
    const col = cols[Math.floor(rnd() * cols.length)];
    const a = 0.1 + rnd() * 0.18;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${col},${a * 0.55})`); rg.addColorStop(0.75, `rgba(${col},${a * 0.8})`); rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // soft pink window light, upper right
  for (let i = 0; i < 4; i++) {
    const x = W * (0.7 + i * 0.07), w = W * 0.085, top = yH * (0.08 + (i % 2) * 0.1);
    softColumn(g, x, top, w, yH, '255,205,235', 0, 0.22, 0.07);
  }
  // water
  gr = g.createLinearGradient(0, yH, 0, H);
  gr.addColorStop(0, '#3a9bb1'); gr.addColorStop(0.18, '#2a86a0'); gr.addColorStop(0.6, '#10526a'); gr.addColorStop(1, '#082f42');
  g.fillStyle = gr; g.fillRect(0, yH, W, H - yH);
  // horizon haze
  const hz = g.createLinearGradient(0, yH - 30 * dpr, 0, yH + 40 * dpr);
  hz.addColorStop(0, 'rgba(190,240,245,0)'); hz.addColorStop(0.5, 'rgba(190,240,245,0.22)'); hz.addColorStop(1, 'rgba(190,240,245,0)');
  g.fillStyle = hz; g.fillRect(0, yH - 30 * dpr, W, 70 * dpr);
  // mirrored pink light in the water
  for (let i = 0; i < 4; i++) {
    const x = W * (0.7 + i * 0.07), w = W * 0.085;
    softColumn(g, x, yH, w, yH + (H - yH) * 0.55, '255,205,235', 0.17, 0.08, 0);
  }
  // readability for the text on the left
  if (wide) {
    const rg = g.createLinearGradient(0, 0, W * 0.62, 0);
    rg.addColorStop(0, 'rgba(7,38,56,0.72)'); rg.addColorStop(0.6, 'rgba(7,38,56,0.3)'); rg.addColorStop(1, 'rgba(7,38,56,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W * 0.62, H);
  } else {
    const rg = g.createLinearGradient(0, 0, 0, H * 0.5);
    rg.addColorStop(0, 'rgba(7,38,56,0.6)'); rg.addColorStop(1, 'rgba(7,38,56,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H * 0.5);
  }
  return c;
}

export function makeShimmer(W, H, dpr, yH) {
  const rnd = mulberry32(77);
  const list = [];
  for (let i = 0; i < 46; i++) {
    const depth = Math.pow(rnd(), 1.6);
    list.push({
      x: rnd() * W, y: yH + (H - yH) * depth + 4 * dpr,
      w: (20 + rnd() * 90) * (0.4 + depth) * dpr, h: (1 + rnd() * 1.4) * (0.5 + depth) * dpr,
      ph: rnd() * TAU, sp: 0.4 + rnd() * 0.9, pink: rnd() < 0.3,
    });
  }
  return list;
}
