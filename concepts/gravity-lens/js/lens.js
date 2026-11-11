// The hero graphic: a coordinate grid seen through a gravitational lens (WebGL2).
// One full-screen fragment shader: every pixel asks where its light left the source plane
// (lens equation of a point mass, β = θ − θ_E² / θ) and draws the grid it finds there.
// Lines therefore bow around the hole, flip inside the Einstein ring and close to a ring
// whenever one of them passes exactly behind the mass.

const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 5e6;        // canvas pixel budget for very large screens
const SHADOW = 0.8;            // radius of the black disc, in Einstein radii
const INTRO_SECONDS = 2.8;
const FOLLOW = 0.07;           // how far the lens leans towards the pointer
const GRID_ANGLE = -0.42;      // rotation of the grid in radians
const DRIFT = [0.021, 0.013];  // cells per second: the grid slides slowly behind the lens

const LOOKS = {
  dark: { bg: '#0b0c0f', line: '#cddcf0', spark: '#f6a04d', hot: '#fff6e8', warm: '#f08a3c', hole: '#030304', lineAlpha: 0.4, far: 0.14 },
  light: { bg: '#f6f5f2', line: '#17181c', spark: '#ee8433', hot: '#fff4e2', warm: '#f08a3c', hole: '#08080a', lineAlpha: 0.38, far: 0.2 },
};

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform vec4 uView;      // canvas width, height, pixel ratio, time
uniform vec4 uLens;      // centre x, y in canvas px from the top left, Einstein radius in px, reveal 0..1
uniform vec4 uGrid;      // cell size in px, rotation, drift x, drift y (in cells)
uniform vec2 uTune;      // line alpha, share of it that is left far from the hole
uniform vec3 uBg, uLine, uSpark, uHot, uWarm, uHole;
out vec4 frag;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 d = p - uLens.xy;
  float r = length(d);
  float e = uLens.z;
  float rs = e * ${SHADOW.toFixed(2)};
  float px = uView.z;

  // where this pixel's light comes from: the lens equation of a point mass
  vec2 beta = d * (1.0 - e * e / max(r * r, 1.0));
  float c = cos(uGrid.y);
  float s = sin(uGrid.y);
  vec2 q = mat2(c, s, -s, c) * beta / uGrid.x + uGrid.zw;

  // two line families of constant pixel width; every fourth line is a little stronger
  vec2 fw = fwidth(q);
  vec2 w = 0.55 * px * fw;
  vec2 l = (1.0 - smoothstep(w, w + fw, abs(fract(q) - 0.5))) * mix(vec2(0.62), vec2(1.0), step(mod(floor(q), 4.0), vec2(0.5)));
  float line = max(l.x, l.y) * (1.0 - smoothstep(0.3, 0.7, max(fw.x, fw.y)));
  float reach = mix(uTune.y, 1.0, 1.0 - smoothstep(rs * 1.3, rs * 4.6, r));

  // a few crossings carry a light; near the ring the lens draws them out into arcs
  vec2 cell = floor(q);
  float dd = length(q - cell - 0.5);
  float aa = max(fw.x, fw.y);
  float lit = step(0.9, hash(cell));
  float spark = lit * ((1.0 - smoothstep(0.05 - aa, 0.05 + aa, dd)) + 0.3 * exp(-dd * dd / 0.02));

  vec3 col = mix(uBg, uLine, line * uTune.x * reach * uLens.w);
  col = mix(col, uSpark, clamp(spark, 0.0, 1.0) * mix(0.55, 1.0, reach) * uLens.w);

  // the hole and its rim of light, brightest where the gas would come towards us
  float edge = r - rs;
  float side = pow(clamp(0.5 + 0.5 * dot(d / max(r, 1.0), vec2(-0.96, -0.28)), 0.0, 1.0), 2.4);
  float ring = exp(-edge * edge / (3.0 * px * px));
  float outer = exp(-max(edge, 0.0) / (rs * 0.07));
  float inner = exp(-max(-edge, 0.0) / (rs * 0.075));
  col = mix(col, uWarm, outer * side * 0.5);
  col = mix(col, uHole, 1.0 - smoothstep(-px, px, edge));
  col = mix(col, uWarm, inner * side * 0.85 * step(edge, 0.0));
  col = mix(col, uHot, clamp(ring * (0.16 + 1.1 * side), 0.0, 1.0));

  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  frag = vec4(col, 1.0);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// Returns null when the device has no WebGL2; shader or link errors throw.
// onProbe(x) reports the pointer's distance from the lens in Einstein radii.
export function createLens(canvas, { theme, reduceMotion, onProbe }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return null;

  const host = canvas.parentElement;
  const base = { x: 0, y: 0, einstein: 100, cell: 48 };   // resting place of the lens, CSS px
  const lens = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0, over: false, moved: false };
  let res = null;                // GL resources, rebuilt after a context loss
  let look = LOOKS[theme];
  let ratio = 1;
  let time = reduceMotion ? 30 : 0;
  let intro = reduceMotion ? 1 : 0;
  let pull = 0;                  // extra mass after a press, springs back to 0
  let pullSpeed = 0;
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
    for (const n of ['uView', 'uLens', 'uGrid', 'uTune', 'uBg', 'uLine', 'uSpark', 'uHot', 'uWarm', 'uHole']) u[n] = gl.getUniformLocation(p, n);
    res = { p, u, vao: gl.createVertexArray() };
    gl.useProgram(p);
    gl.bindVertexArray(res.vao);
    resize();
  }

  // the hole sits at the right edge, partly outside the picture; lower down on narrow screens
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !res) return;
    ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (w * h)));
    const pw = Math.max(1, Math.round(w * ratio));
    const ph = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    gl.viewport(0, 0, pw, ph);
    const narrow = w < 760;
    const shadow = narrow ? Math.min(w * 0.36, h * 0.2) : Math.min(h * 0.28, w * 0.2);
    base.x = w - shadow * 0.37;
    base.y = h * (narrow ? 0.7 : 0.52);
    base.einstein = shadow / SHADOW;
    base.cell = Math.min(84, Math.max(34, shadow * 0.3));
    lens.x = base.x;
    lens.y = base.y;
    if (!running) draw();
  }

  function draw() {
    if (!res) return;
    const c = look;
    const { u } = res;
    const shown = 1 - (1 - intro) ** 3;
    gl.uniform4f(u.uView, canvas.width, canvas.height, ratio, time);
    gl.uniform4f(u.uLens, lens.x * ratio, lens.y * ratio, base.einstein * ratio * shown * (1 + 0.14 * pull), Math.min(1, intro * 2.5));
    gl.uniform4f(u.uGrid, base.cell * ratio, GRID_ANGLE, time * DRIFT[0], time * DRIFT[1]);
    gl.uniform2f(u.uTune, c.lineAlpha, c.far);
    for (const [name, key] of [['uBg', 'bg'], ['uLine', 'line'], ['uSpark', 'spark'], ['uHot', 'hot'], ['uWarm', 'warm'], ['uHole', 'hole']]) {
      gl.uniform3fv(u[name], hex(c[key]));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function probe() {
    onProbe(Math.hypot(pointer.x - lens.x, pointer.y - lens.y) / (base.einstein * (1 + 0.14 * pull)));
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / INTRO_SECONDS);
    // the lens leans a little towards the pointer
    const k = 1 - Math.exp(-dt * 2.6);
    const tx = base.x + (pointer.over ? (pointer.x - base.x) * FOLLOW : 0);
    const ty = base.y + (pointer.over ? (pointer.y - base.y) * FOLLOW : 0);
    lens.x += (tx - lens.x) * k;
    lens.y += (ty - lens.y) * k;
    // a damped spring brings the extra mass of a press back to rest
    pullSpeed += (-pull * 60 - pullSpeed * 9) * dt;
    pull += pullSpeed * dt;
    if (pointer.moved) { pointer.moved = false; probe(); }
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
      Object.assign(pointer, { x: e.clientX - rect.left, y: e.clientY - rect.top, over: true, moved: true });
    }, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.over = false; }, { passive: true });
    // a press adds mass for a moment: the grid is drawn in and swings back
    host.addEventListener('pointerdown', (e) => { if (!e.target.closest('a, button')) pullSpeed += 9; }, { passive: true });
  }
  update();

  return {
    setTheme(name) {
      look = LOOKS[name];
      if (!running) draw();
    },
    // centre of the hole in viewport px
    centre() {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + lens.x, y: rect.top + lens.y };
    },
  };
}
