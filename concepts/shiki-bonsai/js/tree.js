// Draws the bonsai (WebGL2): the wood as ribbons turned towards the viewer, the foliage as
// small brush dabs, the pot as a turned solid. Growing, the seasons, wind and falling leaves
// all happen in the vertex shaders: the buffers of a tree are uploaded once and never touched.

import { SOIL } from './grow.js';

const TAU = Math.PI * 2;
const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 4e6;        // canvas pixel budget for very large screens
const GROW_SECONDS = 6.5;      // from seed to full tree
const FELL_SECONDS = 1.1;      // a tree that makes room for the next one
const SEASON_SECONDS = 2.6;
const FULL = 1.2;              // growth value at which every leaf is out
const PITCH = 0.13;            // the viewer looks down on the tree a little

// per season: three leaf colours (light theme, dark theme), share of leaves shown, leaf size,
// roundness of the dab, height in the pad above which leaves show (snow only lies on top),
// share of leaves in the air at any time, height they fall from
const SEASONS = [
  { light: ['#f3a9bb', '#f7cdd6', '#fdeef1'], dark: ['#f7a8bd', '#ffd0db', '#fff0f4'], show: 0.8, size: 0.0058, round: 0.78, line: 0, loose: 0.012, from: 0 },
  { light: ['#28563d', '#417a52', '#7da367'], dark: ['#3a8a61', '#5fae76', '#a6d98f'], show: 1, size: 0.0058, round: 0.5, line: 0, loose: 0.002, from: 0 },
  { light: ['#a9301a', '#d95f22', '#eba53a'], dark: ['#d8421f', '#f37a2c', '#ffc24d'], show: 0.9, size: 0.0058, round: 0.55, line: 0, loose: 0.006, from: 0 },
  { light: ['#ffffff', '#e3eaf1', '#c6d2de'], dark: ['#ffffff', '#e8f0fc', '#c8d8f0'], show: 0.5, size: 0.004, round: 1, line: 0.6, loose: 0.02, from: 0.75 },
];

const LOOKS = {
  light: { ink: '#1c1916', inkLight: '#4c453c', rim: '#7a7166', pot: '#27323d', potLight: '#5b6b7a', soil: '#14110e', moss: '#6c8c4c', blend: 1 },
  dark: { ink: '#2a2420', inkLight: '#5e5347', rim: '#cdbfa8', pot: '#243340', potLight: '#7790a6', soil: '#0b0a09', moss: '#7fae62', blend: 0.82 },
};

// shared by all programs: the camera and the wind
const COMMON = `#version 300 es
precision highp float;
uniform vec4 uView;    // canvas width, height, pixel ratio, time
uniform vec4 uCam;     // where the pivot lands in canvas px (x, y), px per tree unit, yaw
uniform vec4 uWind;    // gust x, gust z, breeze, unused

const float DIST = 5.0;                      // camera distance in tree units
const vec3 PIVOT = vec3(0.0, 0.5, 0.0);

// turn about the vertical axis through the pivot, then tilt towards the viewer
vec3 toView(vec3 p) {
  vec3 q = p - PIVOT;
  float c = cos(uCam.w);
  float s = sin(uCam.w);
  q = vec3(c * q.x + s * q.z, q.y, c * q.z - s * q.x);
  return vec3(q.x, ${Math.cos(PITCH).toFixed(4)} * q.y - ${Math.sin(PITCH).toFixed(4)} * q.z, ${Math.sin(PITCH).toFixed(4)} * q.y + ${Math.cos(PITCH).toFixed(4)} * q.z);
}

// x, y: clip position, z: depth, w: perspective scale
vec4 project(vec3 v) {
  float scale = DIST / (DIST - v.z);
  vec2 px = uCam.xy + vec2(v.x, -v.y) * uCam.z * scale;
  return vec4(px / uView.xy * vec2(2.0, -2.0) + vec2(-1.0, 1.0), -v.z * 0.4, scale);
}

// wind: the more flexible a point, the further it moves; tips dip a little as they bend
vec3 sway(vec3 p, float flex, float phase) {
  float a = sin(uView.w * 0.8 + p.x * 2.1 + p.y * 1.3 + phase * 6.283);
  float b = sin(uView.w * 1.9 + p.z * 3.7 + phase * 12.0);
  vec2 push = uWind.xy * (1.0 + 0.5 * a) + uWind.z * vec2(a + 0.4 * b, 0.6 * b);
  return p + vec3(push.x, -0.2 * abs(push.x), push.y) * flex * flex;
}
`;

const WOOD_VS = `${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aTan;
layout(location = 2) in vec4 aInfo;    // side, radius, birth, flex
layout(location = 3) in float aAlong;
uniform float uGrow;
out vec3 vWood;                        // side, distance along the limb, light

void main() {
  vec4 a = project(toView(sway(aPos, aInfo.w, 0.0)));
  vec4 b = project(toView(sway(aPos + aTan * 0.02, aInfo.w, 0.0)));
  vec2 across = normalize((b.xy - a.xy) * uView.xy).yx * vec2(-1.0, 1.0);
  // a limb appears as a hairline and thickens for as long as the tree grows
  float born = smoothstep(aInfo.z, aInfo.z + 0.05, uGrow);
  float radius = aInfo.y * born * mix(0.35, 1.0, smoothstep(aInfo.z, aInfo.z + 0.6, uGrow));
  float halfWidth = max(radius * uCam.z * a.w, 0.55 * uView.z * born);
  // thicker wood counts as nearer, so a branch disappears into the trunk it grows from
  gl_Position = vec4(a.xy + across * aInfo.x * halfWidth * 2.0 / uView.xy, a.z - radius * 0.6, 1.0);
  vWood = vec3(aInfo.x, aAlong, dot(across * aInfo.x, vec2(-0.6, 0.8)));
}`;

const WOOD_FS = `#version 300 es
precision highp float;
in vec3 vWood;
uniform vec3 uInk, uInkLight, uRim;
out vec4 frag;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  float s = vWood.x;
  float body = sqrt(max(1.0 - s * s, 0.0));               // round across the limb
  float bark = noise(vec2(vWood.y * 34.0, s * 3.0));      // long streaks, like a dry brush
  float light = clamp(vWood.z * 0.5 + 0.5, 0.0, 1.0);     // lit from the upper left
  vec3 col = mix(uInk, uInkLight, body * (0.2 + 0.8 * light) * (0.5 + 0.5 * bark));
  col = mix(col, uRim, pow(light, 3.0) * (1.0 - body) * 0.7);
  frag = vec4(col, 1.0);
}`;

const LEAF_VS = `${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aSeed;    // show, look, phase, birth
layout(location = 3) in vec4 aMeta;    // flex, height in the pad, moss, loose
uniform float uGrow;
uniform vec4 uSeason;                  // from, to, blend 0..1, height that loose leaves fall from
uniform vec3 uPalette[12];             // three colours per season
uniform vec4 uKind[4];                 // per season: share shown, size, roundness, snow line
uniform vec4 uFall;                    // time of the last shake, share it loosened, share always in the air, unused
uniform vec3 uMoss;
out vec4 vColor;
out vec2 vDab;                         // angle, roundness

vec3 leafColor(int season, float r) {
  vec3 a = uPalette[season * 3];
  vec3 b = uPalette[season * 3 + 1];
  vec3 c = uPalette[season * 3 + 2];
  return r < 0.5 ? mix(a, b, r * 2.0) : mix(b, c, r * 2.0 - 1.0);
}

void main() {
  int s0 = int(uSeason.x);
  int s1 = int(uSeason.y);
  // a season does not switch, it spreads: every leaf turns at its own moment
  float t = clamp(uSeason.z * 1.6 - aSeed.z * 0.6, 0.0, 1.0);
  vec4 k0 = uKind[s0];
  vec4 k1 = uKind[s1];
  float keep = mix(step(aSeed.x, k0.x) * step(k0.w, aMeta.y), step(aSeed.x, k1.x) * step(k1.w, aMeta.y), t);
  vec3 col = mix(leafColor(s0, aSeed.y), leafColor(s1, aSeed.y), t);
  float size = mix(k0.y, k1.y, t);
  float roundness = mix(k0.z, k1.z, t);
  bool moss = aMeta.z > 0.5;
  if (moss) {
    keep = 1.0;
    col = uMoss * (0.75 + 0.5 * aSeed.y);
    size = 0.0042;
    roundness = 1.0;
  }

  vec3 p = sway(aPos, aMeta.x, aSeed.z);
  float alpha = 1.0;
  if (!moss) {
    p += 0.004 * vec3(sin(uView.w * 3.1 + aSeed.z * 50.0), cos(uView.w * 2.7 + aSeed.z * 37.0), sin(uView.w * 3.7 + aSeed.z * 21.0));
    // a few leaves are always in the air, many after a shake; each one grows back in its place
    float age = -1.0;
    float lift = 0.0;        // snow comes from above the tree, shaken leaves from their place
    if (aMeta.w < uFall.z) { age = fract(uView.w * 0.03 + aSeed.z) * 15.0; lift = uSeason.w; }
    float since = uView.w - uFall.x - aSeed.z * 0.8;
    if (aMeta.w < uFall.y && since > 0.0 && since < 4.6) { age = since; lift = 0.0; }
    if (age >= 0.0 && age < 3.3) {
      p.y += lift;
      p.y -= age * (0.1 + 0.12 * aSeed.y) + 0.05 * age * age;
      p.x += (uWind.x * 5.0 + 0.11 * (aSeed.x - 0.5)) * age + 0.035 * sin(age * 4.0 + aSeed.z * 20.0);
      p.z += 0.11 * (aMeta.w - 0.5) * age + 0.035 * cos(age * 3.3 + aSeed.z * 15.0);
      p.y = max(p.y, 0.004);                       // comes to rest on the table
      alpha = 1.0 - smoothstep(2.3, 3.3, age);
      keep = 1.0;
    } else if (age >= 3.3) {
      keep *= smoothstep(3.5, 4.6, age);
    }
  }

  vec3 v = toView(p);
  vec4 clip = project(v);
  float born = smoothstep(aSeed.w, aSeed.w + 0.1, uGrow);
  gl_Position = vec4(clip.xy, clip.z, 1.0);
  gl_PointSize = size * uCam.z * clip.w * 2.0 * keep * born * (0.7 + 0.6 * aSeed.y);
  // light from the upper left, the underside of a pad in shade
  float light = (0.6 + 0.4 * clamp(dot(aNormal, vec3(-0.42, 0.78, 0.46)), -0.4, 1.0)) * mix(0.7, 1.0, aMeta.y);
  vColor = vec4(col * light, alpha * step(0.01, keep * born));
  vDab = vec2(aSeed.x * 6.283 + 0.5 * sin(uView.w * 1.3 + aSeed.z * 30.0), roundness);
}`;

const LEAF_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vDab;
uniform float uBlend;    // below 1 the leaves add a little light of their own
out vec4 frag;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vDab.x);
  float s = sin(vDab.x);
  q = vec2(c * q.x + s * q.y, c * q.y - s * q.x);
  float a = (1.0 - smoothstep(0.72, 1.0, length(q / vec2(1.0, vDab.y)))) * vColor.a;
  if (a < 0.01) discard;
  frag = vec4(vColor.rgb * a, a * uBlend);
}`;

const POT_VS = `${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aNormal;   // normal, 1 for soil
out vec4 vNormal;

void main() {
  vec4 clip = project(toView(aPos));
  gl_Position = vec4(clip.xyz, 1.0);
  vNormal = vec4(toView(aNormal.xyz + PIVOT), aNormal.w);
}`;

const POT_FS = `#version 300 es
precision highp float;
in vec4 vNormal;
uniform vec3 uPot, uPotLight, uSoil;
out vec4 frag;

void main() {
  vec3 n = normalize(vNormal.xyz);
  float light = clamp(dot(n, normalize(vec3(-0.5, 0.7, 0.55))), 0.0, 1.0);
  vec3 glaze = mix(uPot, uPotLight, light * light * 0.8 + 0.25 * pow(1.0 - abs(n.z), 3.0));
  frag = vec4(mix(glaze, uSoil, step(0.5, vNormal.w)), 1.0);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// an oval pot, turned from a profile of radius and height; the last ring is the soil
function pot() {
  const profile = [[0.25, 0], [0.305, 0.012], [0.325, 0.09], [0.35, 0.1], [0.35, 0.114], [0.318, 0.114], [0.312, SOIL], [0, SOIL + 0.006]];
  const SEGMENTS = 56;
  const DEPTH = 0.74;
  const data = [];
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0] = profile[k];
    const [r1, y1] = profile[k + 1];
    const m = Math.hypot(y1 - y0, r1 - r0);
    const out = [(y1 - y0) / m, (r0 - r1) / m];   // normal of the profile: outwards, upwards
    const soil = k === profile.length - 2 ? 1 : 0;
    for (let j = 0; j < SEGMENTS; j++) {
      const corner = (r, y, a) => [r * Math.cos(a), y, r * DEPTH * Math.sin(a), out[0] * Math.cos(a), out[1], out[0] * Math.sin(a), soil];
      const a0 = (j / SEGMENTS) * TAU;
      const a1 = ((j + 1) / SEGMENTS) * TAU;
      data.push(...corner(r0, y0, a0), ...corner(r1, y1, a0), ...corner(r1, y1, a1), ...corner(r0, y0, a0), ...corner(r1, y1, a1), ...corner(r0, y0, a1));
    }
  }
  return new Float32Array(data);
}

// Returns null when the device has no WebGL2; shader or link errors throw.
export function createTree(canvas, { theme, season, reduceMotion }) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;

  const host = canvas.parentElement;
  const layout = { x: 0, y: 0, scale: 300 };       // where the foot of the pot stands (CSS px), px per tree unit
  const pointer = { x: 0, last: 0, over: false, turn: 0 };
  let res = null;                // GL resources, rebuilt after a context loss
  let tree = null;               // buffers of the planted tree as they came from grow.js
  let next = null;               // a tree waiting for the current one to make room
  let look = theme;
  let ratio = 1;
  let time = 0;
  let grow = reduceMotion ? FULL : 0;
  let felling = false;
  let seasons = { from: season, to: season, blend: 1 };
  let shake = { at: -100, share: 0 };
  let gust = 0;
  let yaw = 0;
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
    for (const n of ['uView', 'uCam', 'uWind', ...names]) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  // one interleaved buffer: sizes are the float counts of the attributes in order
  function mesh(data, sizes, index) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = sizes.reduce((a, b) => a + b, 0) * 4;
    let offset = 0;
    sizes.forEach((size, location) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      offset += size * 4;
    });
    if (index) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  function build() {
    const potData = pot();
    res = {
      wood: program(WOOD_VS, WOOD_FS, ['uGrow', 'uInk', 'uInkLight', 'uRim']),
      leaf: program(LEAF_VS, LEAF_FS, ['uGrow', 'uSeason', 'uPalette', 'uKind', 'uFall', 'uMoss', 'uBlend']),
      pot: program(POT_VS, POT_FS, ['uPot', 'uPotLight', 'uSoil']),
      potVao: mesh(potData, [3, 4]),
      potCount: potData.length / 7,
    };
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied alpha
    gl.clearColor(0, 0, 0, 0);
    if (tree) upload();
    resize();
  }

  function upload() {
    res.woodVao = mesh(tree.wood, [3, 3, 4, 1], tree.index);
    res.leafVao = mesh(tree.leaves, [3, 3, 4, 4]);
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
    if (!running) draw();
  }

  function draw() {
    if (!res) return;
    const c = LOOKS[look];
    // the pivot sits half a unit above the foot of the pot; seen from the tilted camera that is a little less on screen
    const drop = 0.5 * Math.cos(PITCH) * (5 / (5 + 0.5 * Math.sin(PITCH)));
    const view = [canvas.width, canvas.height, ratio, time];
    const cam = [layout.x * ratio, (layout.y - drop * layout.scale) * ratio, layout.scale * ratio, yaw];
    const wind = [gust, gust * 0.3, reduceMotion ? 0 : 0.011, 0];
    const common = (prog) => {
      gl.useProgram(prog.p);
      gl.uniform4f(prog.u.uView, ...view);
      gl.uniform4f(prog.u.uCam, ...cam);
      gl.uniform4f(prog.u.uWind, ...wind);
    };

    gl.depthMask(true);   // before the clear: a masked depth buffer would keep the last frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    common(res.pot);
    gl.uniform3fv(res.pot.u.uPot, hex(c.pot));
    gl.uniform3fv(res.pot.u.uPotLight, hex(c.potLight));
    gl.uniform3fv(res.pot.u.uSoil, hex(c.soil));
    gl.bindVertexArray(res.potVao);
    gl.drawArrays(gl.TRIANGLES, 0, res.potCount);
    if (!tree) return;

    common(res.wood);
    gl.uniform1f(res.wood.u.uGrow, grow);
    gl.uniform3fv(res.wood.u.uInk, hex(c.ink));
    gl.uniform3fv(res.wood.u.uInkLight, hex(c.inkLight));
    gl.uniform3fv(res.wood.u.uRim, hex(c.rim));
    gl.bindVertexArray(res.woodVao);
    gl.drawElements(gl.TRIANGLES, tree.index.length, gl.UNSIGNED_SHORT, 0);

    // leaves hide behind the wood but do not hide each other
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    common(res.leaf);
    const now = SEASONS[seasons.to];
    gl.uniform1f(res.leaf.u.uGrow, grow);
    gl.uniform4f(res.leaf.u.uSeason, seasons.from, seasons.to, seasons.blend, now.from);
    gl.uniform3fv(res.leaf.u.uPalette, SEASONS.flatMap((s) => s[look].flatMap(hex)));
    gl.uniform4fv(res.leaf.u.uKind, SEASONS.flatMap((s) => [s.show, s.size, s.round, s.line]));
    gl.uniform4f(res.leaf.u.uFall, shake.at, shake.share, reduceMotion ? 0 : now.loose, 0);
    gl.uniform3fv(res.leaf.u.uMoss, hex(c.moss));
    gl.uniform1f(res.leaf.u.uBlend, c.blend);
    gl.bindVertexArray(res.leafVao);
    gl.drawArrays(gl.POINTS, 0, tree.leaves.length / 14);
    gl.bindVertexArray(null);
  }

  function plant(data) {
    tree = data;
    grow = reduceMotion ? FULL : 0;
    felling = false;
    shake = { at: -100, share: 0 };
    if (res) upload();
    if (!running) draw();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    if (felling) {
      grow -= (dt / FELL_SECONDS) * FULL;
      if (grow <= 0 && next) { plant(next); next = null; }
    } else {
      grow = Math.min(FULL, grow + (dt / GROW_SECONDS) * FULL);
    }
    seasons.blend = Math.min(1, seasons.blend + dt / SEASON_SECONDS);
    // wind: the pointer's speed across the tree becomes a gust that dies down again
    const k = 1 - Math.exp(-dt * 2.2);
    gust += (0 - gust) * k;
    yaw += ((pointer.over ? pointer.turn : 0) + 0.16 * Math.sin(time * 0.17) - yaw) * k;
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
      if (pointer.over) gust = Math.max(-0.07, Math.min(0.07, gust + ((x - pointer.x) / layout.scale) * 0.12));
      pointer.x = x;
      pointer.over = true;
      pointer.turn = ((x - layout.x) / rect.width) * 0.7;
    }, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.over = false; }, { passive: true });
  }
  update();

  return {
    // puts a tree into the pot; one that is already there sheds its leaves and withdraws first
    plant(data) {
      if (!tree || reduceMotion) { plant(data); return; }
      next = data;
      felling = true;
      shake = { at: time, share: 1 };
    },
    setSeason(index) {
      if (index === seasons.to) return;
      seasons = { from: seasons.to, to: index, blend: reduceMotion ? 1 : 0 };
      if (reduceMotion) draw(); else shake = { at: time, share: 0.07 };
    },
    // one leaf in eight comes down and grows back
    shake() {
      if (!reduceMotion && !felling) shake = { at: time, share: 0.125 };
    },
    setTheme(name) {
      look = name;
      if (!running) draw();
    },
    setLayout(nextLayout) {
      Object.assign(layout, nextLayout);
      if (!running) draw();
    },
  };
}
