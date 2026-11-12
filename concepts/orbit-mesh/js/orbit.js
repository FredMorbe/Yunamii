// The hero graphic: the fabric of space around a small planetary system, drawn as a net of light
// (WebGL2). Mars and its two moons, Phobos and Deimos, press wells into a lattice of 180 x 180 nodes;
// the moons circle on their orbits and their wells travel with them. The vertex shaders do all of it:
// the lattice lines (instanced quads, so their width is exact), the nodes (soft point sprites that
// blur close to the camera) and the dashed orbits, which run along the surface. The three
// bodies are sprites that sit in their wells: Mars is a photo laid on a sphere, the moons are round
// balls with craters made of formulas, locked to Mars as the real ones are. All three are lit by
// the same sun, so the moons show phases as they go round. Lines behind a body are hidden by it.
// The wells are the single source: JavaScript writes them into the shader and reads the same sum
// for the sphere heights.

const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 5e6;          // canvas pixel budget for very large screens
const INTRO_SECONDS = 4.5;
const STILL_TIME = 23;           // the moment shown when motion is reduced
const TAU = Math.PI * 2;

// ---- the lattice: NX x NY nodes, CELL world units apart, turned by ROT around the vertical axis
const NX = 180;
const NY = 180;
const CELL = 0.2;
const ROT = 0.5;                 // radians: the lines run diagonally, as diamonds
const CENTRE = [0, 12.5];        // x, z of the lattice centre
const SEGMENTS = 288;            // line segments of an orbit

// ---- the camera looks down at the net from CAM_H, pitched by PITCH
const CAM_H = 6;
const PITCH = 0.62;
const TAN_V = 0.34;              // tan of half the vertical field of view
const TAN_H_MIN = 0.42;          // narrow screens widen the view so that the whole system stays in it
const FOG = [10.5, 23];          // view depth where the net starts to fade, and where it is gone

// ---- the system, in its own units; layout() scales it to the screen.
// A well is y = -depth * soft / sqrt(r^2 + soft^2): deepest at the centre, a long shallow tail outside.
const PLANET = { radius: 1.2, depth: 4.8, soft: 2.0 };       // Mars
const MOONS = [
  { orbit: 3.7, radius: 0.28, depth: 1.4, soft: 0.7, period: 38, phase: 2.5 },     // Phobos, the inner one; period in seconds
  { orbit: 5.7, radius: 0.224, depth: 1.1, soft: 0.58, period: 91, phase: -0.6 },  // Deimos
];
const POINTER = { depth: 0.7, soft: 1.1 };    // the pointer is a light mass that dents the net a little

const LOOKS = {
  dark: {
    bg0: '#04060b', bg1: '#0a1b29', glow: '#3b86ad', line: '#9db8d0', crest: '#d2e8fa', hot: '#ffd6e4',
    lineA: 0.3, pointA: 0.48, add: true, halo: 1,      // the net is 40 % more transparent than it was (0.5, 0.8)
    night: '#04070d', air: '#e89a6a',                  // what a body keeps in its shadow, and the colour of the dust haze round Mars
    paper: '#04060b', tone: [1, 0, 0, 0],              // the ground a body is veiled towards (see FS_BODY), and: moon gain, veil overall, in the shadow
  },
  light: {
    bg0: '#ffffff', bg1: '#ffffff', glow: '#ffffff', line: '#1d3c5b', crest: '#14527f', hot: '#d04d78',
    lineA: 0.36, pointA: 0.51, add: false, halo: 0.35,   // 40 % more transparent than it was (0.6, 0.85)
    night: '#4f6078', air: '#c0643a',                  // by day the sky fills the shadow: it is a light blue-grey, not black
    paper: '#ffffff', tone: [1.25, 0.04, 0.22, 0],         // the air lies in front of the bodies: they fade into the page where the sun does not light them
  },
};

const STAGES = 3;                // Mars, Phobos and Deimos, in this order
const MARS_PHOTO = new URL('../assets/mars.webp', import.meta.url);
const SPRITE = [1.6, 1.3, 1.3];  // size of each sprite in radii of its body: room for the haze round Mars, the edge of a moon
const HALO = [1, 0, 0];          // strength of the haze round each body

// the sum of wells shared by every shader, and the lattice
const WELL_GLSL = `
const int SEG = ${SEGMENTS};
uniform mat4 uViewProj;
uniform vec4 uTime;        // seconds, intro 0..1, -, -
uniform vec4 uGrid;        // nodes along u, nodes along v, cell size, rotation
uniform vec4 uCentre;      // lattice centre x, z
uniform vec4 uView;        // canvas width, height, pixel ratio, pixels per world unit at depth 1
uniform vec4 uWell[4];     // x, z, depth, soft: planet, two moons, pointer
uniform vec3 uLight;
uniform vec2 uFog;
uniform vec3 uCam;
uniform vec3 uLine, uCrest, uHot;
uniform vec4 uTune;        // line alpha, point alpha, line width in px, depth that counts as deep
uniform int uMode;         // 0: lattice, 1: orbit
uniform vec4 uOrbit;       // orbit centre x, z, radius

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

struct Node { vec3 pos; float crest; float spec; float lit; float spark; float facing; };

vec2 lattice(ivec2 ij) {
  vec2 l = (vec2(ij) - 0.5 * (uGrid.xy - 1.0)) * uGrid.z;
  float cr = cos(uGrid.w);
  float sr = sin(uGrid.w);
  return vec2(cr * l.x - sr * l.y, sr * l.x + cr * l.y) + uCentre.xy;
}

Node nodeAt(vec2 p, vec2 seed) {
  float y = 0.0;
  vec2 grad = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uWell[i];
    vec2 d = p - w.xy;
    float q = dot(d, d) + w.w * w.w;
    float m = w.z * w.w * inversesqrt(q);
    y -= m;
    grad += d * (m / q);
  }
  vec3 pos = vec3(p.x, y, p.y);
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 v = normalize(uCam - pos);
  vec3 h = normalize(uLight + v);
  Node o;
  o.pos = pos;
  o.crest = clamp(clamp(-y / uTune.w, 0.0, 1.0) * 1.1 + length(grad) * 0.3, 0.0, 1.0);
  o.spec = pow(max(dot(n, h), 0.0), 40.0);
  o.lit = max(dot(n, uLight), 0.0);
  o.facing = smoothstep(0.03, 0.3, dot(n, v));   // slopes seen edge-on fade out
  float s = hash(seed);
  o.spark = step(0.94, s) * (0.5 + 0.5 * sin(uTime.x * 0.4 * (0.9 + s * 1.6) + s * 60.0));
  return o;
}

// how much of the net is there: it rises from the far end, and fades out into the distance
float presence(float depth) {
  float dn = clamp((depth - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  float s = uTime.y * 1.5 - (1.0 - clamp(depth / uFog.y, 0.0, 1.0)) * 0.5;
  return (1.0 - dn * dn * (3.0 - 2.0 * dn)) * smoothstep(0.0, 0.5, s);
}
`;

// what the bodies hide: a fragment inside a body's disc and farther away than its centre is hidden.
// The edge is the one of the body (see FS_BODY), so that no ring of bare background is left round it.
const OCCLUDE_GLSL = `
uniform vec4 uOcc[${STAGES}];     // screen x, y and radius in px, view depth of the centre
float unhidden(vec2 frag, float depth) {
  float hidden = 0.0;
  for (int i = 0; i < ${STAGES}; i++) {
    vec4 o = uOcc[i];
    float inside = 1.0 - smoothstep(-1.2, 0.6, length(frag - o.xy) - o.z);
    hidden = max(hidden, inside * smoothstep(-0.1, 0.25, depth - o.w));
  }
  return 1.0 - hidden;
}
`;

const VS_BG = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_BG = `#version 300 es
precision highp float;
uniform vec4 uView;
uniform vec3 uBg0, uBg1, uGlow;
uniform vec3 uMood;      // glow strength, glow centre x, y (0..1 from the bottom left)
out vec4 frag;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uView.xy;
  float asp = uView.x / uView.y;
  // a band of lighter haze behind the system, and a glow around the planet
  float band = exp(-pow((uv.y - 0.62) / 0.34, 2.0));
  vec3 col = mix(uBg0, uBg1, band * 0.55);
  vec2 g = (uv - uMood.yz) * vec2(min(asp, 1.8), 1.0);
  col += uGlow * exp(-dot(g, g * vec2(1.0, 2.0)) / 0.12) * 0.26 * uMood.x;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`;

const VS_LINE = `#version 300 es
precision highp float;
precision highp int;
${WELL_GLSL}
out vec4 vCol;
out float vEdge;
out float vW;
out float vDepth;

void main() {
  int id = gl_InstanceID;
  Node na;
  Node nb;
  if (uMode == 0) {
    int nx = int(uGrid.x);
    int ny = int(uGrid.y);
    int hSeg = (nx - 1) * ny;
    ivec2 a;
    ivec2 b;
    if (id < hSeg) {
      int row = id / (nx - 1);
      a = ivec2(id - row * (nx - 1), row);
      b = a + ivec2(1, 0);
    } else {
      int k = id - hSeg;
      int row = k / nx;
      a = ivec2(k - row * nx, row);
      b = a + ivec2(0, 1);
    }
    na = nodeAt(lattice(a), vec2(a));
    nb = nodeAt(lattice(b), vec2(b));
  } else {
    float a0 = 6.2831853 * float(id) / float(SEG);
    float a1 = 6.2831853 * float(id + 1) / float(SEG);
    na = nodeAt(uOrbit.xy + uOrbit.z * vec2(cos(a0), sin(a0)), vec2(0.0));
    nb = nodeAt(uOrbit.xy + uOrbit.z * vec2(cos(a1), sin(a1)), vec2(0.0));
  }
  vec4 ca = uViewProj * vec4(na.pos, 1.0);
  vec4 cb = uViewProj * vec4(nb.pos, 1.0);
  // behind the camera, or the gap of a dashed orbit: no line
  if (ca.w < 0.2 || cb.w < 0.2 || (uMode != 0 && (id / 2) % 2 == 1)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec4(0.0);
    vEdge = 0.0;
    vW = 0.0;
    vDepth = 1.0;
    return;
  }
  bool atB = gl_VertexID >= 2;
  float side = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  Node nd = na;
  vec4 c = ca;
  if (atB) { nd = nb; c = cb; }

  vec2 sa = ca.xy / ca.w * 0.5 * uView.xy;
  vec2 sb = cb.xy / cb.w * 0.5 * uView.xy;
  vec2 dir = sb - sa;
  dir = dot(dir, dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);
  float lw = uTune.z * (1.7 - 1.0 * clamp((c.w - 4.0) / 16.0, 0.0, 1.0)) * (uMode == 0 ? 1.0 : 1.5);
  float halfPx = 0.5 * lw + 1.0;
  vec2 off = vec2(-dir.y, dir.x) * side * halfPx * 2.0 / uView.xy;
  gl_Position = vec4(c.xy + off * c.w, c.z, c.w);

  vec3 col;
  float intensity;
  if (uMode == 0) {
    intensity = 0.42 + 0.5 * nd.crest + 0.3 * nd.lit + 2.4 * nd.spec;
    col = mix(uLine, uCrest, nd.crest * 0.7);
    col = mix(col, uHot, clamp(nd.spec * 1.4 + nd.crest * nd.crest * 0.45, 0.0, 1.0));
  } else {
    intensity = 1.3;
    col = mix(uCrest, uHot, 0.65);
  }
  vCol = vec4(col, uTune.x * presence(c.w) * intensity * nd.facing);
  vEdge = side * halfPx;
  vW = lw;
  vDepth = c.w;
}`;

const FS_LINE = `#version 300 es
precision highp float;
${OCCLUDE_GLSL}
in vec4 vCol;
in float vEdge;
in float vW;
in float vDepth;
out vec4 frag;
void main() {
  float cover = clamp(0.5 * vW + 0.5 - abs(vEdge), 0.0, 1.0);
  frag = vec4(vCol.rgb, vCol.a * cover * unhidden(gl_FragCoord.xy, vDepth));
}`;

const VS_POINT = `#version 300 es
precision highp float;
precision highp int;
${WELL_GLSL}
out vec4 vCol;
out float vSoft;
out float vDepth;

void main() {
  int nx = int(uGrid.x);
  ivec2 ij = ivec2(gl_VertexID % nx, gl_VertexID / nx);
  Node nd = nodeAt(lattice(ij), vec2(ij));
  vec4 c = uViewProj * vec4(nd.pos, 1.0);
  if (c.w < 0.2) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCol = vec4(0.0);
    vSoft = 1.0;
    vDepth = 1.0;
    return;
  }
  gl_Position = c;

  // close to the camera a node is out of focus: bigger, softer, fainter
  float blur = clamp((9.5 - c.w) / 5.0, 0.0, 1.0);
  float glint = nd.spec + nd.spark * 0.9;
  float radius = 0.0155 * (1.0 + 2.2 * blur + 1.3 * glint);
  gl_PointSize = max(1.5, 2.0 * radius * uView.w / c.w);
  vSoft = 0.35 + 0.65 * blur + 0.3 * nd.spark;
  vDepth = c.w;

  vec3 col = mix(uLine, uCrest, 0.55 + 0.45 * nd.crest);
  col = mix(col, uHot, clamp(glint * 1.2 + nd.crest * nd.crest * 0.5, 0.0, 1.0));
  float alpha = uTune.y * presence(c.w) * nd.facing * (0.45 + 0.8 * nd.crest + 1.8 * glint) / (1.0 + 1.6 * blur * blur);
  vCol = vec4(col, alpha);
}`;

const FS_POINT = `#version 300 es
precision highp float;
${OCCLUDE_GLSL}
in vec4 vCol;
in float vSoft;
in float vDepth;
out vec4 frag;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(1.0 - vSoft, 1.0, d);
  frag = vec4(vCol.rgb, vCol.a * a * unhidden(gl_FragCoord.xy, vDepth));
}`;

// The bodies: one sprite each, big enough for the sphere (or the moon) and the haze round it.
const VS_BODY = `#version 300 es
precision highp float;
uniform mat4 uViewProj;
uniform vec4 uView;
uniform vec4 uBodyPos[${STAGES}];    // x, y, z, radius
uniform vec4 uBodyLook[${STAGES}];   // halo scale, shown 0..1, halo strength
out float vId;
out float vScale;
out float vRadius;
out float vShown;
out float vHalo;
void main() {
  int i = gl_VertexID;
  vec4 b = uBodyPos[i];
  vec4 look = uBodyLook[i];
  vec4 c = uViewProj * vec4(b.xyz, 1.0);
  gl_Position = c;
  float radiusPx = max(b.w * uView.w / c.w * look.y, 0.5);
  gl_PointSize = clamp(2.0 * radiusPx * look.x, 1.0, 1000.0);
  vId = float(i);
  vScale = look.x;
  vRadius = radiusPx;
  vShown = look.y;
  vHalo = look.z;
}`;

const FS_BODY = `#version 300 es
precision highp float;
uniform sampler2D uMars;             // the photo of Mars, a disc cropped to a square
uniform vec3 uBasis[${(STAGES - 1) * 3}];     // the frame of each moon in view space: towards Mars, along its orbit, up
uniform vec3 uNight;                 // what a body keeps where the sun does not light it
uniform vec3 uAir;                   // the colour of the haze round Mars
uniform vec3 uPaper;                 // the ground behind the bodies
uniform vec4 uTone;                  // moon gain, then how far a body is veiled towards the ground: overall, in its shadow
in float vId;
in float vScale;
in float vRadius;
in float vShown;
in float vHalo;
out vec4 frag;
const vec3 SUN = normalize(vec3(-0.55, 0.5, 0.67));       // the light: from the upper left, a little from the front

// ---- noise in space (the same formulas as in the "Moon Torii" concept)
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.02 + vec3(5.1, 1.7, 9.3); a *= 0.5; }
  return s;
}

// how much of the sun's light a point of a body gets: a soft terminator
float sunlight(vec3 n) { return pow(clamp((dot(n, SUN) + 0.08) / 1.08, 0.0, 1.0), 1.1); }

// the light on a body for a share k of the sun: the ambient light of the sky (uNight) and the sun on top,
// so that the lit side is as bright by day as by night and only the shadow is different
vec3 lit(float k) { return uNight + (1.27 - dot(uNight, vec3(1.0 / 3.0))) * k; }

// ---- Mars: the disc of the photo is laid on the disc of the planet (the photo shows one side, so Mars
// does not turn), tamed in colour, and lit by the sun: the light and the shadow come on top of it. A
// faint haze of dust stands at the rim on the side of the sun.
const float MARS_SATURATION = 0.68;     // 1 would be the photo as it is
const float MARS_GAIN = 1.2;
vec3 marsSurface(vec3 photo, vec3 n) {
  vec3 a = mix(vec3(dot(photo, vec3(0.299, 0.587, 0.114))), photo, MARS_SATURATION) * MARS_GAIN;
  float k = sunlight(n);
  return a * lit(k) + uAir * pow(1.0 - n.z, 3.0) * 0.2 * smoothstep(-0.3, 0.6, dot(n, SUN));
}

// ---- Phobos and Deimos: round balls (the real ones are lumps, but a lump drawn from the side looks like a
// squashed ball). They are locked to Mars as the real ones are, so they always show it the same face and
// turn once per orbit: the craters sit in the frame of the moon (uBasis), not of the screen.
// The craters are made of noise on the moon itself, shallow, with a dark floor and a faint bright rim,
// and the walls that face the sun are brighter; Phobos has one huge crater, Stickney.
const vec3 STICKNEY = normalize(vec3(0.5, -0.7, 0.5));
float craters3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float h = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 id = i + g;
        if (hash13(id + 3.3) > 0.6) continue;
        vec3 o = vec3(hash13(id), hash13(id + 1.7), hash13(id + 5.1));
        float rad = 0.22 + 0.3 * hash13(id + 7.7);
        float d = length(g + o - f) / rad;
        float e = (d - 1.0) / 0.22;
        h -= 0.5 * (1.0 - smoothstep(0.0, 0.9, d));
        h += 0.26 * exp(-e * e);
      }
    }
  }
  return h;
}
float moonRelief(vec3 p, int i) {
  float h = craters3(p * 2.6) * 0.8 + craters3(p * 6.5 + 9.0) * 0.2;
  if (i == 1) {
    float s = acos(clamp(dot(p, STICKNEY), -1.0, 1.0));
    float e = (s - 0.52) / 0.09;
    h += -0.9 * (1.0 - smoothstep(0.0, 0.5, s)) + 0.5 * exp(-e * e);
  }
  return h;
}

// a moon: the point of the ball in the frame of the moon decides the craters; the sun lights it by its
// normal and by the slope of the craters
vec3 moonSurface(vec3 n, int i) {
  vec3 U = uBasis[3 * (i - 1)];
  vec3 V = uBasis[3 * (i - 1) + 1];
  vec3 W = uBasis[3 * (i - 1) + 2];
  vec3 p = vec3(dot(U, n), dot(V, n), dot(W, n));
  float rel = moonRelief(p, i);
  float relSun = moonRelief(normalize(p + 0.05 * vec3(dot(SUN, U), dot(SUN, V), dot(SUN, W))), i);     // the same place a little towards the sun
  float k = sunlight(n) * clamp(1.0 + 3.2 * (rel - relSun), 0.2, 2.0);
  vec3 albedo = (i == 1 ? vec3(0.38, 0.34, 0.30) : vec3(0.55, 0.50, 0.45)) * (0.88 + 0.28 * rel) * (0.85 + 0.3 * fbm3(p * 3.0 + float(i) * 7.0));
  return albedo * 1.2 * uTone.x * lit(k);
}

void main() {
  int i = int(vId + 0.5);
  vec2 q = (gl_PointCoord - 0.5) * 2.0 * vScale;     // in radii of the body, y down
  q.y = -q.y;                                         // y up, like the view space of the light
  float d = length(q);
  vec3 n = vec3(q / max(d, 1.0), sqrt(max(1.0 - d * d, 0.0)));

  // the photo of Mars needs screen derivatives (the level of detail): it is read before anything is discarded
  vec3 photo = vec3(0.0);
  if (i == 0) photo = texture(uMars, vec2(0.5 + 0.475 * n.x, 0.5 - 0.475 * n.y)).rgb;     // 5 % of the rim are left out: no edge shows
  if (d > vScale) discard;

  // how much of the pixel the ball covers: the same edge as the one that hides the net (OCCLUDE_GLSL)
  float cover = 1.0 - smoothstep(-1.2, 0.6, (d - 1.0) * vRadius);
  vec3 surf = vec3(0.0);
  float haze = 0.0;                                   // opacity of the haze round Mars
  if (i == 0) {
    if (cover > 0.0) surf = marsSurface(photo, n);
    float x = max(d - 1.0, 0.0);                      // the distance from the limb
    float limbLit = smoothstep(-0.25, 0.75, dot(q / max(d, 1e-3), SUN.xy) + 0.4 * SUN.z);     // the part of the limb the sun shines on
    haze = 0.3 * exp(-x * 14.0) * limbLit * vHalo * (1.0 - smoothstep(0.6 * vScale, vScale, d));
  } else if (cover > 0.0) {
    surf = moonSurface(n, i);
  }

  // the air in front of the body: overall a little, more where the sun does not light it (a lit rim stays crisp)
  if (cover > 0.0) surf = mix(surf, uPaper, (uTone.y + uTone.z * (1.0 - sunlight(n))) * (i == 0 ? 0.6 : 1.0));

  float a = cover * vShown;
  vec3 pm = surf * a;
  haze *= vShown;
  pm += uAir * haze * (1.0 - a);
  a += haze * (1.0 - a);
  frag = vec4(pm / max(a, 1e-4), a);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const smooth = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

// ---- column-major 4x4 matrices for the camera
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function camera(aspect) {
  const tanV = Math.max(TAN_V, TAN_H_MIN / aspect);
  const f = 1 / tanV;
  const near = 0.5;
  const far = 120;
  const cp = Math.cos(PITCH);
  const sp = Math.sin(PITCH);
  const view = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, sp, -cp, 0, 0, -CAM_H * cp, -CAM_H * sp, 1]);
  const proj = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  return { matrix: multiply(proj, view), tanV, aspect, right: [1, 0, 0], up: [0, cp, sp], forward: [0, -sp, cp] };
}

// Where the ray through a point of the canvas (0..1 from the top left) meets the plane at height y.
function groundPoint(cam, nx, ny, y) {
  const ndcX = nx * 2 - 1;
  const ndcY = 1 - ny * 2;
  const k = cam.tanV;
  const dir = [0, 1, 2].map((i) => cam.forward[i] + ndcX * k * cam.aspect * cam.right[i] + ndcY * k * cam.up[i]);
  if (dir[1] > -0.02) return null;
  const t = (y - CAM_H) / dir[1];
  return { x: dir[0] * t, z: dir[2] * t };
}

// a world direction in view space (x to the right, y up, z towards the viewer), as a unit vector
function toView(cam, d) {
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  const v = [dot(cam.right), dot(cam.up), -dot(cam.forward)];
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
}

// the canvas position (in px from the bottom left) and view depth of a world point
function project(cam, canvas, x, y, z) {
  const m = cam.matrix;
  const clip = [0, 1, 2, 3].map((i) => m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i]);
  return { x: (clip[0] / clip[3] * 0.5 + 0.5) * canvas.width, y: (clip[1] / clip[3] * 0.5 + 0.5) * canvas.height, w: clip[3] };
}

// The net at a point: the same sum of wells as in the shader. Returns the height and the gradient.
function surface(wells, x, z) {
  let y = 0;
  let gx = 0;
  let gz = 0;
  for (const w of wells) {
    const dx = x - w.x;
    const dz = z - w.z;
    const q = dx * dx + dz * dz + w.soft * w.soft;
    const m = (w.depth * w.soft) / Math.sqrt(q);
    y -= m;
    gx += (dx * m) / q;
    gz += (dz * m) / q;
  }
  return { y, gx, gz };
}

// The height at which a ball of radius r rests on the net around (x, z): it touches the surface
// where that bulges closest to the ball, and it clears the straight lines between the nodes of
// the lattice, which lie above the surface by up to `sag` (see sagOf). Nothing of the ball sinks in.
function rest(wells, x, z, r, sag) {
  let y = surface(wells, x, z).y + r;
  for (let ring = 1; ring <= 8; ring++) {
    const d = (r * ring) / 8;
    const lift = Math.sqrt(r * r - d * d);
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * TAU;
      y = Math.max(y, surface(wells, x + d * Math.cos(t), z + d * Math.sin(t)).y + lift);
    }
  }
  return y + sag + 0.03 * r;
}

// how far a lattice line between two nodes can lie above the surface of a well: the curvature at
// its centre (depth / soft^2) times the cell size squared over 8, with some margin
const sagOf = (well) => ((well.depth / (well.soft * well.soft)) * CELL * CELL * 1.3) / 8;

// Returns null when the device has no WebGL2; shader or link errors throw.
export function createOrbit(canvas, { theme, reduceMotion }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return null;

  const host = canvas.parentElement;
  const pointer = { x: 0, y: 0, over: false, ground: null };   // x, y: CSS px in the canvas
  const dent = { x: 0, z: 0, mass: 0 };                        // the pointer's dent: follows it softly
  let pull = 0;                  // extra mass after a press, springs back to 0
  let pullSpeed = 0;
  let res = null;                // GL resources, rebuilt after a context loss
  let look = LOOKS[theme];
  let cam = camera(1.8);
  let sys = null;                // where the system is and how big, set by layout()
  let ratio = 1;
  let time = reduceMotion ? STILL_TIME : 0;
  let intro = reduceMotion ? 1 : 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let marsPhoto = null;          // the photo of Mars, once it is loaded

  function program(vs, fs, names) {
    const p = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  function build() {
    const net = ['uViewProj', 'uTime', 'uGrid', 'uCentre', 'uView', 'uWell', 'uLight', 'uFog', 'uCam', 'uLine', 'uCrest', 'uHot', 'uTune', 'uMode', 'uOrbit', 'uOcc'];
    res = {
      bg: program(VS_BG, FS_BG, ['uView', 'uBg0', 'uBg1', 'uGlow', 'uMood']),
      line: program(VS_LINE, FS_LINE, net),
      point: program(VS_POINT, FS_POINT, net),
      body: program(VS_BODY, FS_BODY, ['uViewProj', 'uView', 'uBodyPos', 'uBodyLook', 'uBasis', 'uMars', 'uNight', 'uAir', 'uPaper', 'uTone']),
      mars: gl.createTexture(),
      vao: gl.createVertexArray(),
    };
    gl.bindVertexArray(res.vao);
    upload();
    resize();
  }

  // the photo of Mars goes to texture unit 0 (a black pixel stands in until it is loaded)
  function upload() {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.mars);
    if (marsPhoto) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, marsPhoto);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // A failed load is an error in the console (nothing catches it); Mars then stays black.
  async function load() {
    const response = await fetch(MARS_PHOTO);
    if (!response.ok) throw new Error(`The photo of Mars did not load (${response.status}): ${MARS_PHOTO}`);
    marsPhoto = await createImageBitmap(await response.blob());
    if (!res) return;                  // the context is lost: build() uploads it when it comes back
    upload();
    if (!running) draw();
  }

  // The system sits at the right of the screen (lower and centred on narrow ones) and takes a
  // share of its width; the net around it stays the same size, so the system is scaled by k.
  function layout(w) {
    const narrow = w < 760;
    const [ax, ay] = narrow ? [0.5, 0.68] : [0.71, 0.6];
    const share = narrow ? 0.9 : 0.54;
    const left = groundPoint(cam, 0, ay, 0);
    const right = groundPoint(cam, 1, ay, 0);
    if (!left || !right) throw new Error('The camera does not look down at the net.');
    const k = Math.min(1.6, Math.max(0.55, (share * (right.x - left.x)) / (2 * MOONS[1].orbit * 1.15)));
    const alone = { x: 0, z: 0, depth: PLANET.depth * k, soft: PLANET.soft * k };
    const centre = groundPoint(cam, ax, ay, rest([alone], 0, 0, PLANET.radius * k, sagOf(alone)));
    if (!centre) throw new Error('The camera does not look down at the net.');
    sys = { k, x: centre.x, z: centre.z };
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !res) return;
    ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (w * h)));
    const pw = Math.max(1, Math.round(w * ratio));
    const ph = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    gl.viewport(0, 0, pw, ph);
    cam = camera(w / h);
    layout(w);
    if (!running) draw();
  }

  // where everything is right now: the wells, the bodies on top of them, and what the bodies hide
  function frame() {
    const k = sys.k;
    const strength = 0.25 + 0.75 * (1 - (1 - intro) ** 3);     // the wells deepen while the page opens
    const wells = [{ x: sys.x, z: sys.z, depth: PLANET.depth * k * strength, soft: PLANET.soft * k }];
    const angleOf = (m) => m.phase + (TAU * time) / m.period;
    for (const m of MOONS) {
      const a = angleOf(m);
      wells.push({ x: sys.x + m.orbit * k * Math.cos(a), z: sys.z + m.orbit * k * Math.sin(a), depth: m.depth * k * strength, soft: m.soft * k });
    }
    wells.push({ x: dent.x, z: dent.z, depth: POINTER.depth * k * dent.mass * Math.max(0.2, 1 + pull) * strength, soft: POINTER.soft * k });

    const shown = smooth((intro - 0.3) / 0.55);
    const pxPerUnit = (0.5 * canvas.height) / cam.tanV;
    const bodies = [PLANET, ...MOONS].map((b, i) => {
      const r = b.radius * k;
      const y = rest(wells, wells[i].x, wells[i].z, Math.max(r * shown, 1e-3), sagOf(wells[i]));
      const p = project(cam, canvas, wells[i].x, y, wells[i].z);
      // a moon's frame in view space: towards Mars, along its orbit, up (Mars needs none)
      let basis = null;
      if (i > 0) {
        const a = angleOf(MOONS[i - 1]);
        basis = [[-Math.cos(a), 0, -Math.sin(a)], [-Math.sin(a), 0, Math.cos(a)], [0, 1, 0]].flatMap((d) => toView(cam, d));
      }
      return { x: wells[i].x, y, z: wells[i].z, r, screen: [p.x, p.y, (r * shown * pxPerUnit) / p.w, p.w], basis };
    });
    return { wells, bodies, shown, strength };
  }

  function setNet(r, f) {
    const c = look;
    gl.uniformMatrix4fv(r.u.uViewProj, false, cam.matrix);
    gl.uniform4f(r.u.uTime, time, intro, 0, 0);
    gl.uniform4f(r.u.uGrid, NX, NY, CELL, ROT);
    gl.uniform4f(r.u.uCentre, CENTRE[0], CENTRE[1], 0, 0);
    gl.uniform4f(r.u.uView, canvas.width, canvas.height, ratio, (0.5 * canvas.height) / cam.tanV);
    gl.uniform4fv(r.u.uWell, f.wells.flatMap((w) => [w.x, w.z, w.depth, w.soft]));
    gl.uniform4fv(r.u.uOcc, f.bodies.flatMap((b) => b.screen));
    const l = [-0.3, 0.2, 0.92];
    const len = Math.hypot(...l);
    gl.uniform3f(r.u.uLight, l[0] / len, l[1] / len, l[2] / len);
    gl.uniform2f(r.u.uFog, FOG[0], FOG[1]);
    gl.uniform3f(r.u.uCam, 0, CAM_H, 0);
    gl.uniform3fv(r.u.uLine, hex(c.line));
    gl.uniform3fv(r.u.uCrest, hex(c.crest));
    gl.uniform3fv(r.u.uHot, hex(c.hot));
    gl.uniform4f(r.u.uTune, c.lineA, c.pointA, ratio, 0.5 * PLANET.depth * sys.k);
  }

  function draw() {
    if (!res || !sys) return;
    const c = look;
    const f = frame();
    const planet = f.bodies[0].screen;

    gl.disable(gl.BLEND);
    gl.useProgram(res.bg.p);
    gl.uniform4f(res.bg.u.uView, canvas.width, canvas.height, ratio, 0);
    gl.uniform3fv(res.bg.u.uBg0, hex(c.bg0));
    gl.uniform3fv(res.bg.u.uBg1, hex(c.bg1));
    gl.uniform3fv(res.bg.u.uGlow, hex(c.glow));
    gl.uniform3f(res.bg.u.uMood, f.shown, planet[0] / canvas.width, planet[1] / canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(res.body.p);
    const { u } = res.body;
    gl.uniformMatrix4fv(u.uViewProj, false, cam.matrix);
    gl.uniform4f(u.uView, canvas.width, canvas.height, ratio, (0.5 * canvas.height) / cam.tanV);
    gl.uniform4fv(u.uBodyPos, f.bodies.flatMap((b) => [b.x, b.y, b.z, b.r]));
    gl.uniform4fv(u.uBodyLook, f.bodies.flatMap((_, i) => [SPRITE[i], f.shown, HALO[i] * c.halo, 0]));
    gl.uniform3fv(u.uBasis, f.bodies.slice(1).flatMap((b) => b.basis));
    gl.uniform3fv(u.uNight, hex(c.night));
    gl.uniform3fv(u.uAir, hex(c.air));
    gl.uniform3fv(u.uPaper, hex(c.paper));
    gl.uniform4fv(u.uTone, c.tone);
    gl.uniform1i(u.uMars, 0);
    gl.drawArrays(gl.POINTS, 0, STAGES);

    // the net: lines add up to a glow on a dark page, and lie over a light one
    gl.blendFunc(gl.SRC_ALPHA, c.add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(res.line.p);
    setNet(res.line, f);
    gl.uniform1i(res.line.u.uMode, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, (NX - 1) * NY + NX * (NY - 1));
    gl.uniform1i(res.line.u.uMode, 1);
    for (const m of MOONS) {
      gl.uniform4f(res.line.u.uOrbit, sys.x, sys.z, m.orbit * sys.k, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, SEGMENTS);
    }
    gl.useProgram(res.point.p);
    setNet(res.point, f);
    gl.drawArrays(gl.POINTS, 0, NX * NY);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / INTRO_SECONDS);
    // the pointer's dent follows the pointer softly and fades in and out; a press adds mass for a moment
    if (pointer.ground) {
      const k = 1 - Math.exp(-dt * 3);
      dent.x += (pointer.ground.x - dent.x) * k;
      dent.z += (pointer.ground.z - dent.z) * k;
    }
    dent.mass += ((pointer.over ? 1 : 0) - dent.mass) * (1 - Math.exp(-dt * 1.6));
    pullSpeed += (-pull * 22 - pullSpeed * 6) * dt;
    pull += pullSpeed * dt;
    draw();
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
  }

  const update = () => setRunning(Boolean(res) && visible && !document.hidden && !reduceMotion);

  function aim(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const g = groundPoint(cam, x / rect.width, y / rect.height, 0);
    if (!g) return;
    if (!pointer.over) { dent.x = g.x; dent.z = g.z; }      // arriving: the dent starts under the pointer
    Object.assign(pointer, { x, y, over: true, ground: g });
  }

  build();
  load();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); res = null; update(); });
  canvas.addEventListener('webglcontextrestored', () => { build(); update(); });
  if (!reduceMotion) {
    host.addEventListener('pointermove', aim, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.over = false; }, { passive: true });
    // a touch has no hover: its dent lasts as long as the finger is down
    for (const type of ['pointerup', 'pointercancel']) host.addEventListener(type, (e) => { if (e.pointerType === 'touch') pointer.over = false; }, { passive: true });
    // a press adds mass: the net is drawn in and swings back
    host.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a, button')) return;
      aim(e);
      pullSpeed += 3;
    }, { passive: true });
  }
  update();

  return {
    setTheme(name) {
      look = LOOKS[name];
      if (!running) draw();
    },
  };
}
