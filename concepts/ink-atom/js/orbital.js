// Hydrogen orbitals as point clouds.
// |ψ_nlm|² separates into radius, polar angle and azimuth, so each coordinate is drawn from its
// own distribution by inverse transform sampling. Every point keeps the same three quantiles in
// every orbital: a morph then moves it a short, coherent way instead of across the atom.

const TAU = Math.PI * 2;

// deterministic random numbers, so the cloud looks the same on every visit
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// associated Laguerre polynomial L_k^alpha(x)
function laguerre(k, alpha, x) {
  let previous = 1;
  let current = 1 + alpha - x;
  if (k === 0) return previous;
  for (let j = 1; j < k; j++) {
    [previous, current] = [current, ((2 * j + 1 + alpha - x) * current - (j + alpha) * previous) / (j + 1)];
  }
  return current;
}

// associated Legendre function P_l^m(x), up to a sign that the square removes
function legendre(l, m, x) {
  let pmm = 1;
  const root = Math.sqrt(1 - x * x);
  for (let i = 1; i <= m; i++) pmm *= (2 * i - 1) * root;
  if (l === m) return pmm;
  let next = x * (2 * m + 1) * pmm;
  for (let ll = m + 2; ll <= l; ll++) {
    [pmm, next] = [next, ((2 * ll - 1) * x * next - (ll + m - 1) * pmm) / (ll - m)];
  }
  return next;
}

// inverse of the cumulative distribution of a density on [0, max], from a table
function inverseCdf(density, max, steps = 1024) {
  const cdf = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) cdf[i] = cdf[i - 1] + density(((i - 0.5) / steps) * max);
  const total = cdf[steps];
  return (u) => {
    const target = u * total;
    let lo = 0;
    let hi = steps;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid; else hi = mid;
    }
    const span = cdf[hi] - cdf[lo];
    return ((lo + (span > 0 ? (target - cdf[lo]) / span : 0.5)) / steps) * max;
  };
}

// Per point: three quantiles (radius, polar angle, azimuth) and four numbers for its looks.
export function scatter(count, seed = 20261110) {
  const random = mulberry32(seed);
  const quantiles = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) quantiles[i * 3 + k] = random();
    seeds[i * 4] = quantiles[i * 3];   // radius quantile, used for the colour
    for (let k = 1; k < 4; k++) seeds[i * 4 + k] = random();
  }
  return { quantiles, seeds };
}

// Positions of all points in the orbital (n, l, m) as radius, polar angle, azimuth.
// Real orbital for m > 0 (cos mφ). Lengths are scaled so that 90 % of the electron lies within radius 1.
export function sampleOrbital({ n, l, m }, quantiles) {
  const radius = inverseCdf((r) => {
    const rho = (2 * r) / n;
    const radial = rho ** l * Math.exp(-rho / 2) * laguerre(n - l - 1, 2 * l + 1, rho);
    return r * r * radial * radial;
  }, n * (3 * n + 10));
  const polar = inverseCdf((theta) => legendre(l, m, Math.cos(theta)) ** 2 * Math.sin(theta), Math.PI);
  const azimuth = m === 0 ? (u) => u * TAU : inverseCdf((phi) => Math.cos(m * phi) ** 2, TAU);
  const scale = 1 / radius(0.9);
  const out = new Float32Array(quantiles.length);
  for (let i = 0; i < quantiles.length; i += 3) {
    out[i] = radius(quantiles[i]) * scale;
    out[i + 1] = polar(quantiles[i + 1]);
    out[i + 2] = azimuth(quantiles[i + 2]);
  }
  return out;
}
