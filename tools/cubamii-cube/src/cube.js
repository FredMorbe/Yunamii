/* The Cubamii hero cube — the game's 7×7×7 block in the browser.

   Same idea as the app: every cube carries its row clues on the faces that point
   along the row, the player chisels the empty cubes away and paints the sure ones,
   and the finished animal falls apart into its 2×2×2 sub-voxels. Here the carving
   plays itself once and the block can be dragged around at any time.

   The block is the app's fox (foxModel.js). The 7³ puzzle is derived exactly like
   VoxelAnimal.fromDetailLayers: a cube belongs to the fox as soon as one of its
   eight sub-voxels is filled; clue notation follows Clues.kt (plain / circle for
   two groups / square for three or more).

   Axes: x left→right, y front→back, z up (z-up camera), cell (0,0,0) at the front-left floor. */

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three"
import { FOX } from "./foxModel.js"

const N = 7
const CELLS = N * N * N
const SUB = FOX.size

/* ── palette (raw sRGB, the shaders write straight to the canvas) ── */
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const BASE = hexRgb("#142a3d")
const EDGE = hexRgb("#3fd0e0")
const RIM = hexRgb("#1fa8bd")
const TEAL = hexRgb("#2dd4e8")
const SOLVED = hexRgb("#f8b4d0")   // the ring turns blossom pink once the animal is found (Yunamii accent; the app itself uses gold)

/* ── the puzzle, derived from the fox ── */
const cellIndex = (x, y, z) => x + y * N + z * N * N

const buildFox = () => {
  /* ids[z][y][x] — the layer rows run back (y = 13) to front (y = 0) */
  const sub = (x, y, z) => FOX.layers[z][SUB - 1 - y][x]
  const solid = new Uint8Array(CELLS)
  const tint = new Array(CELLS)
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ids = []
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const id = sub(x * 2 + dx, y * 2 + dy, z * 2 + dz)
      if (id !== ".") ids.push(id)
    }
    if (!ids.length) continue
    const accent = [...FOX.accents].find((a) => ids.includes(a))
    const counts = {}
    ids.forEach((id) => { counts[id] = (counts[id] || 0) + 1 })
    const id = accent ?? Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]
    const c = cellIndex(x, y, z)
    solid[c] = 1
    tint[c] = hexRgb(FOX.palette[id])
  }

  const details = []
  for (let z = 0; z < SUB; z++) for (let y = 0; y < SUB; y++) for (let x = 0; x < SUB; x++) {
    const id = sub(x, y, z)
    if (id !== ".") details.push({ x, y, z, cell: cellIndex(x >> 1, y >> 1, z >> 1), color: hexRgb(FOX.palette[id]) })
  }
  return { solid, tint, details }
}

/* clue of one line: { count, shape } with shape 0 plain, 1 circle (two groups), 2 square (three or more) */
const clueOf = (line) => {
  let groups = 0
  let count = 0
  let run = false
  for (const filled of line) {
    if (filled) { count++; if (!run) groups++ }
    run = !!filled
  }
  return { count, shape: groups <= 1 ? 0 : groups === 2 ? 1 : 2 }
}

const buildClues = (solid) => {
  const at = (x, y, z) => solid[cellIndex(x, y, z)]
  const clues = { x: [], y: [], z: [] }
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    clues.x[a + b * N] = clueOf(Array.from({ length: N }, (_, i) => at(i, a, b)))   // x-line at (y = a, z = b)
    clues.y[a + b * N] = clueOf(Array.from({ length: N }, (_, i) => at(a, i, b)))   // y-line at (x = a, z = b)
    clues.z[a + b * N] = clueOf(Array.from({ length: N }, (_, i) => at(a, b, i)))   // z-line at (x = a, y = b)
  }
  return clues
}

/* number atlas: 8 counts × 3 shapes, 64 px cells, white digits with a dark outline so they read on any cube */
const buildAtlas = () => {
  const CELL = 64
  const canvas = document.createElement("canvas")
  canvas.width = CELL * 8
  canvas.height = CELL * 3
  const ctx = canvas.getContext("2d")
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `700 40px "DM Sans", "Manrope", system-ui, sans-serif`
  for (let shape = 0; shape < 3; shape++) {
    for (let count = 0; count < 8; count++) {
      const cx = count * CELL + CELL / 2
      const cy = shape * CELL + CELL / 2 + 2
      ctx.lineJoin = "round"
      ctx.strokeStyle = "rgba(2, 8, 18, 0.92)"
      ctx.lineWidth = 7
      ctx.strokeText(String(count), cx, cy)
      ctx.fillStyle = "#f4fbff"
      ctx.fillText(String(count), cx, cy)
      if (shape === 0) continue
      ctx.beginPath()
      if (shape === 1) ctx.arc(cx, cy - 1, 25, 0, Math.PI * 2)
      else ctx.roundRect(cx - 24, cy - 25, 48, 48, 6)
      ctx.strokeStyle = "rgba(2, 8, 18, 0.92)"
      ctx.lineWidth = 6.5
      ctx.stroke()
      ctx.strokeStyle = "#f4fbff"
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.anisotropy = 4
  return { texture, cell: CELL }
}

/* ── shaders ── */
const CUBE_VERT = /* glsl */ `
  attribute vec4 aTint;     // fox colour of the cube (rgb) and a per-cube variation (a)
  attribute float aPaint;   // 0 = raw stone, 1 = painted with its animal colour
  uniform vec3 uBase;
  uniform float uEdgeStone;
  uniform float uEdgePaint;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vEdge;
  varying float vFlash;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vUv = uv;
    vec3 stone = uBase * (0.86 + 0.28 * aTint.a);
    vColor = mix(stone, aTint.rgb, aPaint);
    vEdge = mix(uEdgeStone, uEdgePaint, aPaint);
    vFlash = sin(aPaint * 3.14159265);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const CUBE_FRAG = /* glsl */ `
  uniform vec3 uCamera;
  uniform vec3 uEdge;
  uniform vec3 uRim;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vEdge;
  varying float vFlash;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 key = normalize(vec3(-0.5, -0.65, 0.8));
    vec3 fill = normalize(vec3(0.75, 0.15, 0.3));
    float light = 0.36 + max(dot(n, key), 0.0) * 0.66 + max(dot(n, fill), 0.0) * 0.2;
    vec3 col = vColor * light;
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = smoothstep(0.085, 0.0, min(e.x, e.y));
    col = mix(col, uEdge, edge * vEdge);
    vec3 view = normalize(uCamera - vWorld);
    float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
    col += uRim * fres * 0.3;
    col += vec3(1.0, 0.86, 0.55) * vFlash * 0.4;
    gl_FragColor = vec4(col, 1.0);
  }
`

const CLUE_VERT = /* glsl */ `
  attribute vec4 aUv;       // atlas cell: offset (xy), size (zw)
  attribute float aShow;
  varying vec2 vUv;
  varying float vShow;
  void main() {
    vUv = aUv.xy + uv * aUv.zw;
    vShow = aShow;
    vec3 p = vec3(position.xy * aShow, position.z);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
  }
`

const CLUE_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vShow;
  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    float a = tex.a * clamp(vShow * 1.4, 0.0, 1.0);
    if (a < 0.02) discard;
    gl_FragColor = vec4(tex.rgb, a * 0.95);
  }
`

const RING_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`

const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uPower;
  varying vec2 vPos;
  void main() {
    float r = length(vPos);
    float line = exp(-pow((r - uRadius) / 0.075, 2.0));
    float glow = exp(-pow((r - uRadius) / 0.5, 2.0)) * 0.34;
    float halo = exp(-pow(r / (uRadius * 0.92), 2.0)) * 0.1;
    float a = (line * 0.95 + glow + halo) * uPower;
    gl_FragColor = vec4(uColor * a, a);
  }
`

/* ── helpers ── */
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t) }
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3)
const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* face directions (the floor face is never seen): normal, right and up of the clue quad */
const FACES = [
  { axis: "x", dir: 1, n: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1] },
  { axis: "x", dir: -1, n: [-1, 0, 0], r: [0, -1, 0], u: [0, 0, 1] },
  { axis: "y", dir: 1, n: [0, 1, 0], r: [-1, 0, 0], u: [0, 0, 1] },
  { axis: "y", dir: -1, n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  { axis: "z", dir: 1, n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
]

/* timing of one carving run, in seconds */
const PEEL_START = 0.15
const PEEL_STEP = 0.3
const REMOVE_DUR = 0.5
const PAINT_AT = 2.0
const PAINT_DUR = 0.55
const DETAIL_AT = 3.9
const DETAIL_DUR = 0.6

export function createCubamiiCube(canvas, { reducedMotion = false, onPhase = () => {} } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new Scene()
  const camera = new PerspectiveCamera(28, 1, 1, 120)
  camera.up.set(0, 0, 1)

  const { solid, tint, details } = buildFox()
  const clues = buildClues(solid)
  const rand = mulberry(7)
  const jitter = Float32Array.from({ length: CELLS }, () => rand())
  const dummy = new Object3D()

  /* ── cubes ── */
  const cubeGeo = new BoxGeometry(1, 1, 1)
  const aTint = new Float32Array(CELLS * 4)
  const aPaint = new Float32Array(CELLS)
  for (let c = 0; c < CELLS; c++) {
    const col = tint[c] || BASE
    aTint.set([col[0], col[1], col[2], jitter[c]], c * 4)
  }
  const tintAttr = new InstancedBufferAttribute(aTint, 4)
  const paintAttr = new InstancedBufferAttribute(aPaint, 1)
  paintAttr.setUsage(35048) // DynamicDrawUsage
  cubeGeo.setAttribute("aTint", tintAttr)
  cubeGeo.setAttribute("aPaint", paintAttr)

  const cubeUniforms = {
    uBase: { value: BASE },
    uEdge: { value: EDGE },
    uRim: { value: RIM },
    uCamera: { value: new Vector3() },
    uEdgeStone: { value: 0.62 },
    uEdgePaint: { value: 0.22 },
  }
  const cubeMat = new ShaderMaterial({ vertexShader: CUBE_VERT, fragmentShader: CUBE_FRAG, uniforms: cubeUniforms })
  const cubes = new InstancedMesh(cubeGeo, cubeMat, CELLS)
  cubes.frustumCulled = false
  scene.add(cubes)

  /* ── sub-voxels of the finished fox ── */
  const detailGeo = new BoxGeometry(1, 1, 1)
  const dTint = new Float32Array(details.length * 4)
  const dPaint = new Float32Array(details.length).fill(1)
  details.forEach((d, i) => dTint.set([d.color[0], d.color[1], d.color[2], 0.5], i * 4))
  const dTintAttr = new InstancedBufferAttribute(dTint, 4)
  dTintAttr.setUsage(35048)
  detailGeo.setAttribute("aTint", dTintAttr)
  detailGeo.setAttribute("aPaint", new InstancedBufferAttribute(dPaint, 1))
  const detailMat = new ShaderMaterial({
    vertexShader: CUBE_VERT,
    fragmentShader: CUBE_FRAG,
    /* same finish as a painted cube, so a cube and the sub-voxels it splits into look alike at the moment of the split */
    uniforms: { ...cubeUniforms, uEdgeStone: { value: 0 } },
  })
  const detailMesh = new InstancedMesh(detailGeo, detailMat, details.length)
  detailMesh.frustumCulled = false
  scene.add(detailMesh)

  /* ── clue numbers ── */
  const atlas = buildAtlas()
  const quads = []   // { cell, face, clue }
  for (let c = 0; c < CELLS; c++) {
    const x = c % N
    const y = Math.floor(c / N) % N
    const z = Math.floor(c / (N * N))
    FACES.forEach((face, f) => {
      const line = face.axis === "x" ? y + z * N : face.axis === "y" ? x + z * N : x + y * N
      quads.push({ cell: c, face: f, clue: clues[face.axis][line] })
    })
  }
  const clueGeo = new PlaneGeometry(1, 1)
  const aUv = new Float32Array(quads.length * 4)
  const aShow = new Float32Array(quads.length)
  quads.forEach((q, i) => {
    const u = q.clue.count / 8
    const v = 1 - (q.clue.shape + 1) / 3
    aUv.set([u, v, 1 / 8, 1 / 3], i * 4)
  })
  const showAttr = new InstancedBufferAttribute(aShow, 1)
  showAttr.setUsage(35048)
  clueGeo.setAttribute("aUv", new InstancedBufferAttribute(aUv, 4))
  clueGeo.setAttribute("aShow", showAttr)
  const clueMat = new ShaderMaterial({
    vertexShader: CLUE_VERT,
    fragmentShader: CLUE_FRAG,
    uniforms: { uAtlas: { value: atlas.texture } },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const clueMesh = new InstancedMesh(clueGeo, clueMat, quads.length)
  clueMesh.frustumCulled = false
  clueMesh.renderOrder = 2
  const basis = new Matrix4()
  quads.forEach((q, i) => {
    const face = FACES[q.face]
    const x = q.cell % N
    const y = Math.floor(q.cell / N) % N
    const z = Math.floor(q.cell / (N * N))
    const s = 0.64
    basis.makeBasis(new Vector3(...face.r).multiplyScalar(s), new Vector3(...face.u).multiplyScalar(s), new Vector3(...face.n))
    basis.setPosition(x - 3 + face.n[0] * 0.476, y - 3 + face.n[1] * 0.476, z - 3 + face.n[2] * 0.476)
    clueMesh.setMatrixAt(i, basis)
  })
  clueMesh.instanceMatrix.needsUpdate = true
  scene.add(clueMesh)

  /* ── the ring under the block: teal while it is a puzzle, pink once the animal is solved ── */
  const ringUniforms = { uColor: { value: [...TEAL] }, uRadius: { value: 5.6 }, uPower: { value: 0 } }
  const ring = new Mesh(
    new RingGeometry(0.2, 8.4, 160, 1),
    new ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      uniforms: ringUniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  )
  ring.position.z = -3.52
  ring.renderOrder = 1
  scene.add(ring)

  /* ── state ── */
  const present = new Float32Array(CELLS)    // 0..1 how much of the cube is there
  const appearAt = new Float32Array(CELLS)
  const removeAt = new Float32Array(CELLS).fill(Infinity)
  const paintAt = new Float32Array(CELLS).fill(Infinity)
  const subAt = new Float32Array(details.length).fill(Infinity)
  const subScale = new Float32Array(details.length)
  let clock = 0
  let busyUntil = 0
  let phase = "block"        // block → carving → done
  let detailStart = Infinity
  let carvedAt = Infinity

  const setPhase = (next) => {
    if (phase === next) return
    phase = next
    onPhase(next)
  }

  const reset = (animated = true) => {
    appearAt.forEach((_, c) => {
      const x = c % N
      const y = Math.floor(c / N) % N
      const z = Math.floor(c / (N * N))
      appearAt[c] = animated ? clock + (x + y + z) * 0.045 + jitter[c] * 0.25 : clock - 10
    })
    removeAt.fill(Infinity)
    paintAt.fill(Infinity)
    subAt.fill(Infinity)
    detailStart = Infinity
    carvedAt = Infinity
    busyUntil = clock + (animated ? 1.4 : 0.1)
    setPhase("block")
  }

  /* delay: seconds before the first cube goes — a replay lets the block build up first */
  const play = (delay = 0) => {
    if (phase !== "block") return
    const t0 = clock + delay
    for (let c = 0; c < CELLS; c++) {
      const z = Math.floor(c / (N * N))
      if (solid[c]) {
        paintAt[c] = t0 + PAINT_AT + jitter[c] * 0.9
        /* the painted cube splits into its sub-voxels, bottom first */
        removeAt[c] = t0 + DETAIL_AT + z * 0.07 + jitter[c] * 0.12
      } else {
        removeAt[c] = t0 + PEEL_START + (N - 1 - z) * PEEL_STEP + jitter[c] * 0.55
      }
    }
    details.forEach((d, i) => { subAt[i] = removeAt[d.cell] })
    detailStart = t0 + DETAIL_AT - 0.2
    carvedAt = t0 + DETAIL_AT + (N - 1) * 0.07 + 0.12 + DETAIL_DUR
    busyUntil = carvedAt + 0.8
    setPhase("carving")
    wake()
  }

  /* ── camera orbit (drag with inertia, slow drift when left alone) ── */
  const DEFAULT_PITCH = 0.5
  const FRONT_YAW = -Math.PI / 2 + 0.5   // the fox sits facing -y
  const orbit = { yaw: FRONT_YAW + 0.12, pitch: DEFAULT_PITCH, vYaw: 0, vPitch: 0, dist: 26, idle: 99 }
  let dragging = false
  let lastX = 0
  let lastY = 0
  let lastT = 0

  const onDown = (e) => {
    dragging = true
    orbit.idle = 0
    lastX = e.clientX
    lastY = e.clientY
    lastT = performance.now()
    orbit.vYaw = 0
    orbit.vPitch = 0
    canvas.setPointerCapture(e.pointerId)
    canvas.classList.add("is-dragging")
  }
  const onMove = (e) => {
    if (!dragging) return
    const now = performance.now()
    const dt = Math.max(1, now - lastT) / 1000
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    orbit.yaw -= dx * 0.0085
    orbit.pitch = Math.min(1.38, Math.max(0.1, orbit.pitch + dy * 0.006))
    orbit.vYaw = (-dx * 0.0085) / dt
    orbit.vPitch = (dy * 0.006) / dt
    lastX = e.clientX
    lastY = e.clientY
    lastT = now
    orbit.idle = 0
    wake()
  }
  const onUp = (e) => {
    if (!dragging) return
    dragging = false
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    canvas.classList.remove("is-dragging")
    /* a pause before the release means the finger stopped — no throw */
    if (performance.now() - lastT > 90) { orbit.vYaw = 0; orbit.vPitch = 0 }
    orbit.idle = 0
  }
  const onKey = (e) => {
    const step = { ArrowLeft: [0.18, 0], ArrowRight: [-0.18, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key]
    if (!step) return
    e.preventDefault()
    orbit.yaw += step[0]
    orbit.pitch = Math.min(1.38, Math.max(0.1, orbit.pitch + step[1]))
    orbit.idle = 0
    wake()
  }
  canvas.addEventListener("pointerdown", onDown)
  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerup", onUp)
  canvas.addEventListener("pointercancel", onUp)
  canvas.addEventListener("keydown", onKey)

  /* ── size ── */
  let width = 0
  let height = 0
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h || (w === width && h === height)) return
    width = w
    height = h
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    /* fit the ring (radius ~6.2 with its glow) in the narrower direction */
    const half = Math.tan((camera.fov * Math.PI) / 360)
    orbit.dist = Math.max(5.9 / half, 6.4 / (half * Math.min(camera.aspect, 1.6)))
    camera.updateProjectionMatrix()
    wake()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)

  /* ── per-frame updates ── */
  const placeCamera = () => {
    const cp = Math.cos(orbit.pitch)
    camera.position.set(Math.cos(orbit.yaw) * cp * orbit.dist, Math.sin(orbit.yaw) * cp * orbit.dist, Math.sin(orbit.pitch) * orbit.dist - 0.6)
    camera.lookAt(0, 0, -0.6)
    cubeUniforms.uCamera.value.copy(camera.position)
  }

  const updateCubes = () => {
    for (let c = 0; c < CELLS; c++) {
      const x = c % N
      const y = Math.floor(c / N) % N
      const z = Math.floor(c / (N * N))
      const grown = easeOut((clock - appearAt[c]) / 0.5)
      /* a painted cube vanishes at once — its sub-voxels take over exactly where it stood */
      const gone = solid[c] ? (clock >= removeAt[c] ? 1 : 0) : smooth((clock - removeAt[c]) / REMOVE_DUR)
      present[c] = grown * (1 - gone)
      aPaint[c] = smooth((clock - paintAt[c]) / PAINT_DUR)
      dummy.position.set(x - 3, y - 3, z - 3)
      /* a chiselled cube drops a little as it shrinks */
      if (!solid[c]) dummy.position.z -= gone * 0.35
      dummy.scale.setScalar(Math.max(0.0001, 0.94 * present[c]))
      dummy.updateMatrix()
      cubes.setMatrixAt(c, dummy.matrix)
    }
    cubes.instanceMatrix.needsUpdate = true
    paintAttr.needsUpdate = true
  }

  const updateDetails = () => {
    for (let i = 0; i < details.length; i++) {
      const d = details[i]
      /* each of the eight sub-voxels starts as a full copy of its cube and drifts apart into its 0.5 slot,
         turning from the cube's colour into its own */
      const p = clock >= subAt[i] ? easeOut((clock - subAt[i]) / DETAIL_DUR) : -1
      subScale[i] = p
      if (p < 0) {
        dummy.scale.setScalar(0.0001)
      } else {
        const cx = (d.cell % N) - 3
        const cy = (Math.floor(d.cell / N) % N) - 3
        const cz = Math.floor(d.cell / (N * N)) - 3
        dummy.position.set(
          cx + (d.x * 0.5 - 3.25 - cx) * p,
          cy + (d.y * 0.5 - 3.25 - cy) * p,
          cz + (d.z * 0.5 - 3.25 - cz) * p,
        )
        dummy.scale.setScalar(0.94 + (0.5 - 0.94) * p)
        const from = tint[d.cell]
        dTint[i * 4] = from[0] + (d.color[0] - from[0]) * p
        dTint[i * 4 + 1] = from[1] + (d.color[1] - from[1]) * p
        dTint[i * 4 + 2] = from[2] + (d.color[2] - from[2]) * p
      }
      dummy.updateMatrix()
      detailMesh.setMatrixAt(i, dummy.matrix)
    }
    detailMesh.instanceMatrix.needsUpdate = true
    dTintAttr.needsUpdate = true
  }

  const updateClues = (dt) => {
    const k = Math.min(1, dt * 9)
    const hideAll = clock > detailStart
    for (let i = 0; i < quads.length; i++) {
      const q = quads[i]
      const face = FACES[q.face]
      const x = q.cell % N
      const y = Math.floor(q.cell / N) % N
      const z = Math.floor(q.cell / (N * N))
      const nx = x + face.n[0]
      const ny = y + face.n[1]
      const nz = z + face.n[2]
      const open = nx < 0 || ny < 0 || nz < 0 || nx >= N || ny >= N || nz >= N || present[cellIndex(nx, ny, nz)] < 0.2
      const target = !hideAll && present[q.cell] > 0.85 && open ? 1 : 0
      aShow[i] += (target - aShow[i]) * k
      if (Math.abs(target - aShow[i]) < 0.004) aShow[i] = target
    }
    showAttr.needsUpdate = true
  }

  let ringSettled = false
  const updateRing = (dt) => {
    const solved = clock > carvedAt - 0.4 ? 1 : 0
    const goal = solved ? SOLVED : TEAL
    const k = Math.min(1, dt * 2.2)
    for (let i = 0; i < 3; i++) ringUniforms.uColor.value[i] += (goal[i] - ringUniforms.uColor.value[i]) * k
    /* a light colour is additive on a dark ground and glares at full strength */
    const power = clamp01(clock / 0.9) * (solved ? 0.62 : 1)
    ringUniforms.uPower.value += (power - ringUniforms.uPower.value) * Math.min(1, dt * 3)
    ringSettled = Math.abs(power - ringUniforms.uPower.value) < 0.005 && ringUniforms.uColor.value.every((v, i) => Math.abs(goal[i] - v) < 0.005)
  }

  /* ── loop: only while visible; a still frame is redrawn on demand ── */
  let raf = 0
  let running = false
  let visible = true
  let lastFrame = 0

  const frame = (now) => {
    raf = 0
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016)
    lastFrame = now
    clock += dt

    if (!dragging) {
      orbit.idle += dt
      if (Math.abs(orbit.vYaw) > 0.001 || Math.abs(orbit.vPitch) > 0.001) {
        orbit.yaw += orbit.vYaw * dt
        orbit.pitch = Math.min(1.38, Math.max(0.1, orbit.pitch + orbit.vPitch * dt))
        const damp = Math.pow(0.04, dt)
        orbit.vYaw *= damp
        orbit.vPitch *= damp
      } else if (phase === "carving" && orbit.idle > 0.4) {
        /* the finished fox should be met face to face: turn the block towards its front while it is carved */
        const turns = Math.round((orbit.yaw - FRONT_YAW) / (Math.PI * 2))
        orbit.yaw += (FRONT_YAW + turns * Math.PI * 2 - orbit.yaw) * Math.min(1, dt * 1.4)
        orbit.pitch += (DEFAULT_PITCH - orbit.pitch) * Math.min(1, dt * 1.4)
      } else if (orbit.idle > 1.8 && !reducedMotion) {
        orbit.yaw += 0.2 * dt
        orbit.pitch += (DEFAULT_PITCH - orbit.pitch) * Math.min(1, dt * 0.8)
      }
    }

    placeCamera()
    const animating = clock <= busyUntil
    if (animating) {
      updateCubes()
      updateDetails()
      updateClues(dt)
      if (phase === "carving" && clock >= carvedAt) setPhase("done")
    }
    updateRing(dt)
    renderer.render(scene, camera)

    const moving = dragging || Math.abs(orbit.vYaw) > 0.001 || Math.abs(orbit.vPitch) > 0.001 || (orbit.idle > 1.8 && !reducedMotion)
    if (visible && (animating || moving || clock < 1.2 || !ringSettled)) raf = requestAnimationFrame(frame)
    else running = false
  }

  function wake() {
    if (running || !visible) return
    running = true
    lastFrame = performance.now()
    raf = requestAnimationFrame(frame)
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) wake()
  })
  observer.observe(canvas)
  const onVisibility = () => { if (!document.hidden) wake() }
  document.addEventListener("visibilitychange", onVisibility)

  /* ── start ── */
  resize()
  reset(!reducedMotion)
  placeCamera()
  wake()

  return {
    play,
    /* back to the full block — only once the carving has finished */
    replay() {
      if (phase === "carving") return
      if (phase === "done") {
        reset(true)
        play(1.1)
      } else {
        play()
      }
    },
    get phase() { return phase },
    dispose() {
      cancelAnimationFrame(raf)
      running = false
      observer.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("keydown", onKey)
      ;[cubeGeo, detailGeo, clueGeo, ring.geometry].forEach((g) => g.dispose())
      ;[cubeMat, detailMat, clueMat, ring.material].forEach((m) => m.dispose())
      atlas.texture.dispose()
      renderer.dispose()
    },
  }
}
