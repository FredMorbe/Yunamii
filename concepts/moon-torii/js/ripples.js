// The foot of the page: rings that spread over water, drawn once as inline SVG. Each ring is an ellipse
// (a circle seen at a slant) that grows from its drop and fades out; the animation is in the stylesheet,
// and every ring starts at its own point of the cycle (--s), so that with no motion they stand as
// concentric rings.

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

// where the drops fall (share of the width), how far their rings reach, and how long a cycle takes
const DROPS = [
  { at: 0.17, reach: 330, seconds: 15 },
  { at: 0.5, reach: 450, seconds: 19 },
  { at: 0.83, reach: 360, seconds: 16 },
];
const RINGS = 4;

export function initRipples() {
  for (const host of document.querySelectorAll('[data-ripples]')) {
    const W = 1920, H = 190, slant = 0.2;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax slice', focusable: 'false' });
    DROPS.forEach(({ at, reach, seconds }, d) => {
      const g = el('g', { class: 'drop' });
      g.style.setProperty('--dur', `${seconds}s`);
      for (let i = 0; i < RINGS; i++) {
        const ring = el('ellipse', { cx: at * W, cy: H * 0.66, rx: reach, ry: reach * slant });
        // the rings of one drop are spread evenly over the cycle; the drops are out of step with each other
        ring.style.setProperty('--s', ((i + d / DROPS.length) / RINGS).toFixed(3));
        g.append(ring);
      }
      svg.append(g);
    });
    host.append(svg);
  }
}
