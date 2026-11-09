// Procedural stylized bonsai: hand-authored trunk and main branches, generated twigs,
// per-segment spring physics (angles accumulate along a branch, so tips swing most),
// and attachment points for blossoms, buds and leaves.
//
// World space: x = 0 is the island centre, y = 0 the waterline, up is negative y.

import { mulberry32, clamp, lerp, smooth, fbm, TAU } from './util.js';

export const GROW_SPEED = 300;  // world units per second along a branch
const MAX_DEPTH = 3;
const W_TWIG = 1.5;

export function buildTree(seed = 11) {
  const R = mulberry32(seed);
  const segs = [];
  const chains = [];   // thick branches (trunk, main branches, roots) drawn as shaded ribbons

  function mk(parent, x, y, ang, len, w0, w1, depth, rigid) {
    const s = {
      i: segs.length, parent, kids: 0, depth, rigid,
      x0: x, y0: y, ang0: ang, len, w0, w1,
      ex0: x + Math.cos(ang) * len, ey0: y + Math.sin(ang) * len,
      bend: 0, vel: 0, k: 0, c: 0, birth: 0, dur: len / GROW_SPEED, g: 0,
      sx: x, sy: y, ex: x, ey: y, ang, B: 0,
      ticks: null, ribbon: false,
    };
    segs.push(s);
    if (parent) parent.kids++;
    return s;
  }

  // grows one branch as a chain of short segments, with side branches and a forked tip
  function grow(parent, x, y, ang, len, w0, w1, depth, o = {}) {
    const segLen = o.segLen ?? (depth <= 1 ? 18 : depth === 2 ? 13 : 10);
    const n = Math.max(2, Math.round(len / segLen));
    const sl = len / n;
    const curve = o.curve ?? (R() - 0.5) * 0.7;
    const wig = o.wiggle ?? (depth <= 1 ? 0.12 : 0.42);
    let a = ang, px = x, py = y, prev = parent;
    const chain = [];
    for (let i = 0; i < n; i++) {
      a += curve / n + (R() - 0.5) * wig;
      const s = mk(prev, px, py, a, sl, lerp(w0, w1, i / n), lerp(w0, w1, (i + 1) / n), depth, !!o.rigid);
      px = s.ex0; py = s.ey0; prev = s; chain.push(s);
    }
    if (depth <= 1 || o.rigid) { chains.push({ segs: chain, depth, rigid: !!o.rigid }); for (const q of chain) q.ribbon = true; }
    if (depth >= MAX_DEPTH) return chain;
    const pSide = [0, 0.4, 0.3][depth] ?? 0;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      if (R() > pSide * (f < 0.2 ? 0.35 : 1)) continue;
      const cl = len * (0.36 + R() * 0.3) * (1 - 0.5 * f);
      if (cl < 24) continue;
      const s = chain[i - 1];
      const side = R() < 0.5 ? -1 : 1;
      let ca = s.ang0 + side * (0.5 + R() * 0.6);
      if (Math.sin(ca) > 0.3 && R() < 0.7) ca = s.ang0 - side * (0.5 + R() * 0.6); // twigs prefer to point up
      const wc = Math.max(W_TWIG, lerp(w0, w1, f) * 0.62);
      grow(s, s.ex0, s.ey0, ca, cl, wc, W_TWIG, depth + 1);
    }
    if (len >= 64) {
      const last = chain[n - 1];
      const nf = R() < 0.4 ? 3 : 2;
      for (let j = 0; j < nf; j++) {
        const off = nf === 3 ? (j - 1) * (0.45 + R() * 0.2) : (j === 0 ? -1 : 1) * (0.3 + R() * 0.3);
        const cl = len * (0.3 + R() * 0.18);
        if (cl < 22) continue;
        grow(last, last.ex0, last.ey0, last.ang0 + off, cl, Math.max(W_TWIG, w1 * 0.9), W_TWIG, depth + 1);
      }
    }
    return chain;
  }

  // ---- trunk: hand-placed S-curve, resampled into short segments --------------------
  const ctrl = [[-6, -92], [-16, -150], [8, -215], [52, -278], [62, -348], [22, -408], [-26, -458], [-22, -522], [12, -578], [30, -640]];
  for (const c of ctrl) c[1] = -92 + (c[1] + 92) * 0.86;
  const dense = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < 30; k++) {
      const t = k / 30, t2 = t * t, t3 = t2 * t;
      dense.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  dense.push(ctrl[ctrl.length - 1]);
  const pts = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
    if (acc >= 18) { pts.push(dense[i]); acc = 0; }
  }
  const trunk = [];
  const nT = pts.length - 1;
  for (let i = 0; i < nT; i++) {
    const wAt = (u) => lerp(54, 9, Math.pow(u, 0.8)) * (1 + 0.85 * Math.pow(Math.max(0, 1 - u / 0.12), 1.5));
    const [x, y] = pts[i], [x2, y2] = pts[i + 1];
    const s = mk(trunk[i - 1] || null, x, y, Math.atan2(y2 - y, x2 - x), Math.hypot(x2 - x, y2 - y), wAt(i / nT), wAt((i + 1) / nT), 0, false);
    trunk.push(s);
  }

  chains.push({ segs: trunk, depth: 0, rigid: false });
  for (const q of trunk) q.ribbon = true;

  // ---- main branches ---------------------------------------------------------------
  const L = Math.PI;
  const primaries = [
    { u: 0.16, ang: 0.35, len: 190, w0: 12, curve: -0.6 },
    { u: 0.22, ang: L + 0.1, len: 300, w0: 17, curve: 0.45 },
    { u: 0.29, ang: -0.1, len: 400, w0: 18, curve: -0.35 },
    { u: 0.45, ang: L + 0.38, len: 300, w0: 14, curve: 0.3 },
    { u: 0.52, ang: -0.46, len: 310, w0: 13, curve: -0.2 },
    { u: 0.68, ang: L + 0.7, len: 215, w0: 10, curve: 0.2 },
    { u: 0.75, ang: -0.7, len: 255, w0: 10, curve: -0.15 },
  ];
  for (const p of primaries) {
    const par = trunk[Math.round(p.u * (nT - 1))];
    grow(par, par.ex0, par.ey0, p.ang, p.len, p.w0, Math.max(2.2, p.w0 * 0.2), 1, { curve: p.curve, wiggle: 0.08 });
  }
  const top = trunk[nT - 1];
  for (const [a, l, w] of [[-Math.PI / 2 - 0.6, 110, 7], [-Math.PI / 2 + 0.05, 85, 6], [-Math.PI / 2 + 0.65, 105, 7]]) {
    grow(top, top.ex0, top.ey0, a, l, w, 2, 1);
  }

  // ---- roots: rigid, spreading over the rocks ----------------------------------------
  for (const [a, l, w, c] of [[Math.PI - 0.08, 82, 21, -0.25], [0.08, 90, 23, 0.25], [Math.PI - 0.3, 56, 10, -0.2], [0.3, 52, 9, 0.2]]) {
    grow(null, -6, -92, a, l, w, 6, MAX_DEPTH, { rigid: true, segLen: 14, curve: c, wiggle: 0.16 });
  }

  // ---- physics constants, growth timing, drawing buckets ----------------------------
  const buckets = new Map();
  for (const s of segs) {
    const m = (s.w0 + s.w1) / 2;
    if (m > 22) s.rigid = true;
    s.k = Math.min(2000, 16 + 7 * Math.pow(m, 1.7));
    s.c = 2 * 0.28 * Math.sqrt(s.k);
    s.birth = s.parent ? s.parent.birth + s.parent.dur : (s.rigid ? 0.25 : 0);
    s.dur = s.len / GROW_SPEED;
    const wq = Math.max(W_TWIG, Math.round(m * 2) / 2);
    if (!s.ribbon) {
    if (!buckets.has(wq)) buckets.set(wq, { w: wq, list: [] });
    buckets.get(wq).list.push(s);
    }
    if (m >= 6) { // bark lenticels
      s.ticks = [];
      const nt = Math.round(s.len / 14);
      for (let j = 0; j < nt; j++) s.ticks.push([R(), (R() - 0.5) * 0.8, 0.07 + R() * 0.08]);
    }
  }
  const bucketList = [...buckets.values()].sort((a, b) => a.w - b.w);
  for (const b of bucketList) {
    const k = clamp((b.w - 1.5) / 18, 0, 1);
    const mix = (c0, c1) => Math.round(lerp(c0, c1, k));
    b.col = `rgb(${mix(176, 122)},${mix(122, 78)},${mix(112, 76)})`;
  }

  const RD = mulberry32(seed + 55);
  for (const c of chains) {
    const n = c.segs.length;
    const w = c.segs[0].w0;
    c.grooves = [];
    if (w >= 9) {
      const cnt = Math.round(w / 4) + 3;
      for (let j = 0; j < cnt; j++) {
        const i0 = Math.floor(RD() * n * 0.55);
        c.grooves.push({ q: (RD() - 0.5) * 1.7, i0, i1: Math.min(n, i0 + 4 + Math.floor(RD() * n * 0.7)), ph: RD() * TAU, amp: 0.05 + RD() * 0.1, a: 0.22 + RD() * 0.25 });
      }
    }
    c.moss = [];
    if (c.depth === 0 || c.rigid) {
      const lim = c.depth === 0 ? 7 : n;
      const cnt = c.depth === 0 ? 16 : 6;
      for (let j = 0; j < cnt; j++) c.moss.push({ i: Math.floor(RD() * lim), q: (RD() - 0.5) * 1.5, r: 2 + RD() * 3.2, v: Math.floor(RD() * 3) });
    }
    c.buf = null;
  }

  const tree = { segs, buckets: bucketList, chains, elems: [], seed };
  tree.elems = buildElems(tree, mulberry32(seed + 101));
  return tree;
}

// ---- blossoms, buds, leaves: attach to thin twig segments --------------------------------
function buildElems(tree, R) {
  const out = [];
  const add = (type, s, t, off, rel, size, extraDelay = 0) => {
    const z = type === 'leaf' ? 0 : type === 'bud' ? 1 : 2;
    out.push({
      type, seg: s.i, t, off, rel, size,
      v: Math.floor(R() * (type === 'blossom' ? 6 : type === 'leaf' ? 3 : 2)),
      birth: s.birth + s.dur + 0.15 + R() * 0.9 + extraDelay,
      z, ry: s.ey0,
      k: type === 'blossom' ? 110 + R() * 50 : 70 + R() * 40,
      a: 0, va: 0, init: false, wx: 0, wy: 0, ph: R() * TAU,
    });
  };
  for (const s of tree.segs) {
    if (s.depth < 2 || s.w0 > 4.2) continue;
    const tip = s.kids === 0;
    const cl = fbm(s.ex0 / 150, s.ey0 / 150, 3);          // loose clusters with gaps between them
    const dens = smooth(0.34, 0.74, cl);
    // blossoms
    if (tip) {
      if (R() < 0.14 + 0.72 * dens) {
        add('blossom', s, 1, 0, R() * TAU, 0.85 + R() * 0.3);
        if (R() < 0.3 * dens + 0.05) add('blossom', s, 0.8, (R() - 0.5) * 12, R() * TAU, 0.75 + R() * 0.3, 0.2);
        if (R() < 0.35) add('bud', s, 0.9, (R() - 0.5) * 6, (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.6), 0.9 + R() * 0.2, 0.1);
      } else if (R() < 0.5) {
        add('bud', s, 1, 0, (R() - 0.5) * 1.2, 0.9 + R() * 0.2);
      }
    } else if (R() < 0.16 * dens) {
      add('blossom', s, 0.4 + R() * 0.5, (R() < 0.5 ? -1 : 1) * (3 + R() * 3), R() * TAU, 0.8 + R() * 0.3);
    }
    // leaves
    if (R() < (tip ? 0.6 : 0.2)) {
      const side = R() < 0.5 ? -1 : 1;
      add('leaf', s, tip ? 1 : 0.3 + R() * 0.6, 0, side * (0.45 + R() * 0.8), 0.85 + R() * 0.35);
      if (R() < 0.3) add('leaf', s, tip ? 0.85 : 0.3 + R() * 0.6, 0, -side * (0.45 + R() * 0.8), 0.8 + R() * 0.3);
    }
  }
  out.sort((p, q) => p.z - q.z || p.ry - q.ry);
  return out;
}

// ---- simulation ------------------------------------------------------------------------
export function updateFK(tree, tg) {
  for (const s of tree.segs) {
    const p = s.parent;
    let sx, sy, B;
    if (p) { sx = p.ex; sy = p.ey; B = p.B; } else { sx = s.x0; sy = s.y0; B = 0; }
    B += s.bend;
    s.g = clamp((tg - s.birth) / s.dur, 0, 1);
    s.B = B; s.ang = s.ang0 + B;
    const len = s.len * s.g;
    s.sx = sx; s.sy = sy;
    s.ex = sx + Math.cos(s.ang) * len;
    s.ey = sy + Math.sin(s.ang) * len;
  }
}

// env: { windFn, windGain, windOn, hand: { active, x, y, vx, vy, sp, radius, gain } }
export function stepTree(tree, dt, t, env) {
  const { windFn, windGain, windOn, hand } = env;
  const R2 = hand.radius * hand.radius;
  for (const s of tree.segs) {
    if (s.rigid || s.g <= 0) continue;
    const mx = (s.sx + s.ex) / 2, my = (s.sy + s.ey) / 2;
    const co = Math.cos(s.ang), si = Math.sin(s.ang);
    let a = 0;
    if (windOn) { const w = windFn(t, mx, my); a += (-si * w + co * w * 0.25) * windGain; }
    if (hand.active) {
      const dx = mx - hand.x, dy = my - hand.y, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const d = Math.sqrt(d2), f = (1 - d / hand.radius) ** 2;
        a += (-si * hand.vx + co * hand.vy) * f * hand.gain;
        a += (-si * (dx / (d + 1)) + co * (dy / (d + 1))) * hand.sp * f * hand.gain * 0.35;
      }
    }
    s.vel += (a - s.k * s.bend - s.c * s.vel) * dt;
    s.bend = clamp(s.bend + s.vel * dt, -0.42, 0.42);
  }
}

// element positions and a lagging rotation spring (gives the secondary swing of leaves and blossoms)
export function updateElems(tree, dt, t, tg, windFn, windOn, hand) {
  const R2 = hand.radius * hand.radius;
  for (const e of tree.elems) {
    const s = tree.segs[e.seg];
    if (s.g <= 0) continue;
    const co = Math.cos(s.ang), si = Math.sin(s.ang);
    e.wx = s.sx + (s.ex - s.sx) * e.t - si * e.off;
    e.wy = s.sy + (s.ey - s.sy) * e.t + co * e.off;
    let target = s.ang + e.rel;
    if (e.type !== 'blossom') target += (windOn ? windFn(t, e.wx, e.wy) * 0.13 : 0) + Math.sin(t * 2.3 + e.ph) * (windOn ? 0.035 : 0);
    if (!e.init) { e.a = target; e.va = 0; e.init = true; continue; }
    let acc = e.k * (target - e.a) - 2 * 0.25 * Math.sqrt(e.k) * e.va;
    if (hand.active) {
      const dx = e.wx - hand.x, dy = e.wy - hand.y, d2 = dx * dx + dy * dy;
      if (d2 < R2) { const f = (1 - Math.sqrt(d2) / hand.radius) ** 2; acc += (hand.vx * 0.006 - hand.vy * 0.002) * f * 6; }
    }
    e.va += acc * dt;
    e.a += e.va * dt;
  }
}

// ---- drawing (branches) ----------------------------------------------------------------
const LIGHT = [-0.55, -0.83]; // light comes from the upper left

// refresh node positions, widths and normals of a ribbon chain from the current segment state
function prepChain(c) {
  const segs = c.segs;
  let last = -1;
  for (let i = 0; i < segs.length; i++) { if (segs[i].g > 0.001) last = i; else break; }
  if (last < 0) { c.n = 0; return; }
  const n = last + 2;
  if (!c.buf) c.buf = { x: new Float32Array(segs.length + 1), y: new Float32Array(segs.length + 1), w: new Float32Array(segs.length + 1), nx: new Float32Array(segs.length + 1), ny: new Float32Array(segs.length + 1) };
  const b = c.buf;
  for (let i = 0; i <= last; i++) { b.x[i] = segs[i].sx; b.y[i] = segs[i].sy; b.w[i] = segs[i].w0; }
  const sl = segs[last];
  b.x[last + 1] = sl.ex; b.y[last + 1] = sl.ey; b.w[last + 1] = lerp(sl.w0, sl.w1, sl.g);
  let lit = 0;
  for (let i = 0; i < n; i++) {
    const a = segs[Math.max(0, i - 1)].ang, d = segs[Math.min(last, i)].ang;
    const dx = Math.cos(a) + Math.cos(d), dy = Math.sin(a) + Math.sin(d), l = Math.hypot(dx, dy) || 1;
    b.nx[i] = -dy / l; b.ny[i] = dx / l;
    lit += b.nx[i] * LIGHT[0] + b.ny[i] * LIGHT[1];
  }
  c.n = n; c.ls = lit >= 0 ? 1 : -1;
}

const SX = new Float32Array(256), SY = new Float32Array(256);
function edgePts(c, q, pad, from, to) {
  const b = c.buf, ls = c.ls;
  let m = 0;
  const step = to >= from ? 1 : -1;
  for (let i = from; i !== to + step; i += step) {
    const off = ls * (q * b.w[i] / 2 + Math.sign(q) * pad);
    SX[m] = b.x[i] + b.nx[i] * off; SY[m] = b.y[i] + b.ny[i] * off; m++;
  }
  return m;
}
// smooth curve through SX/SY[0..m): continue (lineTo) or start (moveTo)
function smoothTo(g, m, cont) {
  if (cont) g.lineTo(SX[0], SY[0]); else g.moveTo(SX[0], SY[0]);
  for (let k = 1; k < m - 1; k++) g.quadraticCurveTo(SX[k], SY[k], (SX[k] + SX[k + 1]) / 2, (SY[k] + SY[k + 1]) / 2);
  if (m > 1) g.lineTo(SX[m - 1], SY[m - 1]);
}
// closed band between lateral positions qa..qb (q > 0 faces the light), from node i0 to the tip
function band(g, c, qa, qb, pad = 0, i0 = 0) {
  if (c.n - i0 < 2) return;
  g.beginPath();
  let m = edgePts(c, qa, pad, i0, c.n - 1); smoothTo(g, m, false);
  m = edgePts(c, qb, pad, c.n - 1, i0); smoothTo(g, m, true);
  g.closePath();
}
const mixc = (a, b, k) => `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;

// g must already have the world transform set (1 unit = 1 world unit).
export function drawBranches(g, tree) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const c of tree.chains) prepChain(c);

  const twigPass = (pass) => {
    for (const b of tree.buckets) {
      if (pass === 2 && b.w < 5) continue;
      g.save();
      if (pass === 2) g.translate(-b.w * 0.2, -b.w * 0.12);
      g.beginPath();
      let any = false;
      for (const s of b.list) { if (s.g <= 0.001) continue; g.moveTo(s.sx, s.sy); g.lineTo(s.ex, s.ey); any = true; }
      if (any) {
        if (pass === 0) { g.strokeStyle = '#3a2230'; g.lineWidth = b.w + (b.w < 3 ? 0.9 : 2.4); }
        else if (pass === 1) { g.strokeStyle = b.col; g.lineWidth = b.w; }
        else { g.strokeStyle = 'rgba(238,186,164,0.5)'; g.lineWidth = b.w * 0.3; }
        g.stroke();
      }
      g.restore();
    }
  };

  twigPass(0);
  g.fillStyle = '#34202c';
  for (const c of tree.chains) { if (c.n < 2) continue; band(g, c, -1, 1, 1.3); g.fill(); }
  twigPass(1);
  twigPass(2);

  // all base fills first, so branches merge into the trunk without a visible seam; then the shading
  for (const c of tree.chains) {
    if (c.n < 2) continue;
    const k = clamp((c.segs[0].w0 - 6) / 30, 0, 1);
    g.fillStyle = mixc([150, 100, 94], [122, 82, 82], k);
    band(g, c, -1, 1); g.fill();
  }
  for (const c of tree.chains) {
    if (c.n < 2) continue;
    const i0 = c.depth === 0 ? 0 : Math.min(2, c.n - 2); // keep strips off the junction with the parent
    // shade, bounce light from the water, then light and highlight
    g.fillStyle = 'rgba(48,26,40,0.42)'; band(g, c, -1, -0.15, 0, i0); g.fill();
    g.fillStyle = 'rgba(34,18,32,0.34)'; band(g, c, -1, -0.62, 0, i0); g.fill();
    g.fillStyle = 'rgba(120,170,190,0.26)'; band(g, c, -1, -0.86, 0, i0); g.fill();
    g.fillStyle = 'rgba(222,160,136,0.42)'; band(g, c, 0.28, 0.86, 0, i0); g.fill();
    g.fillStyle = 'rgba(250,208,180,0.36)'; band(g, c, 0.5, 0.7, 0, i0); g.fill();
  }

  // bark grooves, lenticels, moss
  g.lineWidth = 1;
  for (const c of tree.chains) {
    if (c.n < 2) continue;
    const b = c.buf;
    for (const gr of c.grooves) {
      const to = Math.min(gr.i1, c.n - 1);
      if (to - gr.i0 < 2) continue;
      g.beginPath();
      for (let i = gr.i0; i <= to; i++) {
        const off = c.ls * ((gr.q + gr.amp * Math.sin(gr.ph + i * 0.8)) * b.w[i] / 2);
        const x = b.x[i] + b.nx[i] * off, y = b.y[i] + b.ny[i] * off;
        if (i === gr.i0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = `rgba(52,28,40,${gr.a})`; g.stroke();
    }
  }
  g.strokeStyle = 'rgba(58,30,40,0.38)'; g.lineWidth = 1.1;
  g.beginPath();
  for (const s of tree.segs) {
    if (!s.ticks || s.g < 0.999) continue;
    const co = Math.cos(s.ang), si = Math.sin(s.ang), w = (s.w0 + s.w1) / 2;
    for (const [u, o, h] of s.ticks) {
      const cx = s.sx + (s.ex - s.sx) * u - si * o * w, cy = s.sy + (s.ey - s.sy) * u + co * o * w;
      g.moveTo(cx - si * h * w * 0.5, cy + co * h * w * 0.5); g.lineTo(cx + si * h * w * 0.5, cy - co * h * w * 0.5);
    }
  }
  g.stroke();
  const MOSS = ['#5f9f5c', '#7cbb68', '#4a8756'];
  for (const c of tree.chains) {
    if (c.n < 2 || !c.moss.length) continue;
    const b = c.buf;
    for (const m of c.moss) {
      if (m.i >= c.n) continue;
      const off = c.ls * (m.q * b.w[m.i] / 2);
      const x = b.x[m.i] + b.nx[m.i] * off, y = b.y[m.i] + b.ny[m.i] * off;
      g.fillStyle = MOSS[m.v]; g.beginPath(); g.ellipse(x, y, m.r, m.r * 0.75, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(190,240,140,0.55)'; g.beginPath(); g.ellipse(x - m.r * 0.25, y - m.r * 0.3, m.r * 0.5, m.r * 0.35, 0, 0, TAU); g.fill();
    }
  }
}
