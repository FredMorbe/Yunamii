// The hero graphic: a net of light drawn over moving water (WebGL2).
// A lattice of 160 x 160 nodes lies on the water; a handful of Gerstner waves lift it into swell
// and pull the nodes towards the crests. The vertex shader does all of it, so one frame is a few
// draw calls: the background, the lattice lines (instanced quads, so their width is exact) and
// the nodes (soft point sprites that blur close to the camera).
// The wave table below is the single source: it is written into the shader.

const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 5e6;          // canvas pixel budget for very large screens
const INTRO_SECONDS = 4.5;
const FLOW = 0.4;                // speed of the water: all motion (swell, glints, ripples) runs on this slower clock
const START_TIME = 14;           // the water has been moving before the page opens
const STILL_TIME = 41;           // the frame shown when motion is reduced

// ---- the lattice: NX x NY nodes, CELL world units apart, turned by ROT around the vertical axis
const NX = 160;
const NY = 160;
const CELL = 0.24;
const ROT = 0.5;                 // radians: the lines run diagonally, as diamonds
const CENTRE = [0, 12.5];        // x, z of the lattice centre

// ---- the camera looks down at the water from CAM_H, pitched by PITCH
const CAM_H = 6;
const PITCH = 0.62;
const TAN_V = 0.34;              // tan of half the vertical field of view
const TAN_H_MIN = 0.42;          // narrow screens widen the view so that enough of the net stays in it
const FOG = [10.5, 23];          // view depth where the net starts to fade, and where it is gone

// ---- the waves. dir: degrees from "towards the viewer", positive towards the right.
const WAVES = [
  { dir: -22, len: 12, amp: 0.66, q: 0.6 },
  { dir: 24, len: 7.4, amp: 0.3, q: 0.6 },
  { dir: -58, len: 4.8, amp: 0.14, q: 0.55 },
  { dir: 52, len: 3.2, amp: 0.05, q: 0.5 },
  { dir: -6, len: 2.0, amp: 0.02, q: 0.45 },
  { dir: 96, len: 8.4, amp: 0.2, q: 0.5 },
].map((w, i) => {
  const a = (w.dir * Math.PI) / 180;
  const k = (2 * Math.PI) / w.len;
  return { dx: Math.sin(a), dz: -Math.cos(a), k, amp: w.amp, q: w.q, omega: 0.62 * Math.sqrt(k), phase: i * 1.7 };
});
const SWELL = 0.11;              // how fast the strength of a wave varies across its front, in rad per world unit
const RIPPLES = 8;               // ripples from the pointer that live at the same time
const RIPPLE_SECONDS = 7;        // water time; a ripple is faint long before that
const RIPPLE_REUSE = 4;          // water time after which a ripple's slot may be taken by a pointer ripple

const LOOKS = {
  dark: { bg0: '#04070c', bg1: '#0b2231', glow: '#3f8fb3', line: '#a7c3dc', crest: '#d9eeff', hot: '#8cf2dd', lineA: 0.55, pointA: 0.8, add: true },
  light: { bg0: '#f8f5ef', bg1: '#e3e9ea', glow: '#ffffff', line: '#1d3c5b', crest: '#14527f', hot: '#0aa395', lineA: 0.6, pointA: 0.85, add: false },
};

const f5 = (n) => n.toFixed(5);

// the wave sum shared by every vertex shader
const WAVE_GLSL = `
const int NW = ${WAVES.length};
const vec4 WA[NW] = vec4[NW](${WAVES.map((w) => `vec4(${f5(w.dx)}, ${f5(w.dz)}, ${f5(w.k)}, ${f5(w.amp)})`).join(', ')});
const vec3 WB[NW] = vec3[NW](${WAVES.map((w) => `vec3(${f5(w.omega)}, ${f5(w.q)}, ${f5(w.phase)})`).join(', ')});

uniform mat4 uViewProj;
uniform vec4 uTime;        // seconds, intro 0..1, wave strength 0..1, -
uniform vec4 uGrid;        // nodes along u, nodes along v, cell size, rotation
uniform vec4 uCentre;      // lattice centre x, z, camera height, -
uniform vec4 uView;        // canvas width, height, pixel ratio, pixels per world unit at depth 1
uniform vec4 uRipple[${RIPPLES}];   // x, z, start time, strength
uniform vec3 uLight;
uniform vec2 uFog;
uniform vec3 uCam;
uniform vec3 uLine, uCrest, uHot;
uniform vec4 uTune;        // line alpha, point alpha, line width in px, -

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

struct Node { vec3 pos; float crest; float spec; float lit; float spark; float facing; };

Node node(ivec2 ij) {
  vec2 l = (vec2(ij) - 0.5 * (uGrid.xy - 1.0)) * uGrid.z;
  float cr = cos(uGrid.w);
  float sr = sin(uGrid.w);
  vec2 p = vec2(cr * l.x - sr * l.y, sr * l.x + cr * l.y) + uCentre.xy;
  float t = uTime.x;

  vec3 q = vec3(p.x, 0.0, p.y);
  vec2 grad = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    vec2 d = WA[i].xy;
    float k = WA[i].z;
    float a = WA[i].w * uTime.z * (0.78 + 0.22 * sin(dot(p, vec2(d.y, -d.x)) * ${f5(SWELL)} + t * 0.09 + WB[i].z * 2.3));
    float ph = k * dot(d, p) - WB[i].x * t + WB[i].z;
    float c = cos(ph);
    q.y += a * sin(ph);
    q.xz += d * (WB[i].y * a * c);       // nodes bunch up at the crests
    grad += d * (a * k * c);
  }
  // ripples of the pointer: a ring that runs out and dies away
  for (int i = 0; i < ${RIPPLES}; i++) {
    float age = t - uRipple[i].z;
    if (age > 0.0 && age < ${RIPPLE_SECONDS.toFixed(1)}) {
      float r = length(p - uRipple[i].xy);
      float front = age * 3.6;
      float w = exp(-pow(r - front, 2.0) / (2.0 * (0.8 + 0.3 * age) * (0.8 + 0.3 * age)));
      // it swells in instead of appearing at once, and dies away well before its slot is reused
      float life = smoothstep(0.0, 0.9, age) * (1.0 - smoothstep(${(RIPPLE_SECONDS - 2).toFixed(1)}, ${RIPPLE_SECONDS.toFixed(1)}, age));
      float amp = uRipple[i].w * w * life * exp(-age * 0.7) / (1.0 + r * 0.12);
      float ph = (r - front) * 2.4;
      q.y += amp * cos(ph);
      grad += (p - uRipple[i].xy) / max(r, 0.001) * (-2.4 * amp * sin(ph));
    }
  }

  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 v = normalize(uCam - q);
  vec3 h = normalize(uLight + v);
  Node o;
  o.pos = q;
  o.crest = clamp(0.5 + 0.5 * q.y / 0.85, 0.0, 1.0);
  o.spec = pow(max(dot(n, h), 0.0), 48.0);
  o.lit = max(dot(n, uLight), 0.0);
  o.facing = smoothstep(0.03, 0.3, dot(n, v));   // slopes seen edge-on, such as the far side of a wave, fade out
  float s = hash(vec2(ij));
  o.spark = step(0.9, s) * (0.5 + 0.5 * sin(t * (0.9 + s * 1.6) + s * 60.0));
  return o;
}

// how much of the net is there: it rises from the far end, and fades out into the distance
float presence(float depth) {
  float dn = clamp((depth - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  float s = uTime.y * 1.5 - (1.0 - clamp(depth / uFog.y, 0.0, 1.0)) * 0.5;
  return (1.0 - dn * dn * (3.0 - 2.0 * dn)) * smoothstep(0.0, 0.5, s);
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
uniform vec2 uMood;      // glow strength, intro
out vec4 frag;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uView.xy;
  float asp = uView.x / uView.y;
  // a band of lighter water haze where the net fades out, strongest on the right
  float band = exp(-pow((uv.y - 0.7) / 0.26, 2.0));
  vec3 col = mix(uBg0, uBg1, band * 0.85);
  vec2 g = vec2((uv.x - 0.72) * min(asp, 1.8), uv.y - 0.7);
  col += uGlow * exp(-dot(g, g * vec2(1.0, 7.0)) / 0.18) * 0.22 * uMood.x;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`;

const VS_LINE = `#version 300 es
precision highp float;
precision highp int;
${WAVE_GLSL}
out vec4 vCol;
out float vEdge;
out float vW;

void main() {
  int nx = int(uGrid.x);
  int ny = int(uGrid.y);
  int hSeg = (nx - 1) * ny;
  int id = gl_InstanceID;
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
  Node na = node(a);
  Node nb = node(b);
  vec4 ca = uViewProj * vec4(na.pos, 1.0);
  vec4 cb = uViewProj * vec4(nb.pos, 1.0);
  if (ca.w < 0.2 || cb.w < 0.2) {            // behind the camera: no line
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec4(0.0);
    vEdge = 0.0;
    vW = 0.0;
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
  float lw = uTune.z * (1.7 - 1.0 * clamp((c.w - 4.0) / 16.0, 0.0, 1.0));
  float halfPx = 0.5 * lw + 1.0;
  vec2 off = vec2(-dir.y, dir.x) * side * halfPx * 2.0 / uView.xy;
  gl_Position = vec4(c.xy + off * c.w, c.z, c.w);

  float intensity = 0.3 + 0.45 * nd.crest + 0.3 * nd.lit + 2.4 * nd.spec;
  vec3 col = mix(uLine, uCrest, nd.crest * 0.7);
  col = mix(col, uHot, clamp(nd.spec * 1.4 + nd.crest * nd.crest * 0.22, 0.0, 1.0));
  vCol = vec4(col, uTune.x * presence(c.w) * intensity * nd.facing);
  vEdge = side * halfPx;
  vW = lw;
}`;

const FS_LINE = `#version 300 es
precision highp float;
in vec4 vCol;
in float vEdge;
in float vW;
out vec4 frag;
void main() {
  float cover = clamp(0.5 * vW + 0.5 - abs(vEdge), 0.0, 1.0);
  frag = vec4(vCol.rgb, vCol.a * cover);
}`;

const VS_POINT = `#version 300 es
precision highp float;
precision highp int;
${WAVE_GLSL}
out vec4 vCol;
out float vSoft;

void main() {
  int nx = int(uGrid.x);
  ivec2 ij = ivec2(gl_VertexID % nx, gl_VertexID / nx);
  Node nd = node(ij);
  vec4 c = uViewProj * vec4(nd.pos, 1.0);
  if (c.w < 0.2) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCol = vec4(0.0);
    vSoft = 1.0;
    return;
  }
  gl_Position = c;

  // close to the camera a node is out of focus: bigger, softer, fainter
  float blur = clamp((9.5 - c.w) / 5.0, 0.0, 1.0);
  float glint = nd.spec + nd.spark * 0.9;
  float radius = 0.0155 * (1.0 + 2.2 * blur + 1.3 * glint);
  gl_PointSize = max(1.5, 2.0 * radius * uView.w / c.w);
  vSoft = 0.35 + 0.65 * blur + 0.3 * nd.spark;

  vec3 col = mix(uLine, uCrest, 0.55 + 0.45 * nd.crest);
  col = mix(col, uHot, clamp(glint * 1.2 + nd.crest * nd.crest * 0.3, 0.0, 1.0));
  float alpha = uTune.y * presence(c.w) * nd.facing * (0.4 + 0.7 * nd.crest + 1.8 * glint) / (1.0 + 1.6 * blur * blur);
  vCol = vec4(col, alpha);
}`;

const FS_POINT = `#version 300 es
precision highp float;
in vec4 vCol;
in float vSoft;
out vec4 frag;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(1.0 - vSoft, 1.0, d);
  frag = vec4(vCol.rgb, vCol.a * a);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

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

// Where the ray through a point of the canvas (0..1 from the top left) meets the resting water.
function groundPoint(cam, nx, ny) {
  const ndcX = nx * 2 - 1;
  const ndcY = 1 - ny * 2;
  const k = cam.tanV;
  const dir = [0, 1, 2].map((i) => cam.forward[i] + ndcX * k * cam.aspect * cam.right[i] + ndcY * k * cam.up[i]);
  if (dir[1] > -0.02) return null;
  const t = -CAM_H / dir[1];
  return { x: dir[0] * t, z: dir[2] * t };
}

// Returns null when the device has no WebGL2; shader or link errors throw.
export function createTide(canvas, { theme, reduceMotion }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return null;

  const host = canvas.parentElement;
  const pointer = { x: 0, y: 0, over: false, travel: 0 };   // x, y: CSS px in the canvas
  const light = { x: 0.3, target: 0.3 };
  const ripples = new Float32Array(RIPPLES * 4).fill(-100);
  let stirred = 0;               // when the pointer last made a ripple, in ms
  let res = null;                // GL resources, rebuilt after a context loss
  let look = LOOKS[theme];
  let cam = camera(1.8);
  let ratio = 1;
  let time = reduceMotion ? STILL_TIME : START_TIME;
  let intro = reduceMotion ? 1 : 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;

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
    const water = ['uViewProj', 'uTime', 'uGrid', 'uCentre', 'uView', 'uRipple', 'uLight', 'uFog', 'uCam', 'uLine', 'uCrest', 'uHot', 'uTune'];
    res = {
      bg: program(VS_BG, FS_BG, ['uView', 'uBg0', 'uBg1', 'uGlow', 'uMood']),
      line: program(VS_LINE, FS_LINE, water),
      point: program(VS_POINT, FS_POINT, water),
      vao: gl.createVertexArray(),
    };
    gl.bindVertexArray(res.vao);
    resize();
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
    if (!running) draw();
  }

  function setWater(r) {
    const c = look;
    gl.uniformMatrix4fv(r.u.uViewProj, false, cam.matrix);
    gl.uniform4f(r.u.uTime, time, intro, 0.25 + 0.75 * (1 - (1 - intro) ** 3), 0);
    gl.uniform4f(r.u.uGrid, NX, NY, CELL, ROT);
    gl.uniform4f(r.u.uCentre, CENTRE[0], CENTRE[1], CAM_H, 0);
    gl.uniform4f(r.u.uView, canvas.width, canvas.height, ratio, (0.5 * canvas.height) / cam.tanV);
    gl.uniform4fv(r.u.uRipple, ripples);
    const l = [light.x, 0.2, 0.92];
    const len = Math.hypot(...l);
    gl.uniform3f(r.u.uLight, l[0] / len, l[1] / len, l[2] / len);
    gl.uniform2f(r.u.uFog, FOG[0], FOG[1]);
    gl.uniform3f(r.u.uCam, 0, CAM_H, 0);
    gl.uniform3fv(r.u.uLine, hex(c.line));
    gl.uniform3fv(r.u.uCrest, hex(c.crest));
    gl.uniform3fv(r.u.uHot, hex(c.hot));
    gl.uniform4f(r.u.uTune, c.lineA, c.pointA, ratio, 0);
  }

  function draw() {
    if (!res) return;
    const c = look;
    gl.disable(gl.BLEND);
    gl.useProgram(res.bg.p);
    gl.uniform4f(res.bg.u.uView, canvas.width, canvas.height, ratio, 0);
    gl.uniform3fv(res.bg.u.uBg0, hex(c.bg0));
    gl.uniform3fv(res.bg.u.uBg1, hex(c.bg1));
    gl.uniform3fv(res.bg.u.uGlow, hex(c.glow));
    gl.uniform2f(res.bg.u.uMood, 1, intro);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, c.add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(res.line.p);
    setWater(res.line);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, (NX - 1) * NY + NX * (NY - 1));
    gl.useProgram(res.point.p);
    setWater(res.point);
    gl.drawArrays(gl.POINTS, 0, NX * NY);
  }

  // A ripple takes the slot of the oldest one. A passing pointer only gets a slot whose ripple has
  // died away (force = false), so no ring is cut off while it can still be seen.
  function ripple(x, z, strength, force) {
    let oldest = 0;
    for (let i = 1; i < RIPPLES; i++) if (ripples[i * 4 + 2] < ripples[oldest * 4 + 2]) oldest = i;
    if (!force && time - ripples[oldest * 4 + 2] < RIPPLE_REUSE) return;
    ripples.set([x, z, time, strength], oldest * 4);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt * FLOW;
    intro = Math.min(1, intro + dt / INTRO_SECONDS);
    light.x += (light.target - light.x) * (1 - Math.exp(-dt * 0.9));
    draw();
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
  }

  const update = () => setRunning(Boolean(res) && visible && !document.hidden && !reduceMotion);

  build();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); res = null; update(); });
  canvas.addEventListener('webglcontextrestored', () => { build(); update(); });
  if (!reduceMotion) {
    host.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (pointer.over) pointer.travel += Math.hypot(x - pointer.x, y - pointer.y);
      Object.assign(pointer, { x, y, over: true });
      light.target = 0.3 + (x / rect.width - 0.5) * 0.3;      // the glints follow the pointer a little
      // a faint ripple now and then while the pointer travels over the water
      if (pointer.travel > 260 && e.timeStamp - stirred > 1400) {
        pointer.travel = 0;
        stirred = e.timeStamp;
        const g = groundPoint(cam, x / rect.width, y / rect.height);
        if (g) ripple(g.x, g.z, 0.07, false);
      }
    }, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.over = false; light.target = 0.3; }, { passive: true });
    // a press drops a stone
    host.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a, button')) return;
      const rect = canvas.getBoundingClientRect();
      const g = groundPoint(cam, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      if (g) ripple(g.x, g.z, 0.4, true);
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
