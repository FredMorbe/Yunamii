// The swell, defined once. glsl.js turns these numbers into shader code, and seaHeight()
// evaluates the same sum on the CPU, so the pointer can find the exact spot it touches.

// direction x, z (towards the viewer is -z), wavelength, amplitude, period in seconds, phase.
// Two crossing swells of similar size form slow mounds instead of parallel rollers.
export const SWELLS = [
  [0.45, -1, 24, 0.8, 17, 0],
  [-0.6, -1, 19, 0.6, 14, 1.7],
  [0.95, -0.35, 37, 0.45, 24, 4.1],
  [0.1, -1, 10, 0.16, 9, 2.6],
  [-0.8, -0.6, 6, 0.05, 6, 0.9],
];
// slow warp so the crest lines never look ruler straight: size, z frequency, z speed, x frequency, x speed
export const WARP = [3, 0.043, 0.031, 0.037, 0.027];
// a swell fades out between these ratios of mesh step to wavelength (instead of aliasing)
export const LOD_FADE = [0.1, 0.32];
// the sea flattens between these distances, which keeps the horizon clean
export const FLATTEN = [170, 430];
export const MAX_HEIGHT = SWELLS.reduce((sum, swell) => sum + swell[3], 0);

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// height of the sea without ripples; lodPerDistance is the mesh step per unit of distance
export function seaHeight(x, z, time, lodPerDistance) {
  const qx = x + WARP[0] * Math.sin(z * WARP[1] + time * WARP[2]);
  const qz = z + WARP[0] * Math.cos(x * WARP[3] - time * WARP[4]);
  const lod = z * lodPerDistance;
  let h = 0;
  for (const [dx, dz, len, amp, period, phase] of SWELLS) {
    const keep = 1 - smooth(LOD_FADE[0], LOD_FADE[1], lod / len);
    h += amp * keep * Math.sin(((qx * dx + qz * dz) / Math.hypot(dx, dz)) * (TAU / len) - time * (TAU / period) + phase);
  }
  return h * (1 - smooth(FLATTEN[0], FLATTEN[1], z));
}
