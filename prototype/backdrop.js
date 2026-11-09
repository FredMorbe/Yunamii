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
