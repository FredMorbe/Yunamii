// Hero scene: a line-drawn sea on a ringed planet at sunrise, rendered with plain WebGL2.
// One projected grid (dense near the viewer, stretched towards the horizon) carries the swell,
// the line family is drawn in the fragment shader, light strands and dots ride on the same waves.

import { SKY_VS, SKY_FS, WATER_VS, WATER_FS, RIBBON_VS, RIBBON_FS, POINT_VS, POINT_FS } from './glsl.js';
import { MAX_HEIGHT, seaHeight } from './sea.js';

const ROWS = 220;
const COLS = 256;
const LINES = 200;            // wave lines between viewer and horizon
const NEAR = 1.6;
const FAR = 620;
const CAM_HEIGHT = 2.9;
const HORIZON = 0.7;          // share of the canvas height above the horizon
const SUN_RADIUS = 0.021;     // in canvas heights
const BASE_FOV = (38 * Math.PI) / 180;
const MIN_HFOV = (46 * Math.PI) / 180;
const MAX_FOV = (68 * Math.PI) / 180;
const RIBBON_SEGMENTS = 320;
const DOTS_PER_STRAND = 10;
const MOTES = 60;
const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 5e6;       // canvas pixel budget, keeps 4K and 5K screens affordable
const INTRO_SECONDS = 3.6;
const DEG = Math.PI / 180;

// row 0..1 (near to far), sway, frequency, speed, half width in px
const STRANDS = [
  { row: 0.4, sway: 0.045, freq: 2.7, speed: 0.045, width: 7 },
  { row: 0.455, sway: 0.06, freq: 2.1, speed: -0.035, width: 6 },
  { row: 0.58, sway: 0.03, freq: 3.4, speed: 0.03, width: 5 },
];

const PALETTES = {
  dark: {
    skyTop: '#050a12', skyMid: '#06131f', skyLow: '#0a2b3a', bg: '#070d16', haze: '#0b3140',
    sunCore: '#fff4d6', sunEdge: '#ffa257', glowTint: '#ff7a3a', glowAdd: [0.55, 0.24, 0.08], glowMix: 0,
    ring: '#7beaf8', ringAmt: 0.9, stars: 1,
    trough: '#040d16', crest: '#0d3a4e', line: '#38d6ee', lineHot: '#c4f8ff', lineAlpha: 0.62,
    glint: '#ff9a5a', glintAmt: 1.5, lamp: '#d2fbff', fog: 0.011,
    strands: [['#e9fdff', '#2fd7f0'], ['#ffc49c', '#ff7847'], ['#c9f7ff', '#1fb3cf']],
    mote: '#bff6ff', moteAmt: 0.8, blend: 0,
  },
  light: {
    skyTop: '#f4f8fc', skyMid: '#eaf3f9', skyLow: '#d8e9f3', bg: '#f8fafc', haze: '#d3e6f1',
    sunCore: '#ffffff', sunEdge: '#ffe1c4', glowTint: '#ffc79a', glowAdd: [0.06, 0.03, 0], glowMix: 0.8,
    ring: '#1fb5d3', ringAmt: 0.75, stars: 0,
    trough: '#bcd9e9', crest: '#6ba3c6', line: '#ffffff', lineHot: '#ffffff', lineAlpha: 0.85,
    glint: '#ff9c5c', glintAmt: 0.9, lamp: '#ffffff', fog: 0.009,
    strands: [['#ffffff', '#22c8e6'], ['#ffa56e', '#ff7847'], ['#ffffff', '#7fe3f5']],
    mote: '#ffffff', moteAmt: 0.5, blend: 0.85,
  },
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Returns null when the device has no WebGL2; shader or link errors throw.
export function createOcean(canvas, { theme, reduceMotion }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if (!gl) return null;

  const host = canvas.parentElement;
  const frameData = new Float32Array(76);   // matches the std140 layout of the Frame block
  const ripples = frameData.subarray(32, 64);
  for (let i = 0; i < 8; i++) ripples[i * 4 + 2] = -100;
  STRANDS.forEach((s, i) => frameData.set([s.row, s.sway, s.freq, s.speed], 64 + i * 4));

  let res = null;              // GL resources, rebuilt after a context loss
  let palette = PALETTES[theme];
  let quality = 1;
  let ratio = 1;
  let aspect = 1;
  let tanX = 1;
  let tanY = 1;
  let time = reduceMotion ? 14 : 0;
  let intro = reduceMotion ? 1 : 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let slowFrames = 0;
  let rippleHead = 0;
  let ripplesUntil = 0;
  let nextDrop = 5;
  let lastTouch = -100;
  const cam = { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1], pos: [0, CAM_HEIGHT, 0] };
  const pointer = { nx: 0, ny: 0, tnx: 0, tny: 0, cx: 0, cy: 0, over: false, x: 0, z: 30, glow: 0, sx: 0, sy: 0, st: 0 };
  const sunP = [0, 0];

  // ------------------------------------------------------------ GL setup

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
    return s;
  }

  function program(vs, fs, names) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
    const block = gl.getUniformBlockIndex(p, 'Frame');
    if (block !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, block, 0);
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  function buffer(target, data) {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, gl.STATIC_DRAW);
    return b;
  }

  function attribute(size) {
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, size, gl.FLOAT, false, 0, 0);
  }

  function build() {
    const sky = program(SKY_VS, SKY_FS, ['uSkyTop', 'uSkyMid', 'uSkyLow', 'uBg', 'uHaze', 'uSunCore', 'uSunEdge',
      'uGlowTint', 'uGlowAdd', 'uRingCol', 'uSkyTune', 'uSunP', 'uRing']);
    const water = program(WATER_VS, WATER_FS, ['uLines', 'uTrough', 'uCrest', 'uLine', 'uLineHot', 'uHaze', 'uGlint',
      'uLamp', 'uTune', 'uPointer']);
    const ribbon = program(RIBBON_VS, RIBBON_FS, ['uRibbon', 'uCore', 'uGlow', 'uRibTune']);
    const points = program(POINT_VS, POINT_FS, ['uDot', 'uMote', 'uShow', 'uBlend']);

    const ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, frameData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

    const skyVao = gl.createVertexArray();

    // sea: rows run from the horizon towards the viewer, so translucent far water is drawn first
    const gridVao = gl.createVertexArray();
    gl.bindVertexArray(gridVao);
    const grid = new Float32Array((ROWS + 1) * (COLS + 1) * 2);
    for (let r = 0, k = 0; r <= ROWS; r++) {
      for (let c = 0; c <= COLS; c++) { grid[k++] = (c / COLS) * 2 - 1; grid[k++] = 1 - r / ROWS; }
    }
    const index = new Uint16Array(ROWS * COLS * 6);
    for (let r = 0, k = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = r * (COLS + 1) + c;
        const d = a + COLS + 1;
        index[k++] = a; index[k++] = d; index[k++] = a + 1;
        index[k++] = a + 1; index[k++] = d; index[k++] = d + 1;
      }
    }
    buffer(gl.ARRAY_BUFFER, grid);
    attribute(2);
    buffer(gl.ELEMENT_ARRAY_BUFFER, index);

    const ribbonVao = gl.createVertexArray();
    gl.bindVertexArray(ribbonVao);
    const rib = new Float32Array((RIBBON_SEGMENTS + 1) * 4);
    for (let i = 0, k = 0; i <= RIBBON_SEGMENTS; i++) {
      const u = (i / RIBBON_SEGMENTS) * 2 - 1;
      rib[k++] = u; rib[k++] = -1; rib[k++] = u; rib[k++] = 1;
    }
    buffer(gl.ARRAY_BUFFER, rib);
    attribute(2);

    const pointVao = gl.createVertexArray();
    gl.bindVertexArray(pointVao);
    const seeds = new Float32Array((STRANDS.length * DOTS_PER_STRAND + MOTES) * 4);
    let k = 0;
    for (let s = 0; s < STRANDS.length; s++) {
      for (let i = 0; i < DOTS_PER_STRAND; i++) { seeds[k++] = s; seeds[k++] = Math.random(); seeds[k++] = Math.random(); seeds[k++] = Math.random(); }
    }
    for (let i = 0; i < MOTES; i++) { seeds[k++] = -1; seeds[k++] = Math.random(); seeds[k++] = Math.random(); seeds[k++] = Math.random(); }
    buffer(gl.ARRAY_BUFFER, seeds);
    attribute(4);
    gl.bindVertexArray(null);

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied: alpha 0 adds light, alpha 1 covers
    res = { sky, water, ribbon, points, ubo, skyVao, gridVao, ribbonVao, pointVao, indexCount: index.length, pointCount: seeds.length / 4 };
    applyPalette();
    resize();
  }

  function applyPalette() {
    const c = palette;
    const { sky, water, points } = res;
    gl.useProgram(sky.p);
    for (const [name, key] of [['uSkyTop', 'skyTop'], ['uSkyMid', 'skyMid'], ['uSkyLow', 'skyLow'], ['uBg', 'bg'], ['uHaze', 'haze'],
      ['uSunCore', 'sunCore'], ['uSunEdge', 'sunEdge'], ['uGlowTint', 'glowTint'], ['uRingCol', 'ring']]) {
      gl.uniform3fv(sky.u[name], hex(c[key]));
    }
    gl.uniform3fv(sky.u.uGlowAdd, c.glowAdd);
    gl.uniform4f(sky.u.uSkyTune, c.glowMix, c.stars, c.ringAmt, 0);

    gl.useProgram(water.p);
    for (const [name, key] of [['uTrough', 'trough'], ['uCrest', 'crest'], ['uLine', 'line'], ['uLineHot', 'lineHot'],
      ['uHaze', 'haze'], ['uGlint', 'glint'], ['uLamp', 'lamp']]) {
      gl.uniform3fv(water.u[name], hex(c[key]));
    }
    gl.uniform1f(water.u.uLines, LINES);

    gl.useProgram(points.p);
    gl.uniform3fv(points.u.uDot, c.strands.flatMap(([, glow]) => hex(glow)));
    gl.uniform4f(points.u.uMote, ...hex(c.mote), c.moteAmt);
    gl.uniform1f(points.u.uBlend, c.blend);
  }

  // ------------------------------------------------------------ size and quality

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h || !res) return;
    ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (w * h))) * quality;
    const pw = Math.max(1, Math.round(w * ratio));
    const ph = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    gl.viewport(0, 0, pw, ph);
    aspect = pw / ph;
    const fov = Math.min(MAX_FOV, Math.max(BASE_FOV, 2 * Math.atan(Math.tan(MIN_HFOV / 2) / aspect)));
    tanY = Math.tan(fov / 2);
    tanX = tanY * aspect;
    const spread = tanX * 1.18 + 0.03;   // a little wider than the view, for the camera sway
    frameData.set([NEAR, FAR, spread, Math.max(Math.log(FAR / NEAR) / ROWS, (2 * spread) / COLS)], 16);
    if (!running) draw();
  }

  // Steps the resolution down when the device stays below 25 fps (never back up, to avoid pumping).
  // Gaps of a quarter second and more come from a throttled background page, not from a slow GPU.
  function adapt(gap) {
    if (gap > 0.25) return;
    slowFrames = gap > 0.04 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 80 && quality > 0.6) {
      quality = Math.max(0.6, quality * 0.8);
      slowFrames = 0;
      resize();
    }
  }

  // ------------------------------------------------------------ camera and frame data

  function updateCamera(scroll) {
    const pitch = Math.atan((2 * HORIZON - 1) * tanY) + scroll * 0.07 + pointer.ny * 0.006;
    const yaw = pointer.nx * 0.022;
    const cp = Math.cos(pitch);
    const f = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
    const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const u = [f[1] * r[2], f[2] * r[0] - f[0] * r[2], -f[1] * r[0]];
    const pos = [0, CAM_HEIGHT + (reduceMotion ? 0 : Math.sin(time * 0.33) * 0.05), 0];
    Object.assign(cam, { r, u, f, pos });

    // view-projection, column major. World: x right, y up, z into the screen.
    const a = (FAR * 2.2 + 0.4) / (0.4 - FAR * 2.2);
    const b = (2 * FAR * 2.2 * 0.4) / (0.4 - FAR * 2.2);
    const cols = [[r[0], u[0], -f[0], 0], [r[1], u[1], -f[1], 0], [r[2], u[2], -f[2], 0], [-dot(r, pos), -dot(u, pos), dot(f, pos), 1]];
    cols.forEach(([x, y, z, w], i) => frameData.set([x / tanX, y / tanY, a * z + b * w, -z], i * 4));
    return { pitch, yaw };
  }

  // direction at infinity -> canvas heights from the centre
  function project(d) {
    const z = dot(d, cam.f) * 2 * tanY;
    return [dot(d, cam.r) / z, dot(d, cam.u) / z];
  }

  function addRipple(x, z, amp) {
    ripples.set([x, z, time, amp], (rippleHead++ % 8) * 4);
    ripplesUntil = time + 9;
  }

  // ------------------------------------------------------------ pointer

  // where the ray through a viewport position meets the moving sea (null above the horizon)
  function waterAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    const d = [0, 1, 2].map((i) => cam.f[i] + cam.r[i] * nx * tanX + cam.u[i] * ny * tanY);
    if (d[1] > -0.004) return { nx, ny, hit: null };
    const above = (t) => cam.pos[1] + d[1] * t - seaHeight(cam.pos[0] + d[0] * t, d[2] * t, time, frameData[19]);
    // walk from above the highest crest to below the deepest trough, then halve the last step
    let a = (cam.pos[1] - MAX_HEIGHT) / -d[1];
    const end = (cam.pos[1] + MAX_HEIGHT) / -d[1];
    const step = (end - a) / 24;
    while (a < end && above(a + step) > 0) a += step;
    let b = a + step;
    for (let i = 0; i < 6; i++) {
      const m = (a + b) / 2;
      if (above(m) > 0) a = m; else b = m;
    }
    const z = d[2] * b;
    return { nx, ny, hit: z < 260 ? [cam.pos[0] + d[0] * b, z] : null };
  }

  function onMove(e) {
    Object.assign(pointer, { cx: e.clientX, cy: e.clientY, over: true });
    const { nx, ny, hit } = waterAt(e.clientX, e.clientY);
    pointer.tnx = nx;
    pointer.tny = ny;
    if (!hit) return;
    lastTouch = time;
    const moved = Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy);
    if (moved > 48 && time - pointer.st > 0.11) {
      addRipple(hit[0], hit[1], 0.05);
      Object.assign(pointer, { sx: e.clientX, sy: e.clientY, st: time });
    }
  }

  function onDown(e) {
    if (e.target.closest('a, button')) return;
    const { hit } = waterAt(e.clientX, e.clientY);
    if (!hit) return;
    lastTouch = time;
    addRipple(hit[0], hit[1], 0.2);
  }

  function onLeave() {
    pointer.tnx = 0;
    pointer.tny = 0;
    pointer.over = false;
  }

  // ------------------------------------------------------------ drawing

  function draw() {
    if (!res) return;
    const scroll = reduceMotion ? 0 : Math.min(1, Math.max(0, window.scrollY / canvas.clientHeight));
    const dawn = 1 - (1 - intro) ** 3;
    const { yaw } = updateCamera(scroll);

    // sun: its azimuth is chosen so it sits right of the centre, a little less on narrow screens
    const sunX = mix(0.34, 0.46, smooth(0.7, 1.5, aspect));
    const azimuth = Math.atan(sunX * tanX);
    const elevation = (mix(-2.6, 0.45, dawn) + scroll * 3) * DEG;
    const sunDir = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)];
    const [sx, sy] = project(sunDir);
    const horizon = project([Math.sin(yaw), 0, Math.cos(yaw)])[1];
    sunP[0] = sx;
    sunP[1] = sy;

    frameData.set([canvas.width, canvas.height, ratio, time], 20);
    frameData.set([...cam.pos, time < ripplesUntil ? 1 : 0], 24);
    frameData.set([sunDir[0], Math.max(sunDir[1], 0.012), sunDir[2], 0.35 + 0.65 * dawn], 28);
    gl.bindBuffer(gl.UNIFORM_BUFFER, res.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameData);

    const c = palette;
    const { sky, water, ribbon, points } = res;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(sky.p);
    const ringScale = Math.min(1, Math.max(0.5, aspect * 0.72));
    gl.uniform4f(sky.u.uSunP, sx, sy, SUN_RADIUS, horizon);
    gl.uniform4f(sky.u.uRing, sx - 0.2 * ringScale, horizon - 0.34 * ringScale, 0.62 * ringScale, Math.tan(yaw) / (2 * tanY) + time * 0.0004);
    gl.bindVertexArray(res.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.useProgram(water.p);
    gl.uniform4f(water.u.uTune, c.lineAlpha, c.glintAmt, c.fog, 1.15 * ratio);
    gl.uniform4f(water.u.uPointer, pointer.x, pointer.z, pointer.glow, smooth(0, 0.7, intro));
    gl.bindVertexArray(res.gridVao);
    gl.drawElements(gl.TRIANGLES, res.indexCount, gl.UNSIGNED_SHORT, 0);

    // lights sit on the surface: tested against it, never written into the depth buffer
    const show = smooth(0.45, 1, intro);
    gl.depthMask(false);
    gl.useProgram(ribbon.p);
    gl.bindVertexArray(res.ribbonVao);
    STRANDS.forEach((s, i) => {
      gl.uniform2f(ribbon.u.uRibbon, i, s.width * ratio);
      gl.uniform3fv(ribbon.u.uCore, hex(c.strands[i][0]));
      gl.uniform3fv(ribbon.u.uGlow, hex(c.strands[i][1]));
      gl.uniform3f(ribbon.u.uRibTune, c.blend, show * (i === 2 ? 0.6 : 1), i * 1.9);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, (RIBBON_SEGMENTS + 1) * 2);
    });
    gl.useProgram(points.p);
    gl.uniform1f(points.u.uShow, show);
    gl.bindVertexArray(res.pointVao);
    gl.drawArrays(gl.POINTS, 0, res.pointCount);
    gl.bindVertexArray(null);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const gap = (now - last) / 1000;
    const dt = Math.min(gap, 0.1);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / INTRO_SECONDS);
    const k = 1 - Math.exp(-dt * 3.2);
    pointer.nx += (pointer.tnx - pointer.nx) * k;
    pointer.ny += (pointer.tny - pointer.ny) * k;
    // the light stays under the pointer while the sea moves beneath it
    const hit = pointer.over ? waterAt(pointer.cx, pointer.cy).hit : null;
    if (hit) [pointer.x, pointer.z] = hit;
    pointer.glow += ((hit ? 1 : 0) - pointer.glow) * k;
    // now and then a drop falls on its own, unless someone is already playing with the water
    if (time > nextDrop) {
      nextDrop = time + 6 + Math.random() * 7;
      if (time - lastTouch > 4) {
        const z = 9 + Math.random() * 40;
        addRipple((Math.random() * 1.5 - 0.75) * z * tanX, z, 0.13);
      }
    }
    draw();
    adapt(gap);
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
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerdown', onDown, { passive: true });
    host.addEventListener('pointerleave', onLeave, { passive: true });
  }
  update();

  return {
    setTheme(name) {
      palette = PALETTES[name];
      if (!res) return;
      applyPalette();
      draw();
    },
    // where the sun currently is, in viewport px
    sunPosition() {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (sunP[0] / aspect + 0.5) * rect.width, y: rect.top + (0.5 - sunP[1]) * rect.height };
    },
  };
}
