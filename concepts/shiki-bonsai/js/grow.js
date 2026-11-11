// Grows a bonsai from a number. The same seed always gives the same tree.
// Style: moyogi, the informal upright. A trunk in soft S curves, branches on alternating sides
// that get shorter towards the top, and foliage trimmed into flat cloud pads.
// Lengths are in tree units: the pot is about 0.7 wide, the tree about 1 high.

const TAU = Math.PI * 2;
export const SOIL = 0.105;   // height of the soil in the pot

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
const turn = (a, angle) => { const c = Math.cos(angle), s = Math.sin(angle); return [c * a[0] - s * a[2], a[1], s * a[0] + c * a[2]]; };   // about the vertical axis

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// leafBudget: how many leaves the tree may carry.
// Returns the wood as a triangle mesh of ribbons, the leaves as points and a few numbers about the tree.
export function growBonsai(seed, leafBudget) {
  const rnd = mulberry32(seed);
  const range = (a, b) => a + (b - a) * rnd();
  const limbs = [];   // every limb: points with radius, birth (0..1, when it grows) and flex (how much it sways)
  const pads = [];    // foliage pads: centre, half axes, birth, flex

  // one limb: walks from a point in a direction, waving a little, bending by lift(v) per step
  function limb({ from, dir, length, steps, thick, thin, birth, span, flex, lift }) {
    const out = { pts: [], rad: [], birth: [], flex: [], dir: [] };
    const wave = range(0, TAU);
    const lean = range(-0.04, 0.04);
    let p = from.slice();
    let d = unit(dir);
    for (let s = 0; s <= steps; s++) {
      const v = s / steps;
      out.pts.push(p.slice());
      out.rad.push(thin + (thick - thin) * (1 - v) ** 1.25);
      out.birth.push(birth + v * span);
      out.flex.push(flex[0] + (flex[1] - flex[0]) * v);
      out.dir.push(d.slice());
      const side = turn([d[0], 0, d[2]], Math.PI / 2);
      d = unit(add(d, add(mul(side, Math.sin(v * 5 + wave) * 0.1 + lean), [0, lift(v), 0])));
      p = add(p, mul(d, length / steps));
    }
    limbs.push(out);
    return out;
  }

  // a pad sits on the end of a limb, with a handful of fine twigs inside that show in winter
  function pad(tip, size, birth) {
    const centre = [tip[0], tip[1] + size * 0.16, tip[2]];
    pads.push({ c: centre, r: [size, size * 0.44, size * 0.86], birth, flex: 0.95 });
    for (let i = 0; i < 4; i++) {
      // mostly sideways, so that no tip sticks out of the top of the pad
      limb({ from: tip, dir: [range(-1, 1), range(0.1, 0.4), range(-1, 1)], length: size * range(0.45, 0.8), steps: 5, thick: 0.0045, thin: 0.0018, birth, span: 0.05, flex: [0.8, 1], lift: () => 0.02 });
    }
  }

  // ---- trunk
  const side0 = rnd() < 0.5 ? -1 : 1;
  const phase = range(-0.2, 0.5);
  const depthPhase = range(0, TAU);
  const STEPS = 64;
  const trunk = { pts: [], rad: [], birth: [], flex: [], dir: [] };
  let p = [0, SOIL - 0.01, 0];
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS;
    const d = unit([side0 * 0.85 * Math.cos(u * TAU * 1.2 + phase) * (1 - 0.3 * u), 1, 0.34 * Math.cos(u * TAU * 0.9 + depthPhase)]);
    trunk.pts.push(p.slice());
    trunk.rad.push(0.011 + 0.06 * (1 - u) ** 1.35 + 0.075 * Math.exp(-u * 15));   // taper, with a flare at the roots
    trunk.birth.push(u * 0.5);
    trunk.flex.push(u * u * 0.3);
    trunk.dir.push(d);
    p = add(p, mul(d, 0.98 / STEPS));
  }
  limbs.push(trunk);

  // ---- branches: from a third of the height upwards, alternating sides, the lowest the longest
  const count = 5 + Math.floor(rnd() * 3);
  for (let k = 0; k < count; k++) {
    const share = k / (count - 1);
    const i = Math.round((0.27 + 0.62 * share + range(-0.02, 0.02)) * STEPS);
    const angle = (k % 2 ? Math.PI : 0) + (side0 > 0 ? 0 : Math.PI) + range(-0.75, 0.75);
    const length = (0.44 - 0.3 * share) * range(0.85, 1.15);
    const branch = limb({
      from: trunk.pts[i], dir: [Math.cos(angle), range(-0.05, 0.16), Math.sin(angle) * 0.9], length, steps: 22,
      thick: trunk.rad[i] * 0.5, thin: 0.005, birth: trunk.birth[i] + 0.03, span: 0.2, flex: [0.12, 0.85],
      lift: (v) => (-0.8 + 2 * v) * 0.04,   // droops a little, then reaches up
    });
    const twigs = length > 0.3 ? 3 : length > 0.2 ? 2 : 1;
    for (let j = 0; j < twigs; j++) {
      const at = Math.round((0.38 + 0.2 * j) * 22);
      const twig = limb({
        from: branch.pts[at], dir: add(turn(branch.dir[at], (j % 2 ? 1 : -1) * range(0.7, 1.15)), [0, range(0.1, 0.3), 0]), length: length * range(0.3, 0.44), steps: 12,
        thick: branch.rad[at] * 0.6, thin: 0.004, birth: branch.birth[at] + 0.03, span: 0.1, flex: [branch.flex[at], 0.95], lift: () => 0.03,
      });
      pad(twig.pts[12], 0.06 + 0.2 * length, twig.birth[12] + 0.01);
    }
    pad(branch.pts[22], 0.07 + 0.22 * length, branch.birth[22] + 0.01);
  }
  // the crown
  pad(trunk.pts[STEPS], range(0.15, 0.18), 0.52);

  // ---- wood: every limb becomes a ribbon that the shader turns towards the viewer
  // per vertex: position 3, tangent 3, side, radius, birth, flex, distance along the limb
  const vertexCount = limbs.reduce((n, l) => n + l.pts.length * 2, 0);
  const wood = new Float32Array(vertexCount * 11);
  const index = new Uint16Array((vertexCount - limbs.length * 2) * 3);
  let v = 0;
  let t = 0;
  for (const l of limbs) {
    let along = 0;
    for (let i = 0; i < l.pts.length; i++) {
      if (i) along += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1], l.pts[i][2] - l.pts[i - 1][2]);
      for (const side of [-1, 1]) {
        wood.set([...l.pts[i], ...l.dir[i], side, l.rad[i], l.birth[i], l.flex[i], along], v * 11);
        v++;
      }
      if (i) {
        const a = v - 4;
        index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], t);
        t += 6;
      }
    }
  }

  // ---- leaves: pads share the budget by their size
  // per leaf: position 3, normal 3, seed 4 (show, look, phase, birth), meta 4 (flex, height in the pad, moss, loose)
  const MOSS = Math.round(leafBudget * 0.012);
  const weights = pads.map((pd) => pd.r[0] * pd.r[2]);
  const total = weights.reduce((a, b) => a + b, 0);
  const leaves = new Float32Array((leafBudget + MOSS) * 14);
  let n = 0;
  pads.forEach((pd, i) => {
    const amount = i === pads.length - 1 ? leafBudget - n : Math.floor((leafBudget * weights[i]) / total);
    for (let j = 0; j < amount; j++) {
      // a dome: rounded on top, nearly flat below, denser towards the surface
      let d;
      do { d = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; } while (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] > 1 || d[1] < -0.4);
      d = unit(d);
      if (d[1] < 0) d[1] *= 0.35;
      const reach = rnd() ** 0.42;
      leaves.set([
        pd.c[0] + d[0] * reach * pd.r[0], pd.c[1] + d[1] * reach * pd.r[1], pd.c[2] + d[2] * reach * pd.r[2],
        ...unit([d[0] / pd.r[0], d[1] / pd.r[1], d[2] / pd.r[2]]),
        rnd(), rnd(), rnd(), pd.birth + rnd() * 0.13,
        pd.flex, Math.min(1, Math.max(0, 0.5 + 0.5 * d[1] * reach)), 0, rnd(),
      ], n * 14);
      n++;
    }
  });
  for (let j = 0; j < MOSS; j++) {
    const a = range(0, TAU);
    const r = 0.3 * Math.sqrt(rnd());
    leaves.set([r * Math.cos(a), SOIL + range(0.002, 0.012), r * 0.74 * Math.sin(a), 0, 1, 0, rnd(), rnd(), rnd(), rnd() * 0.3, 0, 1, 1, 1], n * 14);
    n++;
  }

  // branches: every limb except the trunk and the fine twigs inside the pads
  return { wood, index, leaves, branches: limbs.length - pads.length * 4 - 1, pads: pads.length, leafCount: leafBudget };
}
