// The hero graphic: one hydrogen atom, drawn as the probability cloud of its electron (WebGL2).
// Every orbital is one static buffer of spherical coordinates. A morph blends two of those
// buffers in the vertex shader, so a frame is two draw calls: the fine instrument rings and the cloud.

const TAU = Math.PI * 2;
const DISTANCE = 6;            // camera distance in atom radii: a weak perspective
const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 4e6;        // canvas pixel budget for very large screens
const MORPH_SECONDS = 2.8;
const INTRO_SECONDS = 3.6;
const RING = 1.18;             // radius of the instrument rings, in atom radii

const LOOKS = {
  dark: { inner: '#eafdff', outer: '#1fbfdc', spark: '#ff7847', line: '#9fe9f7', size: 1.45, alpha: 0.5, lineAlpha: 0.36, textDim: 0.3, twinkle: 0.4, blend: 0 },
  light: { inner: '#0f172a', outer: '#2f6592', spark: '#f2622e', line: '#0f172a', size: 1.4, alpha: 0.62, lineAlpha: 0.3, textDim: 0.25, twinkle: 0.25, blend: 1 },
};

const POINT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aFrom;   // radius, polar angle, azimuth
layout(location = 1) in vec3 aTo;
layout(location = 2) in vec4 aSeed;   // radius quantile and three random numbers
uniform mat3 uRot;
uniform vec4 uView;      // canvas width, canvas height, pixel ratio, time
uniform vec4 uAtom;      // centre x, y and radius in canvas px, morph 0..1
uniform vec4 uPointer;   // x, y and reach in canvas px, strength
uniform vec4 uText;      // headline in canvas px: left, top, right, bottom
uniform vec4 uCopy;      // lead and button, same form
uniform vec4 uLook;      // point size in px, alpha, alpha behind the text, twinkle
uniform vec3 uInner, uOuter, uSpark;
out vec4 vColor;

// 0 inside a box, rising to 1 a little way outside it
float outside(vec4 box, vec2 px) {
  vec2 o = max(box.xy - px, px - box.zw);
  return smoothstep(-12.0, 70.0, max(o.x, o.y) / uView.z);
}

void main() {
  // every point starts a little later than the last, which turns a blend into a flow
  float t = clamp(uAtom.w * 1.4 - aSeed.y * 0.4, 0.0, 1.0);
  t = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  vec3 s = mix(aFrom, aTo, t);
  float arc = sin(t * 3.14159265);
  s.x *= 1.0 + 0.12 * arc;   // breathe out on the way
  s.z += 0.6 * arc;          // and drift around the axis
  float st = sin(s.y);
  vec3 p = uRot * (s.x * vec3(st * cos(s.z), cos(s.y), st * sin(s.z)));
  float depth = ${DISTANCE.toFixed(1)} / (${DISTANCE.toFixed(1)} - p.z);
  vec2 px = uAtom.xy + vec2(p.x, -p.y) * uAtom.z * depth;

  // the cloud gives way around the pointer
  vec2 away = px - uPointer.xy;
  float push = uPointer.w * exp(-dot(away, away) / (uPointer.z * uPointer.z));
  px += normalize(away + 0.001) * push * uPointer.z * 0.4;

  gl_Position = vec4(px / uView.xy * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  float grain = step(0.97, aSeed.z);   // a few larger, fainter grains
  // depth of field: sharp in the plane of the nucleus, soft in front of it and behind
  float soft = 1.0 + 1.5 * abs(p.z);
  gl_PointSize = uLook.x * uView.z * depth * soft * mix(0.75 + aSeed.z * 0.6, 2.7, grain);

  float twinkle = 1.0 - uLook.w * (0.5 + 0.5 * sin(uView.w * (0.6 + aSeed.w * 1.4) + aSeed.w * 40.0));
  // the cloud thins out behind the text, more so behind the small copy
  float clear = mix(uLook.z, 1.0, outside(uText, px)) * mix(uLook.z * 0.5, 1.0, outside(uCopy, px));
  float fringe = 1.0 - 0.75 * smoothstep(0.72, 1.0, aSeed.x);   // the thin outer tail of the cloud stays faint
  float alpha = uLook.y * twinkle * fringe * clear * mix(1.0, 0.4, grain) * mix(0.7, 1.0, smoothstep(-1.2, 1.0, p.z)) / (soft * sqrt(soft));
  vec3 col = mix(uInner, uOuter, smoothstep(0.15, 1.15, s.x));
  vColor = vec4(mix(col, uSpark, step(0.993, aSeed.w)), alpha);
}`;

const POINT_FS = `#version 300 es
precision highp float;
in vec4 vColor;
uniform float uBlend;    // 0 adds light, 1 covers like ink
out vec4 frag;

void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float a = (1.0 - smoothstep(0.5, 1.0, d)) * vColor.a;
  frag = vec4(vColor.rgb * a, a * uBlend);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
uniform mat3 uRot;
uniform vec4 uView;
uniform vec4 uAtom;      // centre x, y and radius in canvas px, reveal 0..1
uniform vec4 uLine;      // colour, alpha
out vec4 vColor;

void main() {
  vec3 p = uRot * aPos * mix(0.82, 1.0, uAtom.w);
  float depth = ${DISTANCE.toFixed(1)} / (${DISTANCE.toFixed(1)} - p.z);
  vec2 px = uAtom.xy + vec2(p.x, -p.y) * uAtom.z * depth;
  gl_Position = vec4(px / uView.xy * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  vColor = vec4(uLine.rgb, uLine.a * uAtom.w * mix(0.28, 1.0, smoothstep(-1.2, 1.2, p.z)));
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec4 vColor;
uniform float uBlend;
out vec4 frag;

void main() {
  frag = vec4(vColor.rgb * vColor.a, vColor.a * uBlend);
}`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const ease = (t) => t * t * (3 - 2 * t);

// two rings, a graduation and the axis: the frame of an armillary sphere around the atom
function instrument() {
  const v = [];
  const equator = (r, a) => [r * Math.cos(a), 0, r * Math.sin(a)];
  const meridian = (r, a) => [r * Math.cos(a), r * Math.sin(a), 0];
  for (const at of [equator, meridian]) {
    for (let i = 0; i < 240; i++) v.push(...at(RING, (i / 240) * TAU), ...at(RING, ((i + 1) / 240) * TAU));
  }
  // a tick every 5 degrees on the equator, a longer one every 30
  for (let i = 0; i < 72; i++) v.push(...equator(RING, (i / 72) * TAU), ...equator(RING + (i % 6 ? 0.02 : 0.05), (i / 72) * TAU));
  v.push(0, -1.45, 0, 0, 1.45, 0);
  for (const y of [-1.45, 1.45]) v.push(-0.035, y, 0, 0.035, y, 0);
  return new Float32Array(v);
}

// Rz(roll) * Rx(pitch) * Ry(yaw), column major
function rotation(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  const r0 = [cy, 0, sy];
  const r1 = [sx * sy, cx, -sx * cy];
  const r2 = [-cx * sy, sx, cx * cy];
  return [
    cz * r0[0] - sz * r1[0], sz * r0[0] + cz * r1[0], r2[0],
    cz * r0[1] - sz * r1[1], sz * r0[1] + cz * r1[1], r2[1],
    cz * r0[2] - sz * r1[2], sz * r0[2] + cz * r1[2], r2[2],
  ];
}

// clouds(key) returns the points of an orbital; key "origin" is the atom folded into its nucleus.
// Returns null when the device has no WebGL2; shader or link errors throw.
export function createAtom(canvas, { seeds, clouds, start, theme, reduceMotion }) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;

  const host = canvas.parentElement;
  const count = seeds.length / 4;
  const layout = { x: 0, y: 0, radius: 100, text: [0, 0, 0, 0], copy: [0, 0, 0, 0] };
  const pointer = { x: 0, y: 0, over: false, strength: 0, yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 };
  let res = null;                 // GL resources, rebuilt after a context loss
  let look = LOOKS[theme];
  let ratio = 1;
  let from = reduceMotion ? start : 'origin';
  let to = start;
  let pending = null;
  let progress = reduceMotion ? 1 : 0;
  let intro = !reduceMotion;
  let time = reduceMotion ? 20 : 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;

  // ------------------------------------------------------------ GL setup

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

  function buffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  function build() {
    const points = program(POINT_VS, POINT_FS, ['uRot', 'uView', 'uAtom', 'uPointer', 'uText', 'uCopy', 'uLook', 'uInner', 'uOuter', 'uSpark', 'uBlend']);
    const lines = program(LINE_VS, LINE_FS, ['uRot', 'uView', 'uAtom', 'uLine', 'uBlend']);

    const pointVao = gl.createVertexArray();
    gl.bindVertexArray(pointVao);
    buffer(seeds);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);

    const lineVao = gl.createVertexArray();
    gl.bindVertexArray(lineVao);
    const frame = instrument();
    buffer(frame);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied: alpha 0 adds light, alpha 1 covers
    gl.clearColor(0, 0, 0, 0);
    res = { points, lines, pointVao, lineVao, lineCount: frame.length / 3, clouds: new Map() };
    bind();
    resize();
  }

  // points the two position attributes at the orbitals the cloud is moving between
  function bind() {
    gl.bindVertexArray(res.pointVao);
    [from, to].forEach((key, location) => {
      if (!res.clouds.has(key)) res.clouds.set(key, buffer(clouds(key)));
      gl.bindBuffer(gl.ARRAY_BUFFER, res.clouds.get(key));
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
    });
    gl.bindVertexArray(null);
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

  // ------------------------------------------------------------ drawing

  function draw() {
    if (!res) return;
    const { points, lines } = res;
    // one turn in 90 seconds, with a slow sway of the axis
    const sway = reduceMotion ? 0 : 1;
    const rot = rotation(
      time * (TAU / 90) + pointer.yaw,
      0.34 + sway * 0.06 * Math.sin(time * 0.11) + pointer.pitch,
      -0.2 + sway * 0.05 * Math.sin(time * 0.07),
    );
    const shown = ease(progress);
    const atom = [layout.x * ratio, layout.y * ratio, layout.radius * ratio];
    const view = [canvas.width, canvas.height, ratio, time];

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(lines.p);
    gl.uniformMatrix3fv(lines.u.uRot, false, rot);
    gl.uniform4f(lines.u.uView, ...view);
    gl.uniform4f(lines.u.uAtom, ...atom, intro ? shown : 1);
    gl.uniform4f(lines.u.uLine, ...hex(look.line), look.lineAlpha);
    gl.uniform1f(lines.u.uBlend, look.blend);
    gl.bindVertexArray(res.lineVao);
    gl.drawArrays(gl.LINES, 0, res.lineCount);

    gl.useProgram(points.p);
    gl.uniformMatrix3fv(points.u.uRot, false, rot);
    gl.uniform4f(points.u.uView, ...view);
    gl.uniform4f(points.u.uAtom, ...atom, progress);
    gl.uniform4f(points.u.uPointer, pointer.x * ratio, pointer.y * ratio, 90 * ratio, pointer.strength);
    gl.uniform4f(points.u.uText, ...layout.text.map((v) => v * ratio));
    gl.uniform4f(points.u.uCopy, ...layout.copy.map((v) => v * ratio));
    gl.uniform4f(points.u.uLook, look.size, look.alpha, look.textDim, reduceMotion ? 0 : look.twinkle);
    gl.uniform3fv(points.u.uInner, hex(look.inner));
    gl.uniform3fv(points.u.uOuter, hex(look.outer));
    gl.uniform3fv(points.u.uSpark, hex(look.spark));
    gl.uniform1f(points.u.uBlend, look.blend);
    gl.bindVertexArray(res.pointVao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }

  function travel(key) {
    from = to;
    to = key;
    progress = 0;
    intro = false;
    bind();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    if (progress < 1) {
      progress = Math.min(1, progress + dt / (intro ? INTRO_SECONDS : MORPH_SECONDS));
    } else if (pending !== null) {
      travel(pending);
      pending = null;
    }
    const k = 1 - Math.exp(-dt * 3);
    pointer.yaw += (pointer.tyaw - pointer.yaw) * k;
    pointer.pitch += (pointer.tpitch - pointer.pitch) * k;
    pointer.strength += ((pointer.over ? 1 : 0) - pointer.strength) * k;
    draw();
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); raf = requestAnimationFrame(tick); } else cancelAnimationFrame(raf);
  }

  const update = () => setRunning(Boolean(res) && visible && !document.hidden && !reduceMotion);

  // ------------------------------------------------------------ wiring

  build();
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); res = null; update(); });
  canvas.addEventListener('webglcontextrestored', () => { build(); update(); });
  if (!reduceMotion) {
    host.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.over = true;
      // the atom turns a little towards the pointer
      pointer.tyaw = ((pointer.x - layout.x) / rect.width) * 0.9;
      pointer.tpitch = ((pointer.y - layout.y) / rect.height) * 0.5;
    }, { passive: true });
    host.addEventListener('pointerleave', () => {
      pointer.over = false;
      pointer.tyaw = 0;
      pointer.tpitch = 0;
    }, { passive: true });
  }
  update();

  return {
    // moves the cloud into another orbital; a request during a morph waits for its end
    setState(key) {
      if (reduceMotion) {
        from = to = key;
        if (res) { bind(); draw(); }
      } else if (progress < 1) {
        pending = key === to ? null : key;
      } else if (key !== to) {
        travel(key);
      }
    },
    setTheme(name) {
      look = LOOKS[name];
      if (!running) draw();
    },
    // where the nucleus sits, how large the atom is and which text boxes it must not cover (CSS px)
    setLayout(next) {
      Object.assign(layout, next);
      if (!running) draw();
    },
  };
}
