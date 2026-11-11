// GLSL sources for the hero scene (WebGL2, GLSL ES 3.00).
// Every program reads the same "Frame" uniform block, so camera, clock, ripples and strand
// paths are uploaded once per frame. The sea height lives in one shared chunk: the water mesh,
// the light strands and the dots all call it and therefore always ride on the same waves.

import { SWELLS, WARP, LOD_FADE, FLATTEN } from './sea.js';

const f = (n) => n.toFixed(4);   // GLSL float literal

const FRAME = `
layout(std140) uniform Frame {
  mat4 uVP;
  vec4 uGrid;      // near, far, half width per unit of distance, mesh step per unit of distance
  vec4 uView;      // canvas width, canvas height, pixel ratio, time in seconds
  vec4 uCam;       // camera position, 1 while ripples are alive
  vec4 uSun;       // direction to the sun, dawn 0..1
  vec4 uRipple[8]; // x, z, birth time, amplitude
  vec4 uStrand[3]; // row 0..1, sway, frequency, speed
};
#define uTime uView.w
`;

const SEA = `
const float TAU = 6.283185307;

// One swell. "lod" is the local mesh step: waves shorter than a few steps fade out
// instead of aliasing, which also leaves the far sea flat and the horizon clean.
float swell(vec2 p, vec2 dir, float len, float amp, float period, float phase, float lod) {
  float keep = 1.0 - smoothstep(${f(LOD_FADE[0])}, ${f(LOD_FADE[1])}, lod / len);
  return amp * keep * sin(dot(p, dir) * (TAU / len) - uTime * (TAU / period) + phase);
}

// Rings spreading from a touch: x is the height, y the light the ring carries.
// Ring size grows with distance so far ripples stay visible.
vec2 ripples(vec2 p) {
  vec2 sum = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipple[i];
    float age = uTime - r.z;
    float s = clamp(r.y / 14.0, 0.6, 5.0);
    float d = length(p - r.xy) / s;
    float x = d - age * 2.6;
    float born = smoothstep(0.0, 0.3, age);
    float wave = exp(-x * x * 0.4) * sin(x * 2.4) * exp(-age * 0.6) / (1.0 + d * 0.3);
    // light: a thin ring on the front and a fainter one a wavelength behind it; it outlives the swell a little
    float glow = (exp(-x * x * 2.0) + 0.45 * exp(-(x + 2.6) * (x + 2.6) * 2.0)) * exp(-age * 0.4) / (1.0 + d * 0.12);
    sum += r.w * born * vec2(s * wave, 6.0 * glow);
  }
  return sum;
}

float gRing;   // light of the ripples at the last point passed to seaHeight

// the numbers come from sea.js, which evaluates the same sum on the CPU
float seaHeight(vec2 p, float lod) {
  vec2 q = p + ${f(WARP[0])} * vec2(sin(p.y * ${f(WARP[1])} + uTime * ${f(WARP[2])}), cos(p.x * ${f(WARP[3])} - uTime * ${f(WARP[4])}));
  float h = ${SWELLS.map(([x, z, len, amp, period, phase]) => `swell(q, vec2(${f(x / Math.hypot(x, z))}, ${f(z / Math.hypot(x, z))}), ${f(len)}, ${f(amp)}, ${f(period)}, ${f(phase)}, lod)`).join('\n          + ')};
  h *= 1.0 - smoothstep(${f(FLATTEN[0])}, ${f(FLATTEN[1])}, p.y);
  vec2 ring = uCam.w > 0.5 ? ripples(p) : vec2(0.0);
  gRing = ring.y;
  return h + ring.x;
}
`;

const STRAND = `
// A strand follows one row of the sea and sways slowly between its neighbours.
vec3 strandPoint(float u, vec4 s, float phase) {
  float row = s.x + s.y * sin(u * s.z + uTime * s.w + phase)
            + 0.45 * s.y * sin(u * s.z * 2.3 - uTime * s.w * 0.6 + phase * 1.7);
  float z = uGrid.x * pow(uGrid.y / uGrid.x, row);
  vec2 p = vec2(u * z * uGrid.z, z);
  return vec3(p.x, seaHeight(p, z * uGrid.w) + 0.03 + z * 0.0015, p.y);
}
`;

const HEAD = `#version 300 es
precision highp float;
${FRAME}`;

// ---------------------------------------------------------------- sky

export const SKY_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SKY_FS = `${HEAD}
uniform vec3 uSkyTop, uSkyMid, uSkyLow, uBg, uHaze, uSunCore, uSunEdge, uGlowTint, uGlowAdd, uRingCol;
uniform vec4 uSkyTune;   // glow tint amount, star amount, ring amount, unused
uniform vec4 uSunP;      // sun centre x, y, radius, horizon y (in canvas heights, origin at the centre)
uniform vec4 uRing;      // ring centre x, y, radius, star drift
out vec4 frag;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float starField(vec2 p, float px) {
  vec2 g = p * 42.0;
  vec2 id = floor(g);
  float rnd = hash(id);
  vec2 c = vec2(hash(id + 7.13), hash(id + 3.71)) * 0.7 + 0.15;
  float d = length(g - id - c);
  float size = px * 42.0 * mix(0.7, 1.8, pow(rnd, 6.0));
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.35 + rnd * 1.3) + rnd * 60.0);
  return step(0.84, rnd) * (1.0 - smoothstep(size * 0.4, size, d)) * twinkle * (0.3 + 0.7 * pow(rnd, 5.0));
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uView.xy) / uView.y;
  float px = uView.z / uView.y;
  float h = p.y - uSunP.w;
  float t = clamp(h / max(0.5 - uSunP.w, 0.001), 0.0, 1.0);

  vec3 col = mix(uSkyLow, uSkyMid, smoothstep(0.0, 0.4, t));
  col = mix(col, uSkyTop, smoothstep(0.3, 1.0, t));

  // below the horizon the haze melts into the page colour
  float sky = smoothstep(-0.5 * px, 0.5 * px, h);
  float depth = clamp(-h / max((uSunP.w + 0.5) * 0.9, 0.001), 0.0, 1.0);
  col = mix(mix(uHaze, uBg, smoothstep(0.0, 1.0, depth)), col, sky);

  if (uSkyTune.y > 0.0) {
    col += uSkyTune.y * sky * smoothstep(0.03, 0.35, t) * starField(p + vec2(uRing.w, 0.0), px);
  }

  // the planet's rings, seen from its surface: brightest where they pass the sun
  vec2 rd = p - uRing.xy;
  float rr = length(rd);
  float lit = pow(clamp(dot(rd / rr, normalize(uSunP.xy - uRing.xy)), 0.0, 1.0), 2.0);
  float d0 = abs(rr - uRing.z);
  float d1 = abs(rr - uRing.z * 1.045);
  float d2 = abs(rr - uRing.z * 0.93);
  float hair = (1.0 - smoothstep(px * 0.45, px * 1.35, d0))
             + 0.45 * (1.0 - smoothstep(px * 0.35, px * 1.2, d1))
             + 0.30 * (1.0 - smoothstep(px * 0.35, px * 1.2, d2));
  float plane = smoothstep(uRing.z * 0.93, uRing.z * 0.95, rr) * (1.0 - smoothstep(uRing.z * 1.03, uRing.z * 1.045, rr));
  float ring = (hair * 0.85 + exp(-d0 * 60.0) * 0.3 + plane * 0.07)
             * mix(0.1, 1.0, lit) * uSkyTune.z * sky * smoothstep(0.0, 0.07, h);
  col = mix(col, uRingCol, clamp(ring, 0.0, 1.0));

  // sun: tight corona, wide bloom and a haze band along the horizon
  vec2 sd = p - uSunP.xy;
  float r = length(sd);
  float glow = exp(-r * 20.0) * 0.9 + exp(-r * 5.0) * 0.45 + exp(-abs(h) * 30.0) * exp(-abs(sd.x) * 1.5) * 0.5;
  glow = clamp(glow * uSun.w, 0.0, 1.0);
  col = mix(col, uGlowTint, glow * uSkyTune.x);
  col += uGlowAdd * glow;
  float disc = (1.0 - smoothstep(uSunP.z - px, uSunP.z + px, r)) * sky;
  col = mix(col, mix(uSunCore, uSunEdge, smoothstep(0.3, 1.0, r / uSunP.z)), disc);

  // dither against banding in the long gradients
  col += (hash(gl_FragCoord.xy) - 0.5) / 128.0;
  frag = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- water

export const WATER_VS = `${HEAD}${SEA}
layout(location = 0) in vec2 aGrid;   // x: -1..1 across, y: 0..1 from near to far
uniform float uLines;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vRow;                        // line coordinate, depth 0..1, ripple light

void main() {
  float z = uGrid.x * pow(uGrid.y / uGrid.x, aGrid.y);
  vec2 p = vec2(aGrid.x * z * uGrid.z, z);
  float lod = z * uGrid.w;
  float e = 0.25 + lod * 1.5;
  float h = seaHeight(p, lod);
  vRow = vec3(aGrid.y * uLines, aGrid.y, gRing);
  vNormal = vec3(h - seaHeight(p + vec2(e, 0.0), lod), e, h - seaHeight(p + vec2(0.0, e), lod));
  vWorld = vec3(p.x, h, p.y);
  gl_Position = uVP * vec4(vWorld, 1.0);
}`;

export const WATER_FS = `${HEAD}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vRow;
uniform vec3 uTrough, uCrest, uLine, uLineHot, uHaze, uGlint, uLamp;
uniform vec4 uTune;      // line alpha, glint amount, fog density, line width in px
uniform vec4 uPointer;   // x, z, strength, reveal 0..1
out vec4 frag;

void main() {
  vec3 toCam = uCam.xyz - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;

  // fine shimmer on top of the swell, fading with distance
  vec2 g = vWorld.xz;
  vec3 N = normalize(vNormal);
  N = normalize(N + (0.03 / (1.0 + dist * 0.045)) * vec3(
    sin(g.x * 2.9 + g.y * 1.3 + uTime * 0.8), 0.0, sin(g.x * 1.1 - g.y * 3.3 + uTime * 0.6)));

  // the line family: constant pixel width, blending into an even tone where lines get
  // denser than the pixel grid (far away and along crest silhouettes)
  float fw = fwidth(vRow.x);
  float dl = abs(fract(vRow.x) - 0.5);
  float hw = 0.5 * uTune.w * fw;
  float line = 1.0 - smoothstep(hw, hw + fw, dl);
  line = mix(line, min(uTune.w * fw, 0.9), smoothstep(0.28, 0.66, fw));
  float major = step(mod(floor(vRow.x), 7.0), 0.5);
  float e = uPointer.w * 1.2;
  float shown = 1.0 - smoothstep(e - 0.2, e, 1.0 - vRow.y);
  float crest = smoothstep(-1.1, 1.3, vWorld.y);
  float lineA = line * uTune.x * mix(0.6, 1.0, major) * mix(0.5, 1.0, crest) * shown;

  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  vec3 col = mix(uTrough, uCrest, clamp(crest * 0.55 + fres * 0.6, 0.0, 1.0));
  col = mix(col, mix(uLine, uLineHot, crest * crest), lineA);

  // sun glitter path
  float nh = max(dot(N, normalize(uSun.xyz + V)), 0.0);
  float glint = (pow(nh, 260.0) * 1.2 + pow(nh, 40.0) * 0.16) * uTune.y * uSun.w;
  col = mix(col, uGlint, clamp(glint * (0.3 + 0.7 * line), 0.0, 1.0));

  // light under the pointer and on the rings a touch sends out
  vec2 pd = g - uPointer.xy;
  float pr = 0.9 + 0.085 * dist;
  float light = uPointer.z * exp(-dot(pd, pd) / (pr * pr)) + vRow.z;
  col = mix(col, uLamp, clamp(light, 0.0, 1.0) * (0.22 + 0.78 * line));

  col = mix(col, uHaze, (1.0 - exp(-dist * uTune.z)) * 0.85);

  // dissolve into the sky far away and into the page at the foot of the canvas
  float alpha = (1.0 - smoothstep(150.0, 480.0, dist)) * smoothstep(0.0, 0.17, gl_FragCoord.y / uView.y);
  frag = vec4(col * alpha, alpha);
}`;

// ---------------------------------------------------------------- light strands

export const RIBBON_VS = `${HEAD}${SEA}${STRAND}
layout(location = 0) in vec2 aRib;    // x: -1..1 along the strand, y: side -1 or 1
uniform vec2 uRibbon;                 // strand index, half width in device px
out vec3 vRib;                        // side, along, distance

void main() {
  int i = int(uRibbon.x);
  float phase = uRibbon.x * 2.1;
  vec3 a = strandPoint(aRib.x, uStrand[i], phase);
  vec3 b = strandPoint(aRib.x + 0.004, uStrand[i], phase);
  vec4 ca = uVP * vec4(a, 1.0);
  vec4 cb = uVP * vec4(b, 1.0);
  vec2 dir = normalize((cb.xy / cb.w - ca.xy / ca.w) * uView.xy);
  ca.xy += vec2(-dir.y, dir.x) * aRib.y * uRibbon.y * 2.0 / uView.xy * ca.w;
  vRib = vec3(aRib.y, aRib.x, length(a - uCam.xyz));
  gl_Position = ca;
}`;

export const RIBBON_FS = `${HEAD}
in vec3 vRib;
uniform vec3 uCore, uGlow;
uniform vec3 uRibTune;   // blend 0 additive .. 1 opaque, intensity, phase
out vec4 frag;

void main() {
  float s = abs(vRib.x);
  float core = 1.0 - smoothstep(0.07, 0.17, s);
  float glow = exp(-s * s * 6.5) * (1.0 - smoothstep(0.85, 1.0, s));
  float pulse = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(vRib.y * 4.0 - uTime * 0.3 + uRibTune.z), 4.0);
  float a = clamp(core * (0.55 + 0.45 * pulse) + glow * 0.42 * pulse, 0.0, 1.0);
  a *= exp(-vRib.z * 0.006) * uRibTune.y;
  frag = vec4(mix(uGlow, uCore, core) * a, a * uRibTune.x);
}`;

// ---------------------------------------------------------------- dots and motes

export const POINT_VS = `${HEAD}${SEA}${STRAND}
layout(location = 0) in vec4 aSeed;   // strand index or -1 for a drifting mote, then three random numbers
uniform vec3 uDot[3];
uniform vec4 uMote;                   // colour, amount
uniform float uShow;
out vec4 vTint;

void main() {
  vec3 pos;
  vec3 col;
  float size;
  float alpha;
  if (aSeed.x >= 0.0) {
    int i = int(aSeed.x);
    float way = aSeed.w > 0.5 ? 1.0 : -1.0;
    float u = fract(aSeed.y + way * uTime * (0.003 + 0.007 * aSeed.z)) * 2.0 - 1.0;
    pos = strandPoint(u, uStrand[i], aSeed.x * 2.1);
    col = uDot[i];
    size = 9.0 + 20.0 * aSeed.z * aSeed.z;
    alpha = (0.55 + 0.45 * sin(uTime * (0.5 + aSeed.w) + aSeed.y * 40.0)) * smoothstep(1.0, 0.86, abs(u));
  } else {
    float z = mix(7.0, 130.0, aSeed.y * aSeed.y);
    pos = vec3((aSeed.z * 2.0 - 1.0) * z * uGrid.z + sin(uTime * 0.05 + aSeed.w * 40.0) * 1.4,
               0.7 + aSeed.w * 4.5 + sin(uTime * 0.21 + aSeed.y * 31.0) * 0.35, z);
    col = uMote.rgb;
    size = 3.0 + 5.0 * aSeed.w;
    alpha = uMote.a * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.3 + aSeed.z) + aSeed.w * 50.0), 2.0));
  }
  float dist = length(pos - uCam.xyz);
  gl_PointSize = size * uView.z * clamp(26.0 / dist, 0.5, 1.7);
  gl_Position = uVP * vec4(pos, 1.0);
  vTint = vec4(col, alpha * uShow * exp(-dist * 0.005));
}`;

export const POINT_FS = `${HEAD}
in vec4 vTint;
uniform float uBlend;    // 0 additive .. 1 opaque
out vec4 frag;

void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float core = 1.0 - smoothstep(0.2, 0.32, d);
  float halo = exp(-d * d * 4.0) * 0.5 * (1.0 - smoothstep(0.75, 1.0, d));
  float a = clamp(core + halo, 0.0, 1.0) * vTint.a;
  frag = vec4(mix(vTint.rgb, vec3(1.0), core * 0.7) * a, a * uBlend);
}`;
