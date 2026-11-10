// The ocean planet seen from afar (canvas 2D): a globe drawn only with wave lines of latitude,
// lit from the side of its sun, with the wordmark's ember dot as a small moon on its orbit.

const LATITUDES = 21;
const SEGMENTS = 96;
const LEVELS = 6;                 // brightness steps, one stroke call per step
const AXIS = 0.42;                // tilt towards the viewer
const ROLL = -0.26;
const LIGHT = [0.72, 0.36, 0.59]; // unit vector towards the sun: right, up, towards the viewer
const TAU = Math.PI * 2;

const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')}, ${a})`;

export function initPlanet({ reduceMotion }) {
  const canvas = document.getElementById('planet');
  const ctx = canvas.getContext('2d');
  const buckets = Array.from({ length: LEVELS }, () => []);
  let color = {};
  let ratio = 1;
  let time = reduceMotion ? 9 : 0;
  let last = 0;
  let raf = 0;
  let lean = 0;
  let leanTarget = 0;

  function readColors() {
    const style = getComputedStyle(document.documentElement);
    for (const name of ['bg', 'accent-ink', 'ember', 'ink-3']) color[name] = style.getPropertyValue(`--${name}`).trim();
  }

  // planet coordinates -> canvas, with depth as third value
  function project(p, cx, cy, radius, axis) {
    const y1 = p[1] * Math.cos(axis) - p[2] * Math.sin(axis);
    const z = p[1] * Math.sin(axis) + p[2] * Math.cos(axis);
    const x = p[0] * Math.cos(ROLL) - y1 * Math.sin(ROLL);
    const y = p[0] * Math.sin(ROLL) + y1 * Math.cos(ROLL);
    return [cx + x * radius, cy - y * radius, z, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]];
  }

  function orbit(cx, cy, radius, axis, front) {
    ctx.beginPath();
    for (let j = 0, pen = false; j <= SEGMENTS; j++) {
      const a = (j / SEGMENTS) * TAU;
      const [x, y, z] = project([Math.cos(a) * 1.62, 0, Math.sin(a) * 1.62], cx, cy, radius, axis);
      if ((z >= 0) !== front) { pen = false; continue; }
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.strokeStyle = rgba(color['ink-3'], 0.5);
    ctx.setLineDash([2 * ratio, 6 * ratio]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function moon(cx, cy, radius, axis, front) {
    const a = time * 0.22;
    const [x, y, z] = project([Math.cos(a) * 1.62, 0, Math.sin(a) * 1.62], cx, cy, radius, axis);
    if ((z >= 0) !== front) return;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 16 * ratio);
    glow.addColorStop(0, rgba(color.ember, 0.55));
    glow.addColorStop(1, rgba(color.ember, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - 16 * ratio, y - 16 * ratio, 32 * ratio, 32 * ratio);
    ctx.fillStyle = color.ember;
    ctx.beginPath();
    ctx.arc(x, y, 4 * ratio, 0, TAU);
    ctx.fill();
  }

  function draw() {
    const size = canvas.width;
    if (!size) return;
    const c = size / 2;
    const radius = size * 0.29;
    const axis = AXIS + lean;
    ctx.clearRect(0, 0, size, size);
    ctx.lineWidth = ratio;
    ctx.lineCap = 'round';

    orbit(c, c, radius, axis, false);
    moon(c, c, radius, axis, false);

    // body: page colour (hides the far side of the orbit) with a breath of light on the sun side
    ctx.fillStyle = color.bg;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, TAU);
    ctx.fill();
    const shade = ctx.createRadialGradient(c + radius * 0.55, c - radius * 0.3, radius * 0.05, c, c, radius);
    shade.addColorStop(0, rgba(color['accent-ink'], 0.2));
    shade.addColorStop(1, rgba(color['accent-ink'], 0));
    ctx.fillStyle = shade;
    ctx.fill();

    // wave lines of latitude, sorted into brightness steps
    for (const b of buckets) b.length = 0;
    for (let i = 0; i < LATITUDES; i++) {
      const base = (-80 + (160 * i) / (LATITUDES - 1)) * (Math.PI / 180);
      let prev = null;
      for (let j = 0; j <= SEGMENTS; j++) {
        const lon = (j / SEGMENTS) * TAU;
        const lat = base + Math.cos(base) * (0.07 * Math.sin(lon * 3 + time * 0.45 + i * 0.7) + 0.03 * Math.sin(lon * 7 - time * 0.7 + i));
        const p = project([Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)], c, c, radius, axis);
        if (prev && p[2] > 0 && prev[2] > 0) {
          const lit = Math.max(p[3], 0) ** 0.8;
          const limb = Math.min(1, p[2] / 0.22);
          const level = Math.min(LEVELS - 1, Math.floor((0.08 + 0.92 * lit) * limb * LEVELS));
          buckets[level].push(prev[0], prev[1], p[0], p[1]);
        }
        prev = p;
      }
    }
    buckets.forEach((b, level) => {
      ctx.strokeStyle = rgba(color['accent-ink'], 0.1 + (0.8 * level) / (LEVELS - 1));
      ctx.beginPath();
      for (let k = 0; k < b.length; k += 4) { ctx.moveTo(b[k], b[k + 1]); ctx.lineTo(b[k + 2], b[k + 3]); }
      ctx.stroke();
    });

    // limb: bright towards the sun, gone on the night side
    const rim = ctx.createLinearGradient(c - radius * LIGHT[0], c + radius * LIGHT[1], c + radius * LIGHT[0], c - radius * LIGHT[1]);
    rim.addColorStop(0.1, rgba(color['accent-ink'], 0));
    rim.addColorStop(1, rgba(color['accent-ink'], 0.95));
    ctx.strokeStyle = rim;
    ctx.beginPath();
    ctx.arc(c, c, radius, 0, TAU);
    ctx.stroke();

    orbit(c, c, radius, axis, true);
    moon(c, c, radius, axis, true);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    lean += (leanTarget - lean) * (1 - Math.exp(-dt * 3));
    draw();
  }

  readColors();
  new ResizeObserver(() => {
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(canvas.clientWidth * ratio);
    draw();
  }).observe(canvas);

  if (!reduceMotion) {
    new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(raf);
      if (entry.isIntersecting) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }).observe(canvas);
    // the globe leans a little towards the pointer
    const figure = canvas.parentElement;
    figure.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      leanTarget = ((e.clientY - rect.top) / rect.height - 0.5) * 0.5;
    }, { passive: true });
    figure.addEventListener('pointerleave', () => { leanTarget = 0; }, { passive: true });
  }

  return {
    setTheme() {
      readColors();
      draw();
    },
  };
}
