// The hero graphic of "Moon Torii": a dark moon lit from its rim, a gate of light in front of it and
// ripples spreading on the water below (WebGL2). One fragment shader draws all of it from distance
// functions, so every line has an exact width and no texture is loaded: the moon is a shaded sphere
// with a procedural surface, the torii is a few lines with a glow, the ripples are ellipses that
// grow slowly and fade, and a faint orbit passes behind the moon.
// The numbers (proportions of the gate, the rim light of the moon, the spacing of the rings) are
// measured from the design this concept rebuilds; everything is sized in moon radii.

const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 5e6;          // canvas pixel budget for very large screens
const INTRO_SECONDS = 5;
const STILL_TIME = 0;            // the moment shown when motion is reduced

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;       // canvas size in device pixels
uniform vec3 uMoon;      // moon centre x, y (device pixels from the top left) and radius
uniform vec2 uLook;      // the pointer, smoothed, -1..1
uniform vec3 uClock;     // seconds, intro 0..1, narrow layout 0/1
out vec4 outColor;

const vec3 BG0  = vec3(0.047, 0.047, 0.082);    // page ink
const vec3 BG1  = vec3(0.066, 0.068, 0.100);    // a little lighter round the scene
const vec3 GOLD = vec3(0.902, 0.745, 0.561);
const vec3 HOT  = vec3(1.000, 0.945, 0.780);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
  return s;
}

// shallow craters: a dark floor and a faint bright rim, on a jittered grid
float craters(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float h = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 id = i + g;
      if (hash12(id + 3.3) > 0.62) continue;
      vec2 o = hash22(id);
      float rad = 0.2 + 0.28 * hash12(id + 7.7);
      float d = length(g + o - f) / rad;
      h -= 0.5 * (1.0 - smoothstep(0.0, 0.9, d));
      h += 0.35 * exp(-pow((d - 1.0) / 0.14, 2.0));
    }
  }
  return h;
}

float lin(float a, float b, float x) { return clamp((x - a) / (b - a), 0.0, 1.0); }
float cover(float d, float hw) { return 1.0 - smoothstep(hw - 0.7, hw + 0.7, d); }
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
// distance to an axis-aligned ellipse, first order (good for thin lines)
float ellipseD(vec2 p, vec2 ab) {
  float e = max(length(p / ab), 1e-3);
  return (e - 1.0) * e / max(length(p / (ab * ab)), 1e-5);
}

// ---- the moon: a sphere lit from behind, from the upper right and (more softly) the upper left.
// The light is Lambert with a wide wrap, so the terminator is a soft arc and the lit part is a
// fat crescent. Both directions and all the numbers are fitted to the measured moon of the design.
// The colour comes from the resulting brightness (0..255) along the warm greys of that moon.
vec3 moonRamp(float l) {
  vec3 c = vec3(0.082, 0.080, 0.110);
  c = mix(c, vec3(0.149, 0.141, 0.153), lin(21.0, 37.0, l));
  c = mix(c, vec3(0.314, 0.286, 0.278), lin(37.0, 75.0, l));
  c = mix(c, vec3(0.604, 0.525, 0.467), lin(75.0, 138.0, l));
  c = mix(c, vec3(0.812, 0.718, 0.624), lin(138.0, 188.0, l));
  c = mix(c, vec3(0.933, 0.859, 0.757), lin(188.0, 222.0, l));
  return c;
}
vec3 direction(float az, float el) { return vec3(cos(az) * cos(el), sin(az) * cos(el), sin(el)); }

vec3 moon(vec2 q, float S, float I, out float cov) {
  float r = length(q);
  cov = (1.0 - smoothstep(S - 0.8, S + 0.4, r)) * smoothstep(0.0, 0.3, I);
  if (cov <= 0.0) return vec3(0.0);
  vec3 n = vec3(q.x, -q.y, sqrt(max(S * S - r * r, 0.0))) / S;
  float tilt = -uLook.x * 0.12;                 // the pointer turns the light a little
  float t1 = max(dot(n, direction(0.93 + tilt, -0.07)) + 0.38, 0.0) / 1.38;
  float t2 = max(dot(n, direction(2.14 + tilt, -0.19)) + 0.21, 0.0) / 1.21;
  float lit = 216.0 * pow(t1, 2.51) + 105.0 * pow(t2, 3.64);

  vec2 uv = vec2(atan(n.x, n.z), asin(clamp(n.y, -1.0, 1.0)));
  float tex = (fbm(uv * 1.7 + 3.1) - 0.5) * 0.3 + (craters(uv * 2.4) * 0.6 + craters(uv * 5.5 + 9.0) * 0.4) * 0.2;
  float grain = hash12(gl_FragCoord.xy) - 0.5;
  lit *= (1.0 + tex) * (1.0 + grain * 0.16) * smoothstep(0.0, 0.5, I);
  return moonRamp(20.0 + lit);
}

// ---- stars: the few of the picture, a sparse field and one sparkle
vec3 stars(vec2 v, float S, float t, float I) {
  float k = smoothstep(0.25, 0.85, I);
  float r = max(0.004 * S, 0.8);
  vec3 add = vec3(0.0);
  const vec2 FIXED[4] = vec2[4](vec2(-1.19, -0.89), vec2(-1.625, -0.41), vec2(1.62, 0.09), vec2(1.63, 0.70));
  for (int i = 0; i < 4; i++) {
    float d = length(v - FIXED[i]) * S;
    add += vec3(0.95, 0.93, 0.88) * (1.0 - smoothstep(r - 0.5, r + 0.6, d)) * 0.6;
  }
  vec2 id = floor(v / 0.55);
  float h = hash12(id + 11.0);
  if (h < 0.22) {
    vec2 sp = (id + 0.15 + 0.7 * hash22(id + 5.0)) * 0.55;
    float tw = 0.75 + 0.25 * sin(t * (0.3 + h * 2.0) + h * 50.0);
    float d = length(v - sp) * S;
    add += vec3(0.9, 0.9, 0.95) * (1.0 - smoothstep(r - 0.5, r + 0.6, d)) * (0.18 + 0.4 * hash12(id + 2.0)) * tw;
  }
  add *= mix(smoothstep(-2.6, -1.3, v.x), 1.0, uClock.z);     // the text keeps its sky quiet

  vec2 sd = (v - vec2(1.44, -0.81)) * S;
  vec2 a = abs(sd);
  float thin = max(0.006 * S, 0.8);
  float len = 0.05 * S;
  float spark = exp(-a.y / thin) * exp(-a.x / len) + exp(-a.x / thin) * exp(-a.y / len) + 0.9 * exp(-dot(sd, sd) / (0.0002 * S * S));
  add += vec3(0.98, 0.97, 0.94) * min(spark, 1.1) * (0.88 + 0.12 * sin(t * 0.7));
  return add * k;
}

// ---- the orbit: a very wide, faint ellipse (fitted to the picture). Beyond the rim it shows at
// both sides of the moon; across the dark face of the moon a faint trace of it fades out.
// Returns the brightness outside the moon (x) and over the moon (y).
vec2 orbit(vec2 v, float S, float I) {
  const vec2 C = vec2(3.50, 1.245);
  const float A = 1.763, B = 5.43, TH = 1.6;
  vec2 d = v - C;
  float c = cos(TH), s = sin(TH);
  float u = c * d.x + s * d.y;
  float w = -s * d.x + c * d.y;
  float e = max(sqrt((u / A) * (u / A) + (w / B) * (w / B)), 1e-3);
  float dist = (e - 1.0) / (length(vec2(u / (A * A), w / (B * B))) / e) * S;
  float lw = max(0.0055 * S, 1.1);
  float window = 0.36 * smoothstep(-1.95, -1.45, v.x) * (1.0 - smoothstep(-1.0, -0.9, v.x))
               + 0.28 * smoothstep(0.95, 1.35, v.x) * (1.0 - 0.7 * smoothstep(1.55, 2.1, v.x));
  float upper = 1.0 - smoothstep(-0.02, 0.02, v.y - C.y);
  float line = cover(abs(dist), lw * 0.5) * upper * smoothstep(0.1, 0.6, I);
  return line * vec2(window, 0.18 * (1.0 - smoothstep(-0.95, -0.35, v.x)));
}

// ---- the gate: two pillars, a tie beam and a curved roof beam, all in gold light
vec3 torii(vec2 v, float S, float t, float I) {
  vec2 a = vec2(abs(v.x), v.y);
  vec3 acc = vec3(0.0);
  float lw = max(0.0175 * S, 1.5);
  const float PX = 0.262;       // pillar offset from the centre
  const float BASE = 1.362;     // where the pillars stand
  const float TOP = 0.585;
  float breath = 1.0 + 0.03 * sin(t * 0.5);

  // pillars grow up from the water while the page opens
  float yTop = mix(BASE, TOP, smoothstep(0.2, 0.75, I));
  float dp = sdSeg(a * S, vec2(PX, yTop) * S, vec2(PX, BASE) * S);
  float br = mix(0.45, 1.0, smoothstep(0.55, 1.15, v.y));
  acc += smoothstep(0.08, 0.3, I) * br * (GOLD * (0.62 * cover(dp, lw * 0.5) + 0.3 * exp(-dp / (0.028 * S))) + HOT * 0.24 * cover(dp, lw * 0.2));

  // the pillars again in the water, fading and swaying
  float yb = v.y - BASE;
  if (yb > 0.0) {
    float sway = 0.003 * sin(yb * 30.0 - t * 0.5 + a.x * 20.0) * smoothstep(0.0, 0.3, yb);
    float dr = abs(a.x - PX - sway) * S;
    float fade = 0.75 * exp(-yb / 0.26) * (1.0 - smoothstep(0.5, 0.95, yb)) * smoothstep(0.5, 1.0, I);
    acc += fade * (GOLD * (0.6 * cover(dr, lw * (0.5 + 0.8 * yb)) + 0.3 * exp(-dr / (0.03 * S))) + HOT * 0.16 * cover(dr, lw * 0.2));
  }

  // the roof beam: a curve that sags in the middle, thick there and thin at the ends, with its glow below
  const float HS = 0.598;
  float u = min(a.x, HS) / HS;
  float yc = 0.585 - 0.125 * pow(u, 2.5);
  float slope = 0.125 * 2.5 * pow(u, 1.5) / HS;
  float dy = (v.y - yc) * S / sqrt(1.0 + slope * slope);
  float dk = length(vec2((a.x - min(a.x, HS)) * S, dy));
  float thick = max(mix(0.011, 0.029, 1.0 - u * u) * S, 1.8);
  float edge = smoothstep(0.55, 0.92, I) * (HS + 0.1) - 0.04;
  float shown = 1.0 - smoothstep(edge - 0.04, edge + 0.02, a.x);
  float ends = mix(0.5, 1.0, 1.0 - u * u);
  float glow = 0.26 * exp(-abs(dy) / (dy > 0.0 ? 0.06 * S : 0.015 * S));
  acc += shown * (GOLD * (0.85 * cover(dk, thick * 0.5) + glow * ends) + HOT * 0.5 * cover(dk, thick * 0.2));

  // the tie beam
  float dn = sdSeg(a * S, vec2(0.0, 0.699) * S, vec2(0.417, 0.699) * S);
  float tie = smoothstep(0.6, 0.95, I) * 0.76;
  acc += tie * (GOLD * (0.85 * cover(dn, max(0.0155 * S, 1.3) * 0.5) + 0.14 * exp(-dn / (0.02 * S))) + HOT * 0.2 * cover(dn, 0.4));
  return acc * breath;
}

// ---- the water: a pool of light round the feet and rings that grow slowly and fade
vec3 water(vec2 v, float S, float t, float I) {
  vec2 w = vec2(v.x, v.y - 1.362);
  if (w.y < -0.45 || w.y > 1.0) return vec3(0.0);
  float vis = smoothstep(0.5, 1.0, I);
  vec2 e = vec2(w.x / 0.70, (w.y - 0.03) / 0.07);
  vec3 acc = GOLD * 0.32 * exp(-dot(e, e)) * vis;
  float lw = max(0.0055 * S, 1.1);
  // on a wide screen the far ends of the rings reach towards the text: they fade out before they get there
  float clear = mix(mix(0.4, 1.0, smoothstep(-2.8, -1.8, w.x)), 1.0, uClock.z);
  for (int i = 0; i < 5; i++) {
    // a ring is born at the feet of the gate, grows ever faster and fades; one is born every ~9 s
    float ph = fract(t / 44.0 + (float(i) + 0.8) / 5.0);
    float a = 0.40 + 1.37 * ph + 1.06 * ph * ph;
    a *= 1.0 + 0.005 * sin(w.x / a * 3.0 + t * 0.25 + float(i) * 1.9);
    float b = a * (0.105 + 0.0202 * a);
    float cy = 0.0298 * a * a;
    float d = abs(ellipseD(vec2(w.x, w.y - cy) * S, vec2(a, b) * S));
    if (d > 24.0) continue;
    float al = smoothstep(0.0, 0.3, ph) * exp(-2.9 * max(ph - 0.3, 0.0)) * (1.0 - smoothstep(0.92, 1.0, ph));
    float side = 0.55 + 0.55 * min(abs(w.x) / a, 1.0);
    acc += GOLD * (1.35 * cover(d, lw * 0.5) + 0.3 * exp(-d / (0.014 * S))) * al * side * vis * clear;
  }
  return acc;
}

void main() {
  float S = uMoon.z;
  float t = uClock.x;
  float I = uClock.y;
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 rel = frag - uMoon.xy;
  vec2 par = vec2(1.0, 0.7) * uLook * S;     // layers drift against each other, a few pixels
  vec2 qM = rel - par * 0.030;
  vec2 qT = rel + par * 0.012;
  vec2 qB = rel + par * 0.050;

  float lift = 1.0 - smoothstep(0.4, 4.6, length(rel / S - vec2(0.3, 0.9)));
  vec3 col = mix(BG0, BG1, lift);
  col += stars(qB / S, S, t, I);
  vec2 ring = orbit(qM / S, S, I);
  col += GOLD * ring.x;

  float cov;
  vec3 m = moon(qM, S, I, cov);
  col = mix(col, m, cov);
  col += GOLD * ring.y * cov;

  col += torii(qT / S, S, t, I);
  col += water(qT / S, S, t, I);

  col += (hash12(gl_FragCoord.xy + 0.5) - 0.5) * (1.5 / 255.0);
  outColor = vec4(col, 1.0);
}`;

// The scene sits at the right of the screen and takes a share of its size; on narrow screens it
// sits above the text. Sizes in CSS pixels.
function layout(w, h) {
  const narrow = w < 820;
  if (narrow) {
    const R = Math.min(0.28 * w, 0.16 * h);
    return { x: 0.5 * w, y: Math.max(0.23 * h, 76 + 1.04 * R), R, narrow };
  }
  const R = Math.min(0.134 * w, 0.238 * h);
  return { x: 0.725 * w, y: 0.409 * h, R, narrow };
}

// Returns false when the device has no WebGL2; shader or link errors throw.
export function createScene(canvas, { reduceMotion }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return false;

  const host = canvas.parentElement;
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  let res = null;                // GL resources, rebuilt after a context loss
  let geo = null;
  let ratio = 1;
  let time = reduceMotion ? STILL_TIME : 0;
  let intro = reduceMotion ? 1 : 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;

  function build() {
    const p = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
    const u = {};
    for (const n of ['uRes', 'uMoon', 'uLook', 'uClock']) u[n] = gl.getUniformLocation(p, n);
    res = { p, u, vao: gl.createVertexArray() };
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
    geo = layout(w, h);
    if (!running) draw();
  }

  function draw() {
    if (!res || !geo) return;
    gl.useProgram(res.p);
    gl.uniform2f(res.u.uRes, canvas.width, canvas.height);
    gl.uniform3f(res.u.uMoon, geo.x * ratio, geo.y * ratio, geo.R * ratio);
    gl.uniform2f(res.u.uLook, look.x, look.y);
    gl.uniform3f(res.u.uClock, time, intro, geo.narrow ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / INTRO_SECONDS);
    // the pointer only tilts the light and shifts the layers; it follows slowly
    const k = 1 - Math.exp(-dt / 1.3);
    look.x += (look.tx - look.x) * k;
    look.y += (look.ty - look.y) * k;
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
    look.tx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    look.ty = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
  }

  build();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); res = null; update(); });
  canvas.addEventListener('webglcontextrestored', () => { build(); update(); });
  if (!reduceMotion) {
    host.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') aim(e); }, { passive: true });
    host.addEventListener('pointerleave', () => { look.tx = 0; look.ty = 0; }, { passive: true });
  }
  update();
  return true;
}
