// Code-drawn hero backdrop: sky with bokeh, pink window light, water, horizon haze, text readability.
// Static layer is rendered once per layout; shimmer streaks are drawn per frame by main.js.
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
// An out-of-focus "photo": everything is drawn as soft shapes at low resolution, then scaled up with a blur,
// so no detail is needed and it looks the same at every window size.
export function makeBackdrop(W, H, dpr, yH, wide, focus) {
  const SC = 0.25, PAD = Math.round(14 * dpr);
  const far = canvasOf(W * SC, H * SC);
  const g = far.getContext('2d');
  g.scale(SC, SC);
  const rnd = mulberry32(2026);
  const q = H / 860; // device px per design unit
  const fx = focus ? focus.x : W * 0.7, fy = focus ? focus.y : yH + (H - yH) * 0.4;
  const disc = (x, y, r, rgb, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${rgb},${a})`); rg.addColorStop(0.7, `rgba(${rgb},${a * 0.8})`); rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  // room / sky
  let gr = g.createLinearGradient(0, 0, 0, yH);
  gr.addColorStop(0, '#0f4a68'); gr.addColorStop(0.5, '#1b7292'); gr.addColorStop(1, '#4fb2c8');
  g.fillStyle = gr; g.fillRect(-PAD, -PAD, W + 2 * PAD, yH + PAD + 2);
  // hazy light patches
  for (let i = 0; i < 5; i++) disc(W * (0.15 + rnd() * 0.7), yH * (0.2 + rnd() * 0.6), (180 + rnd() * 160) * q, '110,215,235', 0.16);
  // green foliage bokeh, upper left
  const greens = ['120,215,140', '160,235,150', '90,200,190', '60,170,200'];
  for (let i = 0; i < 12; i++) disc(W * rnd() * 0.24, yH * rnd() * 0.55, (24 + rnd() * 46) * q, greens[i % 4], 0.22 + rnd() * 0.2);
  // scattered bokeh
  const cols = ['140,235,235', '170,245,235', '255,200,230', '160,225,255', '255,225,240'];
  for (let i = 0; i < 22; i++) disc(W * rnd(), yH * rnd() * 0.95, (10 + rnd() * 30) * q, cols[Math.floor(rnd() * cols.length)], 0.1 + rnd() * 0.16);
  // window with pink-white panes, right side
  const wx = W * 0.74, wy = yH * 0.05, ww = W * 0.34, wh = yH * 0.93, cols3 = 3, rows = 4;
  const gap = 7 * q, pw = (ww - gap * (cols3 - 1)) / cols3, ph = (wh - gap * (rows - 1)) / rows;
  for (let c = 0; c < cols3; c++) for (let r = 0; r < rows; r++) {
    const x = wx + c * (pw + gap), y = wy + r * (ph + gap);
    const lit = 0.5 + rnd() * 0.4 - r * 0.04;
    const pg = g.createLinearGradient(x, y, x + pw, y + ph);
    pg.addColorStop(0, `rgba(255,222,238,${lit})`); pg.addColorStop(1, `rgba(215,200,250,${lit * 0.75})`);
    g.fillStyle = pg; g.fillRect(x, y, pw, ph);
  }
  // pink glow around the window
  disc(wx + ww * 0.45, yH * 0.5, ww * 0.9, '255,190,225', 0.2);
  // blurred cherry branch with blossoms, top right
  const bez = (t, p0, p1, p2) => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
  const branches = [
    [[W * 1.04, H * 0.02], [W * 0.86, H * 0.05], [W * 0.68, H * 0.16]],
    [[W * 0.96, H * 0.06], [W * 0.9, H * 0.17], [W * 0.8, H * 0.27]],
  ];
  g.lineCap = 'round';
  for (const [p0, p1, p2] of branches) {
    g.strokeStyle = 'rgba(86,46,70,0.7)'; g.lineWidth = 7 * q;
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.stroke();
    for (let i = 0; i < 26; i++) {
      const [x, y] = bez(rnd(), p0, p1, p2);
      const ox = (rnd() - 0.5) * 70 * q, oy = (rnd() - 0.3) * 60 * q, r = (14 + rnd() * 22) * q;
      disc(x + ox, y + oy, r, rnd() < 0.5 ? '255,246,249' : '255,226,238', 0.75);
    }
  }
  // water
  gr = g.createLinearGradient(0, yH, 0, H);
  gr.addColorStop(0, '#58b8cc'); gr.addColorStop(0.18, '#2a8caa'); gr.addColorStop(0.6, '#146488'); gr.addColorStop(1, '#0b4260');
  g.fillStyle = gr; g.fillRect(-PAD, yH, W + 2 * PAD, H - yH + PAD);
  // horizon haze
  const hz = g.createLinearGradient(0, yH - 40 * q, 0, yH + 50 * q);
  hz.addColorStop(0, 'rgba(200,245,250,0)'); hz.addColorStop(0.5, 'rgba(200,245,250,0.3)'); hz.addColorStop(1, 'rgba(200,245,250,0)');
  g.fillStyle = hz; g.fillRect(-PAD, yH - 40 * q, W + 2 * PAD, 90 * q);
  // window reflected in the water: pink streaks fading with depth, plus bright blobs
  for (let c = 0; c < cols3; c++) {
    const x = wx + c * (pw + gap);
    softColumn(g, x, yH, pw, yH + (H - yH) * 0.7, '255,205,235', 0.5, 0.24, 0);
    for (let i = 0; i < 4; i++) {
      const yy = yH + (H - yH) * (0.06 + i * 0.13 + rnd() * 0.05);
      g.save(); g.translate(x + pw / 2, yy); g.scale(1, 0.22);
      disc(0, 0, pw * (0.7 - i * 0.08), '255,215,238', 0.5 - i * 0.08); g.restore();
    }
  }
  for (let i = 0; i < 3; i++) { // reflections of the left bokeh
    const x = W * (0.08 + rnd() * 0.3), yy = yH + (H - yH) * (0.1 + rnd() * 0.2);
    g.save(); g.translate(x, yy); g.scale(1, 0.3); disc(0, 0, 40 * q, i ? '255,210,235' : '140,235,235', 0.22); g.restore();
  }
  // bright cyan glow where the ripples are centred
  g.save(); g.translate(fx, fy); g.scale(1, 0.26); disc(0, 0, 420 * q, '90,245,255', 0.4); g.restore();

  // upscale with a blur: two smoothed 2x steps, plus a real blur where the canvas supports it
  const mid = canvasOf(W / 2, H / 2), mg = mid.getContext('2d');
  mg.imageSmoothingQuality = 'high'; mg.drawImage(far, 0, 0, mid.width, mid.height);
  const c = canvasOf(W, H), cg = c.getContext('2d');
  cg.imageSmoothingQuality = 'high';
  if ('filter' in cg) cg.filter = `blur(${Math.round(5 * dpr)}px)`;
  cg.drawImage(mid, -PAD, -PAD, W + 2 * PAD, H + 2 * PAD);
  cg.filter = 'none';

  // readability for the text on the left
  if (wide) {
    const rg = cg.createLinearGradient(0, 0, W * 0.62, 0);
    rg.addColorStop(0, 'rgba(7,38,56,0.72)'); rg.addColorStop(0.6, 'rgba(7,38,56,0.3)'); rg.addColorStop(1, 'rgba(7,38,56,0)');
    cg.fillStyle = rg; cg.fillRect(0, 0, W * 0.62, H);
  } else {
    const rg = cg.createLinearGradient(0, 0, 0, H * 0.5);
    rg.addColorStop(0, 'rgba(7,38,56,0.6)'); rg.addColorStop(1, 'rgba(7,38,56,0)');
    cg.fillStyle = rg; cg.fillRect(0, 0, W, H * 0.5);
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
