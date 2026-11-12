// Site-wide drifting petals (and the odd green leaf), pure 2D canvas, no dependencies.
// Two canvases: some petals drift BEHIND the page items (visible through glass and between sections),
// the others in front. Front petals sometimes land on the top edge of a card, panel or button and rest
// there for a few seconds before lifting off again. They fall slowly, get swept along by scrolling,
// part around the pointer, and burst() releases a few more. Sprites are the hero's petal/leaf images.

const BASE = 'assets/hero/sprites/';
const PETALS = ['petal1', 'petal2', 'petal3', 'petal4'];
const LEAVES = ['leaf1', 'leaf2', 'leaf3', 'leaf4'];

const BACK_SHARE = 0.45;        // share of the ambient petals that drift behind the page items
const PERCH_SECONDS = [4, 9];   // how long a petal rests on an item before it lifts off again
const PERCH_CHANCE = 0.45;      // chance to land on an item it falls past
const PERCH_MAX = 3;            // resting petals at the same time
const SURFACES = 'main .card, main .os-item, main .cta-panel, main .panel-visual, main .pill';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load: ' + src));
    img.src = src;
  });
}

// downscale by repeated halving (canvas has no mipmaps), result is a canvas `tw` px wide
function prescale(img, tw) {
  const th = Math.max(1, Math.round(img.height * tw / img.width));
  let src = img, w = img.width, h = img.height;
  while (w / 2 >= tw) {
    w = Math.round(w / 2); h = Math.round(h / 2);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    src = c;
  }
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, tw, th);
  return out;
}

export function initPetals({ reduceMotion }) {
  const front = document.getElementById('petals');
  const back = document.getElementById('petals-back');
  if (!front || !back) throw new Error('initPetals: #petals / #petals-back canvas not found');
  const api = { burst() {} };
  if (reduceMotion) return api; // both canvases are hidden by CSS as well

  const fctx = front.getContext('2d'), bctx = back.getContext('2d');
  const surfaceEls = [...document.querySelectorAll(SURFACES)];
  let W = 0, H = 0, dpr = 1;
  let petalSprites = [], leafSprites = [];
  let parts = [];
  let prevTops = [];
  let running = false, ready = false, last = 0, lastScroll = scrollY, scrollV = 0;
  const pointer = { x: 0, y: 0, speed: 0, t: 0, active: false };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    for (const c of [front, back]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  }

  // only a few at a time: 3 on a phone, about 6 on a laptop, 7 at most
  const target = () => clamp(Math.round((W * H) / 220000), 3, 7);

  function make(first) {
    const leaf = Math.random() < 0.08;
    const set = leaf ? leafSprites : petalSprites;
    const depth = 0.35 + Math.random() * 0.65; // near things are bigger, faster and more opaque
    const isBack = Math.random() < BACK_SHARE;
    return {
      spr: set[(Math.random() * set.length) | 0], depth, back: isBack,
      x: Math.random() * W, y: first ? Math.random() * H : -40 - Math.random() * H * 0.25,
      vx: 0, vy: 0, fall: (26 + Math.random() * 34) * depth,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.6,
      ph: Math.random() * 6.28, fr: 1.1 + Math.random() * 1.4, fy: 1,
      s: (leaf ? 0.34 + depth * 0.34 : 0.4 + depth * 0.45) * (isBack ? 0.85 : 1),
      a: (0.4 + depth * 0.36) * (isBack ? 0.8 : 1), age: 0, ttl: Infinity, perch: null,
    };
  }

  function makeBurst(x, y) {
    const p = make(false);
    p.back = false;
    p.x = x + (Math.random() - 0.5) * 24; p.y = y + (Math.random() - 0.5) * 24;
    p.vx = (Math.random() - 0.5) * 190; p.vy = -30 + Math.random() * 60;
    p.fall = 40 + Math.random() * 30; p.a = 0.85; p.s = 0.55 + Math.random() * 0.4;
    p.ttl = 3 + Math.random() * 1.5;
    return p;
  }

  api.burst = (x, y, n = 4) => {
    if (!ready) return;
    for (let i = 0; i < n; i++) if (parts.filter((p) => p.ttl !== Infinity).length < 40) parts.push(makeBurst(x, y));
  };

  const release = (p, dx = 0) => {
    p.perch = null;
    p.vx = dx ? Math.sign(dx) * (70 + pointer.speed * 0.2) : (Math.random() - 0.5) * 70;
    p.vy = -30; p.vr = (Math.random() - 0.5) * 2.4; p.ph = Math.random() * 6.28;
  };

  function step(dt, t) {
    const ambient = parts.reduce((n, p) => n + (p.ttl === Infinity ? 1 : 0), 0);
    for (let i = ambient; i < target(); i++) parts.push(make(true));
    const rects = surfaceEls.map((el) => el.getBoundingClientRect()); // read once per frame; only a dozen elements
    let perched = parts.reduce((n, p) => n + (p.perch ? 1 : 0), 0);
    const wind = (y) => Math.sin(t * 0.35 + y * 0.004) * 14 + 8; // slow breathing breeze
    const R = 130;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.ttl) { parts.splice(i, 1); continue; }
      p.ph += dt * p.fr;
      p.fy += ((p.perch ? 0.42 : 0.35 + 0.65 * Math.abs(Math.cos(p.ph * 0.8))) - p.fy) * Math.min(1, dt * 7);

      if (p.perch) { // resting: ride along with the item (scroll, hover lift) until time is up or the pointer comes close
        const r = rects[p.perch.i];
        const dx = p.x - pointer.x, near = pointer.active && Math.hypot(dx, p.y - pointer.y) < 64;
        if (r.width < 90 || r.top < 60 || r.top > H - 10 || t > p.perch.until || near) { release(p, near ? dx : 0); perched--; }
        else {
          p.x = r.left + p.perch.ox; p.y = r.top + 1;
          const d = ((p.perch.rest - p.rot + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          p.rot += d * Math.min(1, dt * 5);
          continue;
        }
      }

      p.vy += (p.fall - p.vy) * Math.min(1, dt * 1.5);
      p.vx += ((wind(p.y) + Math.sin(p.ph) * 24) * p.depth - p.vx) * Math.min(1, dt * 1.2);
      if (pointer.active) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y, d = Math.hypot(dx, dy);
        if (d < R) {
          const f = (1 - d / R) ** 2, push = (140 + pointer.speed * 0.25) * f;
          p.vx += (dx / (d + 1)) * push * dt * 9; p.vy += (dy / (d + 1)) * push * dt * 6;
          p.vr += (dx > 0 ? 1 : -1) * f * dt * 14;
        }
      }
      p.x += p.vx * dt;
      p.y += (p.vy - scrollV * 0.14 * p.depth) * dt; // scrolling down sweeps them up with the page
      p.rot += p.vr * dt;
      p.vr += (0 - p.vr) * Math.min(1, dt * 0.8);

      // landing: a front petal that crosses the top edge of an item may stay there for a while
      if (!p.back && p.ttl === Infinity && perched < PERCH_MAX && p.vy > 0 && prevTops.length === rects.length) {
        for (let k = 0; k < rects.length; k++) {
          const r = rects[k];
          if (r.width < 90 || r.top < 70 || r.top > H - 40 || p.x < r.left + 10 || p.x > r.right - 10) continue;
          if (p.y - prevTops[k] < 0 || p.y - r.top < 0 || !(prevTops[k] > -1e8)) continue;
          // it was above the edge last frame (relative to the item) and is on or below it now
          if (p.prevY - prevTops[k] < 0 && Math.random() < PERCH_CHANCE) {
            p.perch = { i: k, ox: p.x - r.left, rest: (Math.random() - 0.5) * 0.9, until: t + PERCH_SECONDS[0] + Math.random() * (PERCH_SECONDS[1] - PERCH_SECONDS[0]) };
            p.vx = p.vy = p.vr = 0; perched++;
          }
          break; // one chance per item it passes through
        }
      }
      p.prevY = p.y;
      if (p.y > H + 40 && p.ttl === Infinity) { p.y = -40; p.prevY = -40; p.x = Math.random() * W; p.vy = 0; }
      if (p.x < -50) p.x = W + 50; else if (p.x > W + 50) p.x = -50;
    }
    prevTops = rects.map((r) => r.top);
    pointer.speed *= Math.exp(-dt * 6);
  }

  function draw() {
    for (const [c, g] of [[front, fctx], [back, bctx]]) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); }
    for (const p of parts) {
      const g = p.back ? bctx : fctx;
      const cos = Math.cos(p.rot), sin = Math.sin(p.rot), s = p.s;
      const fade = p.ttl === Infinity ? 1 : clamp((p.ttl - p.age) / 0.9, 0, 1);
      g.globalAlpha = clamp(p.a * (p.perch ? 1.2 : 1), 0, 1) * fade;
      g.setTransform(cos * s, sin * s, -sin * s * p.fy, cos * s * p.fy, p.x * dpr, p.y * dpr);
      g.drawImage(p.spr, -p.spr.width / 2, -p.spr.height / 2);
    }
    fctx.globalAlpha = 1; bctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!running) return;
    const t = now / 1000;
    const dt = clamp(t - last, 0, 1 / 30);
    if (last) scrollV += ((scrollY - lastScroll) / Math.max(t - last, 0.001) - scrollV) * Math.min(1, dt * 8);
    lastScroll = scrollY; last = t;
    step(dt, t);
    draw();
    requestAnimationFrame(frame);
  }
  const start = () => { if (!running && ready) { running = true; last = 0; requestAnimationFrame(frame); } };

  addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (pointer.active) {
      const dt = Math.max(0.004, (now - pointer.t) / 1000);
      pointer.speed = clamp(pointer.speed * 0.5 + (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) / dt) * 0.5, 0, 3500);
    }
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = now;
    pointer.active = e.pointerType === 'mouse' || e.pointerType === 'pen'; // a finger is scrolling, not brushing
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else start(); });

  resize();
  Promise.all([...PETALS, ...LEAVES].map((n) => loadImage(`${BASE}${n}.webp`))).then((imgs) => {
    petalSprites = imgs.slice(0, 4).map((im) => prescale(im, Math.round(30 * dpr)));
    leafSprites = imgs.slice(4).map((im) => prescale(im, Math.round(40 * dpr)));
    ready = true;
    start();
  });
  return api;
}
