// The painted backdrop of the hero: a warm washi sky, misty mountains, still water and the red sun. Light and dark
// are the same picture by day and at night. Everything is soft shapes, drawn at low resolution and scaled up with
// a blur, so it needs no detail and looks the same at every window size (the way the main page does it).
// The static layer is drawn once per layout; the shimmer on the water is drawn per frame by scene.js.
const TAU = Math.PI * 2;
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = {
  light: {
    sky: ['#f7ede5', '#f6ebe3'], glow: '255,250,246', glowA: 0.7,
    vignette: [{ x: 1.02, y: 0.35, r: 0.42, rgb: '212,184,176', a: 0.5 }, { x: -0.04, y: 0.42, r: 0.34, rgb: '226,203,194', a: 0.4 }, { x: 0.5, y: 0.04, r: 0.5, rgb: '255,247,240', a: 0.5 }],
    mountain: '146,124,120', mountainA: 1,
    water: ['#f1e6de', '#eadfd9', '#e6dad5'], haze: '255,251,247', hazeA: 0.62,
    sun: [[0, [190, 72, 54, 1]], [0.28, [212, 104, 86, 1]], [0.5, [226, 149, 134, 1]], [0.7, [235, 186, 172, 0.92]], [1, [240, 206, 195, 0.5]]], wisp: '255,247,242', wispA: 0.55,
    sunHalo: '240,170,150', sunHaloA: 0.18,
  },
  dark: {
    sky: ['#16151c', '#211c26'], glow: '140,44,40', glowA: 0.32,
    vignette: [{ x: 1.02, y: 0.35, r: 0.42, rgb: '70,30,40', a: 0.5 }, { x: -0.04, y: 0.42, r: 0.34, rgb: '34,30,48', a: 0.5 }, { x: 0.5, y: 0.04, r: 0.5, rgb: '48,40,56', a: 0.35 }],
    mountain: '72,66,88', mountainA: 1.1,
    water: ['#1a1920', '#121218', '#0d0d12'], haze: '120,70,76', hazeA: 0.22,
    sun: [[0, [168, 40, 34, 1]], [0.3, [186, 58, 50, 1]], [0.55, [150, 64, 66, 0.96]], [0.8, [92, 44, 56, 0.7]], [1, [50, 30, 42, 0]]], wisp: '210,130,120', wispA: 0.26,
    sunHalo: '170,60,50', sunHaloA: 0.22,
  },
};

// a ridge line made of bumps (cx, half-width, height in units of H) with a little roughness, filled down to the horizon
function drawRidge(g, W, yH, bumps, rgb, alpha, rnd, rough) {
  const pts = [];
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  for (let x = -20; x <= W + 20; x += 8) {
    let h = 0;
    for (const [cx, hw, ht] of bumps) { const u = (x - cx) / hw; h = Math.max(h, ht * Math.exp(-u * u * 1.4)); }
    const r = 1 + rough * (0.5 * Math.sin(x * 0.011 + ph[0]) + 0.3 * Math.sin(x * 0.027 + ph[1]) + 0.2 * Math.sin(x * 0.061 + ph[2]));
    pts.push([x, yH - h * r]);
  }
  g.beginPath(); g.moveTo(pts[0][0], yH + 4);
  for (const [x, y] of pts) g.lineTo(x, y);
  g.lineTo(pts[pts.length - 1][0], yH + 4); g.closePath();
  g.fillStyle = `rgba(${rgb},${alpha})`; g.fill();
}

// geo: { sx, sy, sr } the sun in device px; focus: { x, y } the place the ripples spread from
export function makeBackdrop(W, H, dpr, yH, theme, geo) {
  const P = PALETTE[theme] || PALETTE.light;
  const SC = 0.25, PAD = Math.round(14 * dpr);
  const far = canvasOf(W * SC, H * SC);
  const g = far.getContext('2d');
  g.scale(SC, SC);
  const rnd = mulberry32(2611);
  const q = geo.u; // device px per design unit of the mockup (the scene, not the window, sets the scale)

  // sky
  let gr = g.createLinearGradient(0, 0, 0, yH);
  gr.addColorStop(0, P.sky[0]); gr.addColorStop(1, P.sky[1]);
  g.fillStyle = gr; g.fillRect(-PAD, -PAD, W + 2 * PAD, yH + PAD + 2);
  const disc = (x, y, r, rgb, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${rgb},${a})`); rg.addColorStop(0.7, `rgba(${rgb},${a * 0.7})`); rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  for (const v of P.vignette) disc(W * v.x, yH * v.y, W * v.r, v.rgb, v.a);
  disc(geo.sx, geo.sy, geo.sr * 3.2, P.glow, P.glowA);

  // mountains: three ridges, the far ones paler, a mist band at the foot of each
  const mist = (a) => {
    const hz = g.createLinearGradient(0, yH - 130 * q, 0, yH + 8 * q);
    hz.addColorStop(0, `rgba(${P.haze},0)`); hz.addColorStop(1, `rgba(${P.haze},${a})`);
    g.fillStyle = hz; g.fillRect(-PAD, yH - 130 * q, W + 2 * PAD, 138 * q);
  };
  const m = q;
  drawRidge(g, W, yH, [[W * 0.31, W * 0.17, 108 * m], [W * 0.5, W * 0.1, 70 * m], [W * 0.1, W * 0.12, 60 * m]], P.mountain, 0.2 * P.mountainA, rnd, 0.35);
  mist(0.5);
  drawRidge(g, W, yH, [[W * 0.05, W * 0.2, 118 * m], [W * 0.33, W * 0.11, 70 * m], [W * 0.95, W * 0.17, 128 * m], [W * 0.78, W * 0.1, 70 * m]], P.mountain, 0.3 * P.mountainA, rnd, 0.45);
  mist(0.45);
  drawRidge(g, W, yH, [[W * 0.0, W * 0.17, 78 * m], [W * 0.2, W * 0.09, 36 * m], [W * 1.0, W * 0.1, 66 * m]], P.mountain, 0.34 * P.mountainA, rnd, 0.5);
  mist(0.55);

  // water
  gr = g.createLinearGradient(0, yH, 0, H);
  gr.addColorStop(0, P.water[0]); gr.addColorStop(0.4, P.water[1]); gr.addColorStop(1, P.water[2]);
  g.fillStyle = gr; g.fillRect(-PAD, yH, W + 2 * PAD, H - yH + PAD);
  const hz = g.createLinearGradient(0, yH - 24 * q, 0, yH + 60 * q);
  hz.addColorStop(0, `rgba(${P.haze},0)`); hz.addColorStop(0.35, `rgba(${P.haze},${P.hazeA})`); hz.addColorStop(1, `rgba(${P.haze},0)`);
  g.fillStyle = hz; g.fillRect(-PAD, yH - 24 * q, W + 2 * PAD, 84 * q);
  // a pale pool of light on the water where the sun and the slab are
  g.save(); g.translate(geo.fx, geo.fy); g.scale(1, 0.22); disc(0, 0, W * 0.4, P.haze, P.hazeA * 0.55); g.restore();

  // up-scale with a blur: two smoothed 2x steps, plus a real blur where the canvas supports it
  const mid = canvasOf(W / 2, H / 2), mg = mid.getContext('2d');
  mg.imageSmoothingQuality = 'high'; mg.drawImage(far, 0, 0, mid.width, mid.height);
  const c = canvasOf(W, H), cg = c.getContext('2d');
  cg.imageSmoothingQuality = 'high';
  if ('filter' in cg) cg.filter = `blur(${Math.round(4 * dpr)}px)`;
  cg.drawImage(mid, -PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
  cg.filter = 'none';

  drawSun(cg, geo.sx, geo.sy, geo.sr, P);
  return c;
}

// the sun: a disc that is vermilion at the top and dissolves into mist at the foot, with soft streaks of cloud across it
function drawSun(cg, x, y, r, P) {
  const size = Math.ceil(r * 2 + 4);
  const c = canvasOf(size, size), g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const lg = g.createLinearGradient(0, cy - r, 0, cy + r);
  for (const [t, [rr, gg, bb, aa]] of P.sun) lg.addColorStop(t, `rgba(${rr},${gg},${bb},${aa})`);
  g.fillStyle = lg; g.fillRect(0, 0, size, size);
  // streaks of cloud
  const wisps = [[-0.18, 0.16, 0.95, 0.075, 1], [0.22, 0.38, 0.85, 0.07, 0.85], [-0.12, 0.58, 0.8, 0.06, 0.7], [0.1, -0.12, 0.6, 0.05, 0.45]];
  for (const [dx, dy, rx, ry, k] of wisps) {
    g.save(); g.translate(cx + dx * r, cy + dy * r); g.scale(1, ry / rx);
    const wg = g.createRadialGradient(0, 0, 0, 0, 0, rx * r);
    wg.addColorStop(0, `rgba(${P.wisp},${P.wispA * k})`); wg.addColorStop(0.6, `rgba(${P.wisp},${P.wispA * k * 0.45})`); wg.addColorStop(1, `rgba(${P.wisp},0)`);
    g.fillStyle = wg; g.beginPath(); g.arc(0, 0, rx * r, 0, TAU); g.fill(); g.restore();
  }
  // a soft edge: the last few percent of the radius fade out
  g.globalCompositeOperation = 'destination-in';
  const eg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  eg.addColorStop(0, 'rgba(0,0,0,1)'); eg.addColorStop(0.94, 'rgba(0,0,0,1)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = eg; g.fillRect(0, 0, size, size);
  // the halo round it, then the disc
  const hg = cg.createRadialGradient(x, y, r * 0.9, x, y, r * 1.55);
  hg.addColorStop(0, `rgba(${P.sunHalo},${P.sunHaloA})`); hg.addColorStop(1, `rgba(${P.sunHalo},0)`);
  cg.fillStyle = hg; cg.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
  cg.drawImage(c, x - cx, y - cy);
}

export function makeShimmer(W, H, dpr, yH, theme) {
  const rnd = mulberry32(77);
  const list = [];
  for (let i = 0; i < 46; i++) {
    const depth = Math.pow(rnd(), 1.6);
    list.push({
      x: rnd() * W, y: yH + (H - yH) * depth + 4 * dpr,
      w: (20 + rnd() * 90) * (0.4 + depth) * dpr, h: (1 + rnd() * 1.4) * (0.5 + depth) * dpr,
      ph: rnd() * TAU, sp: 0.4 + rnd() * 0.9, warm: rnd() < 0.3,
    });
  }
  return list;
}
