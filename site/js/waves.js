// Seigaiha: the traditional Japanese wave pattern of overlapping scales, drawn once as inline SVG.
// Rows are drawn top to bottom so each lower row covers the one above; every row drifts slowly on its own.

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export function initWaves() {
  for (const host of document.querySelectorAll('[data-seigaiha]')) {
    const R = 34, W = 1920, H = 170, rowGap = R / 2;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMin slice', focusable: 'false' });
    const defs = el('defs', {});
    const scale = el('symbol', { id: 'seigaiha-scale', overflow: 'visible' });
    for (const k of [1, 0.74, 0.48, 0.22]) {
      scale.append(el('circle', { cx: 0, cy: 0, r: R * k, fill: '#082f43', stroke: 'rgba(190,240,250,.34)', 'stroke-width': 1.2 }));
    }
    defs.append(scale);
    svg.append(defs);
    for (let row = 0, y = R * 0.4; y < H + R; row++, y += rowGap) {
      const g = el('g', { class: 'row' });
      g.style.setProperty('--dur', `${7 + (row % 4) * 1.6}s`);
      g.style.animationDelay = `${-row * 1.3}s`;
      for (let x = row % 2 ? 0 : R; x < W + 2 * R; x += 2 * R) g.append(el('use', { href: '#seigaiha-scale', x, y }));
      svg.append(g);
    }
    host.append(svg);
  }
}
