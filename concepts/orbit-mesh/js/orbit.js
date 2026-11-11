// The hero graphic: the fabric of space around a small planetary system, drawn as a net of light
// (WebGL2). A planet and two moons press wells into a lattice of 180 x 180 nodes; the moons
// circle on their orbits and their wells travel with them. The vertex shaders do all of it:
// the lattice lines (instanced quads, so their width is exact), the nodes (soft point sprites that
// blur close to the camera) and the dashed orbits, which run along the surface. The three
// bodies are shaded sprites that sit in their wells; lines behind a body are hidden by it.
// The wells are the single source: JavaScript writes them into the shader and reads the same sum
// for the sphere heights and the live readout.

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
const PLANET = { radius: 1.2, depth: 4.8, soft: 2.0 };
const MOONS = [
  { orbit: 3.7, radius: 0.34, depth: 1.4, soft: 0.7, period: 38, phase: 2.5 },    // period in seconds
  { orbit: 5.7, radius: 0.27, depth: 1.1, soft: 0.58, period: 91, phase: -0.6 },
];
const POINTER = { depth: 0.7, soft: 1.1 };    // the pointer is a light mass that dents the net a little

const LOOKS = {
  dark: {
    bg0: '#04060b', bg1: '#0a1b29', glow: '#3b86ad', line: '#9db8d0', crest: '#d2e8fa', hot: '#ffd6e4',
    lineA: 0.5, pointA: 0.8, add: true, halo: 1,
    bodies: [
      { lit: '#cfeaff', dark: '#08131f', rim: '#73ecf5' },
      { lit: '#ffdbe8', dark: '#1a1018', rim: '#f8c7da' },
      { lit: '#e4ecf5', dark: '#0e1218', rim: '#a9c6e0' },
    ],
  },
  light: {
    bg0: '#f8f5ef', bg1: '#e6ebec', glow: '#ffffff', line: '#1d3c5b', crest: '#14527f', hot: '#d04d78',
    lineA: 0.6, pointA: 0.85, add: false, halo: 0.35,
    bodies: [
      { lit: '#5a93c4', dark: '#10253c', rim: '#2f6fa8' },
      { lit: '#ee86a9', dark: '#6a2a45', rim: '#d04d78' },
      { lit: '#a9b9ca', dark: '#3a4a5c', rim: '#5e7d9c' },
    ],
  },
};

const STAGES = 3;                // the planet and its two moons

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

// what the bodies hide: a fragment inside a body's disc and farther away than its centre is hidden
const OCCLUDE_GLSL = `
uniform vec4 uOcc[${STAGES}];     // screen x, y and radius in px, view depth of the centre
float unhidden(vec2 frag, float depth) {
  float hidden = 0.0;
  for (int i = 0; i < ${STAGES}; i++) {
    vec4 o = uOcc[i];
    float inside = 1.0 - smoothstep(o.z - 1.0, o.z + 1.0, length(frag - o.xy));
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

// The bodies: one sprite each, big enough for the sphere and a halo around it.
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
uniform vec3 uLit[${STAGES}];
uniform vec3 uDark[${STAGES}];
uniform vec3 uRim[${STAGES}];
in float vId;
in float vScale;
in float vRadius;
in float vShown;
in float vHalo;
out vec4 frag;
const vec3 LIGHT = normalize(vec3(-0.55, 0.5, 0.67));
void main() {
  int i = int(vId + 0.5);
  vec2 q = (gl_PointCoord - 0.5) * 2.0 * vScale;     // in radii of the body, y down
  q.y = -q.y;
  float d = length(q);
  if (d > vScale) discard;
  vec3 lit = uLit[i];
  vec3 dark = uDark[i];
  vec3 rim = uRim[i];

  vec3 n = vec3(q, sqrt(max(1.0 - d * d, 0.0)));
  float l = dot(n, LIGHT);
  vec3 sphere = mix(dark, lit, smoothstep(-0.12, 0.85, l));
  // the planet has soft bands, like a gas giant
  if (i == 0) sphere *= 1.0 - 0.13 * (0.5 + 0.5 * sin(q.y * 7.0 + sin(q.x * 2.3) * 0.9));
  sphere += rim * pow(1.0 - n.z, 2.5) * (0.25 + 0.9 * smoothstep(-0.4, 0.5, l));
  float body = (1.0 - smoothstep(1.0 - 1.2 / vRadius, 1.0 + 0.6 / vRadius, d)) * vShown;

  float halo = exp(-max(d - 1.0, 0.0) * 2.2) * (1.0 - smoothstep(0.5 * vScale, vScale, d)) * vHalo * vShown;
  float a = body + (1.0 - body) * halo;
  vec3 col = (sphere * body + rim * halo * (1.0 - body)) / max(a, 1e-4);
  frag = vec4(col, a);
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
// onProbe({ height, slope }) reports the net under the pointer, or at a resting point.
export function createOrbit(canvas, { theme, reduceMotion, onProbe }) {
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
  let probed = 0;

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
      body: program(VS_BODY, FS_BODY, ['uViewProj', 'uView', 'uBodyPos', 'uBodyLook', 'uLit', 'uDark', 'uRim']),
      vao: gl.createVertexArray(),
    };
    gl.bindVertexArray(res.vao);
    resize();
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
    for (const m of MOONS) {
      const a = m.phase + (TAU * time) / m.period;
      wells.push({ x: sys.x + m.orbit * k * Math.cos(a), z: sys.z + m.orbit * k * Math.sin(a), depth: m.depth * k * strength, soft: m.soft * k });
    }
    wells.push({ x: dent.x, z: dent.z, depth: POINTER.depth * k * dent.mass * Math.max(0.2, 1 + pull) * strength, soft: POINTER.soft * k });

    const shown = smooth((intro - 0.3) / 0.55);
    const pxPerUnit = (0.5 * canvas.height) / cam.tanV;
    const bodies = [PLANET, ...MOONS].map((b, i) => {
      const r = b.radius * k;
      const y = rest(wells, wells[i].x, wells[i].z, Math.max(r * shown, 1e-3), sagOf(wells[i]));
      const p = project(cam, canvas, wells[i].x, y, wells[i].z);
      return { x: wells[i].x, y, z: wells[i].z, r, screen: [p.x, p.y, (r * shown * pxPerUnit) / p.w, p.w] };
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
    gl.uniform4fv(u.uBodyLook, f.bodies.flatMap((_, i) => [i === 0 ? 3 : 2.2, f.shown, (i === 0 ? 0.42 : 0.3) * c.halo, 0]));
    gl.uniform3fv(u.uLit, c.bodies.flatMap((b) => hex(b.lit)));
    gl.uniform3fv(u.uDark, c.bodies.flatMap((b) => hex(b.dark)));
    gl.uniform3fv(u.uRim, c.bodies.flatMap((b) => hex(b.rim)));
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

  // the net under the pointer, or under a resting point while the pointer is elsewhere
  function probe() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !sys) return;
    const g = pointer.over && pointer.ground ? pointer.ground : groundPoint(cam, 0.62, 0.8, 0);
    if (!g) return;
    const s = surface(frame().wells, g.x, g.z);
    onProbe({ height: s.y, slope: (Math.atan(Math.hypot(s.gx, s.gz)) * 180) / Math.PI });
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
    if (now - probed > 110) { probed = now; probe(); }
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
  probe();

  return {
    nodes: NX * NY,
    setTheme(name) {
      look = LOOKS[name];
      if (!running) draw();
    },
  };
}
