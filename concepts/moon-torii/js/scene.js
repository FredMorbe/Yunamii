// The hero graphic of "Moon Torii": a dark moon lit from its rim, a gate of light in front of it and
// ripples spreading on the water below (WebGL2). One fragment shader draws all of it from distance
// functions, so every line has an exact width: the moon is a shaded sphere with a procedural surface;
// Mars and Earth are photos laid on a sphere (until a photo is there, a procedural surface stands in),
// the torii is a few lines with a glow, the ripples are ellipses that grow slowly and fade. A click on the water drops one more slow ring there, drawn in the same
// perspective as the others.
// The numbers (proportions of the gate, the rim light of the moon, the spacing of the rings) are
// measured from the design this concept rebuilds; everything is sized in moon radii.
// The light colour scheme is the same scene by day: sky and water as one mirrored gradient from light blue
// at the horizon to white instead of night ink, the gate
// in vermilion lacquer and the rings in ink instead of gold light, high cloud instead of stars, the
// bodies whose shadows are the sky showing through (the atmosphere lies in front of them). Light does not glow on a light page, so the lines
// of the gate and the water are returned with a coverage as well (see `lay`).

const MAX_PIXEL_RATIO = 2;
const MAX_PIXELS = 5e6;          // canvas pixel budget for very large screens
const INTRO_SECONDS = 5;
const STILL_TIME = 0;            // the moment shown when motion is reduced
const TAP_SLOTS = 3;             // rings from clicks that can exist at once (one lives, one gives way, one spare)
const TAP_LIFE = 11;             // seconds a click ring lives
const TAP_FADE = 1.2;            // seconds an older click ring needs to give way when a new one comes
const TAP_WATER = 1.25;          // the water starts this many moon radii below the moon's centre
export const PLANETS = ['moon', 'mars', 'earth', 'saturn'];
export const THEMES = ['dark', 'light'];     // night, day
// The sun is the direction the light comes from. It may follow the mouse, or the last click: it turns
// towards the side of the planet where that is, but takes seconds to get there and never turns fast.
export const SUN_MODES = ['mouse', 'click', 'off'];    // follow the mouse, follow the last click, stay
// Where the mouse is (or the last click was) decides how it stands: the side of the planet gives the
// direction, the distance from the planet gives the height: close, the sun is in front and there is
// little shadow (on the planet's centre none at all); far away it is behind the planet and only a thin
// crescent is lit.
const SUN_SECONDS = 9;           // time constant of the chase
const SUN_SPEED = 0.1;           // the fastest it turns round the planet, radians per second (about 6 degrees)
const SUN_LIFT_SPEED = 0.16;     // the fastest it rises or sinks, radians per second
const SUN_AZIMUTH = 0.98;        // where the light comes from when the sun is not turned: the upper right
const SUN_FRONT = 1.64;          // lifted this much the light comes from the front: no shadow
const SUN_BEHIND = -0.65;        // far from the planet the sun is behind it
const BODY_RADIUS = [1, 1, 1, 0.72];     // the radius of each body in radii of the page's planet (Saturn's globe is smaller)
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
// the height of the sun for a pointer d planet radii from the planet's centre
const liftFor = (d) => SUN_FRONT * (1 - smooth01(d / 1.5)) + SUN_BEHIND * smooth01((d - 1.5) / 2.5);   // the order is the number the shader knows them by
const SWAP_SECONDS = 2;          // how long one body takes to turn into another
// the photos laid on the moon, Mars and Earth (a photo shows one side, so these bodies do not turn);
// the index is the texture unit, and each photo has a sampler and a flag for the shader
const PHOTOS = [
  { name: 'mars', uniform: 'uMars', url: new URL('../assets/mars.webp', import.meta.url) },
  { name: 'earth', uniform: 'uEarth', url: new URL('../assets/earth.webp', import.meta.url) },
  { name: 'moon', uniform: 'uMoonPhoto', url: new URL('../assets/moon.webp', import.meta.url) },
];

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
uniform float uSun;      // how far the light is turned from its usual direction, in radians
uniform float uSunLift;  // how far the light is lifted towards the viewer (+) or sunk behind the body (-), in radians
uniform float uEclipse;  // 0..1: a solar eclipse, the body is dark and its outline glows
uniform float uDay;      // 0 night (dark colour scheme), 1 day (light colour scheme)
uniform vec3 uClock;     // seconds, intro 0..1, narrow layout 0/1
uniform sampler2D uMars; // the photo of Mars, a disc cropped to a square
uniform float uMarsOn;   // 1 once the photo is loaded
uniform sampler2D uEarth;
uniform float uEarthOn;
uniform sampler2D uMoonPhoto;   // the photo of the moon
uniform float uMoonPhotoOn;
uniform vec3 uPlanet;    // the body shown before (0 moon, 1 mars, 2 earth), the one shown after, progress 0..1
uniform vec4 uTap[${TAP_SLOTS}];   // rings from clicks: x, y (moon radii, in the water layer), progress 0..1, strength
out vec4 outColor;

const vec3 BG0  = vec3(0.027, 0.027, 0.055);    // page ink
const vec3 BG1  = vec3(0.043, 0.047, 0.075);    // a little lighter round the scene
const vec3 GOLD = vec3(0.902, 0.745, 0.561);
const vec3 HOT  = vec3(1.000, 0.945, 0.780);

// by day
const vec3 DAY_WHITE = vec3(1.0);                  // the page: plain white, in the sky and in the water
const vec3 CIRRUS = vec3(0.78, 0.86, 0.94);        // the streaks of high cloud
const vec3 LACQUER = vec3(0.788, 0.251, 0.165);    // the gate: vermilion lacquer
const vec3 WASH = vec3(0.498, 0.573, 0.608);       // the rings: a wash of blue-grey ink
const vec3 DAY_RIM = vec3(0.55, 0.62, 0.67);       // the thin ink line round a body
const vec3 DAY_ECLIPSE = vec3(0.78, 0.74, 0.76);   // how much of its light the day keeps in an eclipse (the dark text on it stays legible)

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

// ---- the moon: a sphere lit by one sun from behind and the upper right, so that its lit part is a fat
// crescent and the rim is the brightest. With a single light the line between light and shadow (the
// terminator) is a half ellipse, the same on both sides of the axis of the light, as it is on a real
// moon. The colour comes from the resulting brightness (0..255) along the warm greys of the moon of the design.
vec3 moonRamp(float l) {
  vec3 c = vec3(0.066, 0.064, 0.094);
  c = mix(c, vec3(0.149, 0.141, 0.153), lin(21.0, 37.0, l));
  c = mix(c, vec3(0.314, 0.286, 0.278), lin(37.0, 75.0, l));
  c = mix(c, vec3(0.604, 0.525, 0.467), lin(75.0, 138.0, l));
  c = mix(c, vec3(0.812, 0.718, 0.624), lin(138.0, 188.0, l));
  c = mix(c, vec3(0.933, 0.859, 0.757), lin(188.0, 222.0, l));
  vec3 day = mix(vec3(0.62, 0.69, 0.78), vec3(0.93, 0.95, 0.98), smoothstep(40.0, 215.0, l));      // by day: blue-grey where the light is weak, pale where it is strong (darker than the white sky, so that it stands out)
  return mix(c, day, uDay);
}

// By day the atmosphere lies in front of the bodies: where the sun does not light a body, the sky shows
// through it (the body is transparent there), and only the lit part stands out from the sky. dayVis
// is how opaque a body is where the light on it is k (0 dark .. 1 fully lit); at night all of it is.
// The colour of a body is not darkened towards its terminator by day (that would be a dark soft band in
// the fading edge): only the transparency goes. The rings of Saturn have no such lit side, there the
// shaded colour is brightened by the transparency (unshade), so that the fading part is not grey.
float dayVis(float k) { return mix(1.0, smoothstep(0.0, 0.40, k), uDay); }
vec3 unshade(vec3 c, float vis) { return mix(c, min(c / max(vis, 0.25), vec3(1.0)), uDay); }
vec3 direction(float az, float el) { return vec3(cos(az) * cos(el), sin(az) * cos(el), sin(el)); }

// How high the light stands over a body, towards the viewer. Lifted to the front (+) the lit part grows
// until there is no shadow; sunk behind the body (-) it shrinks to a thin crescent. sunFull is 1 when
// the light comes from the front and the body is lit evenly.
float sunElevation(float usual) { return clamp(usual + uSunLift, -1.5708, 1.5708); }
float sunFull(float usual) { return smoothstep(0.55, 1.4, sunElevation(usual)); }
// The light on a ball when the sun stands straight in front of it: brightest in the middle (1), darker
// towards the rim (0.1 there), so that it is still a ball and not a flat disc. The exponent keeps the
// middle bright for a long way, the fall-off comes towards the edge.
float frontLight(vec3 n) { return 0.10 + 0.90 * pow(n.z, 0.6); }

// the light on the moon at normal n from the sun alone (no front light), in the units of the ramp above
// (about 0..218): the sun is the one of the planets (planetDir), only lower, behind the moon; the light
// rises gently from the terminator (smoothstep: no sharp edge) and is at its full strength well before
// the light stands straight on
float moonDirect(vec3 n) {
  vec3 sunDir = direction(0.98 + uSun, sunElevation(-0.55));      // the light may be turned (see the sun in scene.js)
  return 218.0 * pow(smoothstep(-0.18, 0.62, dot(n, sunDir)), 0.9);
}
// the light that colours the moon: by day the colour does not fall off towards the terminator (see planetLight)
float moonLit(vec3 n) {
  float direct = moonDirect(n);
  direct = mix(direct, 120.0 + 0.45 * direct, uDay);
  return mix(direct, 190.0 * frontLight(n), sunFull(-0.07));      // (a little less than at most from the side: the seas and craters stay to be seen in the middle)
}
// by day the moon is transparent where the sun does not light it; the dark rim of a moon lit from the front
// is only darker, not see-through, so the front light counts as full here
float moonSeen(vec3 n) { return dayVis(mix(moonDirect(n) / 218.0, 1.0, sunFull(-0.07))); }

vec3 moonSurface(vec3 n, float I) {
  float lit = moonLit(n);

  // The surface: the photo of the moon says how much lighter or darker each spot is than the average
  // of the photo (seas, craters, rays); this scales the light. Until the photo is there, noise does it.
  float tex;
  if (uMoonPhotoOn > 0.5) {
    vec3 photo = texture(uMoonPhoto, vec2(0.5 + 0.475 * n.x, 0.5 - 0.475 * n.y)).rgb;
    tex = clamp(dot(photo, vec3(0.299, 0.587, 0.114)) / 0.59 - 1.0, -0.6, 0.7);
  } else {
    vec2 uv = vec2(atan(n.x, n.z), asin(clamp(n.y, -1.0, 1.0)));
    tex = (fbm(uv * 1.7 + 3.1) - 0.5) * 0.3 + (craters(uv * 2.4) * 0.6 + craters(uv * 5.5 + 9.0) * 0.4) * 0.2;
  }
  float grain = hash12(gl_FragCoord.xy) - 0.5;
  lit *= (1.0 + tex) * (1.0 + grain * 0.16) * smoothstep(0.0, 0.5, I);
  return moonRamp(20.0 + lit);
}

// ---- Mars and Earth: spheres with a surface made of noise on the sphere itself (so there are no
// seams), turning slowly (the photos of Mars and Earth do not turn, see marsSurface and earthSurface). They are lit from the upper right and from the front, so that the lit half
// shows its surface; the moon keeps its crescent.
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
  for (int i = 0; i < 5; i++) { s += a * vnoise3(p); p = p * 2.02 + vec3(5.1, 1.7, 9.3); a *= 0.5; }
  return s;
}
vec3 rotY(vec3 n, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
}
vec3 planetDir() { return direction(0.98 + uSun, sunElevation(0.45)); }
float planetLambert(vec3 n) { return pow(clamp((dot(n, planetDir()) + 0.08) / 1.08, 0.0, 1.0), 1.1); }
float planetLight(vec3 n) {
  // By day the shading does not darken the colour towards the terminator (that would be a dark soft band
  // in the fading edge): the transparency (planetSeen) lets the shadow go, the colour stays that of the lit side.
  float lambert = mix(planetLambert(n), 0.65 + 0.35 * planetLambert(n), uDay);
  return mix(lambert, frontLight(n), sunFull(0.45));      // no shadow when the light comes from the front, but a ball: darker towards the rim
}
// how opaque a planet is by day (see moonSeen)
float planetSeen(vec3 n) { return dayVis(mix(planetLambert(n), 1.0, sunFull(0.45))); }

// the colour of Mars made of noise: shown until the photo is there
vec3 marsGenerated(vec3 n, float t) {
  vec3 p = rotY(n, t * 0.0175);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float big = fbm3(p * 1.4 + 11.0);
  float mid = fbm3(p * 4.5 + 3.0);
  float fine = fbm3(p * 14.0);
  vec3 rust = vec3(0.66, 0.31, 0.17), dust = vec3(0.86, 0.58, 0.36), basalt = vec3(0.26, 0.15, 0.12);
  vec3 a = mix(rust, dust, smoothstep(0.35, 0.7, mid));
  a = mix(a, basalt, smoothstep(0.50, 0.57, big) * 0.85);       // the dark plains
  a *= 0.82 + 0.36 * fine;
  float cap = smoothstep(1.28, 1.38, lat + 0.05 * (mid - 0.5)) + 0.6 * smoothstep(1.40, 1.50, -lat);
  return mix(a, vec3(0.93, 0.90, 0.88), clamp(cap, 0.0, 1.0));
}

// Mars from a photo: the disc of the photo is laid on the disc of the planet (the photo shows one
// side, so it does not turn), tamed in colour, and then lit like the other planets: the light and
// the shadow of the page come on top of it.
const float MARS_SATURATION = 0.68;     // 1 would be the photo as it is
const float MARS_GAIN = 1.2;
vec3 marsSurface(vec3 n, float I, float t) {
  float k = planetLight(n);
  vec3 a;
  if (uMarsOn > 0.5) {
    vec3 photo = texture(uMars, vec2(0.5 + 0.475 * n.x, 0.5 - 0.475 * n.y)).rgb;     // 5 % of the rim are left out: no edge shows
    a = mix(vec3(dot(photo, vec3(0.299, 0.587, 0.114))), photo, MARS_SATURATION) * MARS_GAIN;
  } else {
    a = marsGenerated(n, t);
  }
  vec3 c = a * (0.03 + 1.25 * k);
  c *= 1.0 + 0.10 * (hash12(gl_FragCoord.xy) - 0.5);
  return c * smoothstep(0.0, 0.5, I);
}

// the colour of Earth made of noise: shown until the photo is there
vec3 earthGenerated(vec3 n, float t) {
  vec3 L = planetDir();
  float k = planetLight(n);
  vec3 p = rotY(n, t * 0.0175);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float elev = fbm3(p * 1.5 + 3.7) + 0.35 * (fbm3(p * 4.0 + 1.3) - 0.5);       // continents, with a rougher coast
  float land = smoothstep(0.505, 0.525, elev);
  vec3 ocean = mix(vec3(0.015, 0.075, 0.22), vec3(0.05, 0.28, 0.45), smoothstep(0.30, 0.50, elev));
  float dry = smoothstep(0.15, 0.55, abs(lat)) * (1.0 - smoothstep(0.75, 1.10, abs(lat))) * smoothstep(0.35, 0.70, fbm3(p * 2.2 + 8.0));
  vec3 green = mix(vec3(0.12, 0.30, 0.10), vec3(0.28, 0.38, 0.14), fbm3(p * 7.0));
  vec3 desert = mix(vec3(0.55, 0.44, 0.26), vec3(0.70, 0.55, 0.34), fbm3(p * 6.0 + 2.0));
  vec3 ground = mix(green, desert, dry);
  ground = mix(ground, vec3(0.35, 0.28, 0.22), smoothstep(0.58, 0.75, elev) * 0.6);
  float ice = smoothstep(1.12, 1.30, abs(lat) + 0.10 * (fbm3(p * 5.0) - 0.5));
  vec3 surface = mix(mix(ocean, ground, land), vec3(0.92, 0.95, 1.0), ice);

  // clouds drift a little faster than the ground
  vec3 pc = rotY(n, t * 0.0235);
  float cloud = smoothstep(0.50, 0.76, fbm3(pc * 2.6 + vec3(0.0, 4.0, 0.0) + 0.6 * fbm3(pc * 1.4 + 9.0))) * 0.9;

  float glint = pow(max(reflect(-L, n).z, 0.0), 60.0) * (1.0 - land) * (1.0 - cloud) * 0.6;
  vec3 c = surface * (0.035 + 1.25 * k) + vec3(1.0, 0.95, 0.85) * glint * k;
  c = mix(c, vec3(1.0, 1.0, 1.02) * (0.04 + 1.2 * k), cloud);

  // lights of cities on the dark side
  float city = smoothstep(0.63, 0.71, fbm3(p * 34.0 + 5.0)) * smoothstep(0.45, 0.6, fbm3(p * 3.0 + 2.0)) * land * (1.0 - ice) * (1.0 - 0.8 * cloud);
  c += vec3(1.0, 0.72, 0.4) * city * 0.35 * (1.0 - smoothstep(0.02, 0.18, k));

  return c;
}

// Earth from a photo, like Mars: the disc of the photo is laid on the disc of the planet, tamed in
// colour and lit like the other planets, with a light blue air at the rim.
const float EARTH_SATURATION = 0.85;     // 1 would be the photo as it is
const float EARTH_GAIN = 1.0;
vec3 earthSurface(vec3 n, float I, float t) {
  vec3 L = planetDir();
  vec3 c;
  if (uEarthOn > 0.5) {
    vec3 photo = texture(uEarth, vec2(0.5 + 0.475 * n.x, 0.5 - 0.475 * n.y)).rgb;
    c = mix(vec3(dot(photo, vec3(0.299, 0.587, 0.114))), photo, EARTH_SATURATION) * EARTH_GAIN * (0.03 + 1.25 * planetLight(n));
  } else {
    c = earthGenerated(n, t);
  }
  // the air at the rim
  float side = mix(clamp(dot(n.xy, L.xy) / max(length(n.xy), 1e-3) * 0.5 + 0.5, 0.0, 1.0), 1.0, sunFull(0.45));
  c += vec3(0.25, 0.5, 1.0) * pow(1.0 - n.z, 3.0) * 0.32 * (0.25 + 0.75 * side);
  c *= 1.0 + 0.06 * (hash12(gl_FragCoord.xy) - 0.5);
  return c * smoothstep(0.0, 0.5, I);
}

// ---- Saturn: a globe of soft bands and its rings, all made of formulas. The globe is drawn smaller
// than the other bodies (SATURN_SCALE of the page radius) so that the rings have room; sizes in the
// functions below are in globe radii. The rings lie in a plane seen from 24 degrees above it and
// turned a little on the screen; they cast a shadow on the globe, and the globe one on them.
const float SATURN_SCALE = 0.72;
vec3 ringNormal() {
  const float TURN = -0.28;                       // how the rings are turned on the screen
  return vec3(-sin(TURN) * 0.9135, cos(TURN) * 0.9135, 0.4067);
}

// how much of the light the rings stop at distance rho from Saturn: the faint C ring, the dense B
// ring, the dark Cassini division, the A ring with its narrow Encke gap, and a thin F ring
float ringDensity(float rho, float w) {
  float c = smoothstep(1.24 - w, 1.29 + w, rho) * (1.0 - smoothstep(1.52 - w, 1.54 + w, rho)) * 0.2;
  float b = smoothstep(1.52 - w, 1.54 + w, rho) * (1.0 - smoothstep(1.94 - w, 1.96 + w, rho)) * (0.78 + 0.3 * (vnoise(vec2(rho * 70.0, 3.0)) - 0.5));
  float a = smoothstep(2.03 - w, 2.05 + w, rho) * (1.0 - smoothstep(2.27 - w, 2.27 + w, rho)) * 0.62
          * (1.0 - 0.9 * (1.0 - smoothstep(0.0, 0.012 + w, abs(rho - 2.215))));
  float f = (1.0 - smoothstep(0.0, 0.008 + w, abs(rho - 2.32))) * 0.14;
  return clamp(c + b + a + f, 0.0, 1.0);
}
vec3 ringColor(float rho) {
  vec3 c = vec3(0.42, 0.36, 0.30);                                          // C ring
  c = mix(c, vec3(0.90, 0.80, 0.62), smoothstep(1.48, 1.58, rho));          // B ring
  return mix(c, vec3(0.74, 0.66, 0.54), smoothstep(1.97, 2.06, rho));       // A ring
}

vec3 saturnSurface(vec3 n, float I, float t) {
  vec3 Lh = planetDir();
  vec3 N = ringNormal();
  float k = planetLight(n);
  vec3 p = rotY(n, t * 0.012);
  float lat = asin(clamp(p.y, -1.0, 1.0));
  float warp = fbm3(vec3(p.x * 2.2, p.y * 7.0, p.z * 2.2)) - 0.5;                  // the bands wander a little
  float band = 0.5 + 0.26 * sin(lat * 24.0 + warp * 6.0) + 0.2 * sin(lat * 9.0 + 1.3 + warp * 3.0);
  vec3 cream = vec3(0.93, 0.85, 0.66), sand = vec3(0.76, 0.62, 0.43), brown = vec3(0.60, 0.48, 0.34);
  vec3 a = mix(sand, cream, smoothstep(0.25, 0.8, band));
  a = mix(a, brown, (1.0 - smoothstep(0.1, 0.45, band)) * 0.5);
  a = mix(a, vec3(0.58, 0.55, 0.47), smoothstep(1.05, 1.35, abs(lat)) * 0.55);      // greyer towards the poles
  a *= 0.93 + 0.14 * fbm3(p * vec3(6.0, 16.0, 6.0));
  // the shadow of the rings: follow the ray to the light until it meets the plane of the rings
  float tau = -dot(n, N) / dot(Lh, N);
  float shade = 1.0;
  if (tau > 0.0) shade = 1.0 - 0.85 * ringDensity(length(n + tau * Lh), 0.01);
  vec3 c = a * (0.03 + 1.25 * k * shade);
  c *= 1.0 + 0.08 * (hash12(gl_FragCoord.xy) - 0.5);
  return c * smoothstep(0.0, 0.5, I);
}

// the rings at this pixel: colour and opacity. covGlobe is how much the globe covers the pixel; the
// part of the rings behind the globe is hidden by it, the part in front crosses it.
vec4 saturnRings(vec2 q, float S, float covGlobe) {
  vec2 s = vec2(q.x, -q.y) / (S * SATURN_SCALE);
  vec3 N = ringNormal();
  float zr = -(s.x * N.x + s.y * N.y) / N.z;       // where the line of sight meets the plane of the rings
  vec3 P = vec3(s, zr);
  float rho = length(P);
  float dens = ringDensity(rho, max(fwidth(rho), 0.003));
  float zs = sqrt(max(1.0 - dot(s, s), 0.0));
  float hidden = zr < zs ? covGlobe : 0.0;
  vec3 Lh = planetDir();
  float pl = dot(P, Lh);
  float d = sqrt(max(dot(P, P) - pl * pl, 0.0));
  float shade = pl < 0.0 ? smoothstep(0.96, 1.04, d) : 1.0;       // the shadow of the globe
  vec3 c = ringColor(rho) * (0.10 + 1.15 * mix(clamp(dot(N, Lh), 0.0, 1.0), 0.9, sunFull(0.45))) * mix(0.10, 1.0, shade);
  float vis = dayVis(0.5 * mix(0.10, 1.0, shade));       // by day the part in the shadow of the globe is transparent
  return vec4(unshade(c, vis), dens * 0.95 * (1.0 - hidden) * vis);
}

float bodyScale(int kind) { return kind == 3 ? SATURN_SCALE : 1.0; }

vec3 body(int kind, vec3 n, float I, float t) {
  if (kind == 1) return marsSurface(n, I, t);
  if (kind == 2) return earthSurface(n, I, t);
  if (kind == 3) return saturnSurface(n, I, t);
  return moonSurface(n, I);
}

// the colour of one body at this pixel (q in pixels from the centre of the planet, S the page radius)
vec3 bodyColor(int kind, vec2 q, float S, float I, float t) {
  float Sk = S * bodyScale(kind);
  vec3 n = vec3(q.x, -q.y, sqrt(max(Sk * Sk - dot(q, q), 0.0))) / Sk;
  return body(kind, n, I, t);
}

// how opaque the body is at this pixel (by day it is transparent where the sun does not light it)
float bodyVis(int kind, vec2 q, float S) {
  float Sk = S * bodyScale(kind);
  vec3 n = vec3(q.x, -q.y, sqrt(max(Sk * Sk - dot(q, q), 0.0))) / Sk;
  return kind == 0 ? moonSeen(n) : planetSeen(n);
}

// how much of the disc is there at radius r: the moon has a crisp edge, a planet a fuzzy one that
// fades out over 1.4 % of its radius (2 to 3 pixels on a desktop screen)
const float FEATHER = 0.014;
// in an eclipse the dark disc stands against a bright rim, where a crisp edge shows its steps: all
// bodies get a wider fade then
const float ECLIPSE_FEATHER = 0.03;
float edgeCover(float r, float S, int kind) {
  float soft = mix(kind == 0 ? 0.0 : FEATHER * S, ECLIPSE_FEATHER * S, uEclipse);
  return 1.0 - smoothstep(S - 0.8 - soft, S + 0.4, r);
}
float bodyCover(float r, float S, int kind, float I) {
  return edgeCover(r, S, kind) * smoothstep(0.0, 0.3, I);
}

// the glow of the air round Earth (the moon and Mars have none)
vec3 halo(vec2 q, float S, int kind, float I) {
  if (kind != 2) return vec3(0.0);
  float r = length(q);
  if (r < (1.0 - FEATHER) * S - 1.0) return vec3(0.0);       // the glow starts where the disc begins to fade out
  float d = max(r - S, 0.0) / S;
  float side = mix(clamp(dot(vec2(q.x, -q.y) / max(r, 1e-3), planetDir().xy / max(length(planetDir().xy), 1e-3)) * 0.5 + 0.5, 0.0, 1.0), 1.0, sunFull(0.45));
  float w = 0.3 * exp(-d / 0.022) + 0.07 * exp(-d / 0.07);
  return vec3(0.25, 0.5, 1.0) * w * (0.2 + 0.8 * side * side) * smoothstep(0.0, 0.5, I);
}

// The shadow of the planet: a cylinder of the planet's radius that runs from it away from the sun. A
// moon inside it (P in planet radii from the planet's centre, x right, y up, z towards the viewer) gets
// no light at all and is gone; the edge of the cylinder is a little soft.
float planetShadow(vec3 P) {
  vec3 L = planetDir();
  float along = dot(P, L);                       // < 0: on the far side of the planet, away from the sun
  float across = length(P - along * L);
  return (1.0 - smoothstep(0.9, 1.15, across)) * (1.0 - smoothstep(-0.2, 0.2, along));
}

// ---- Phobos and Deimos, the two moons of Mars: small dark lumps on slanted orbits round the planet,
// lit by the same light as Mars. Behind the planet the planet hides them, in front they cross its
// disc; in the shadow of the planet they vanish. Sizes and orbits are made to be seen, not to scale.
// The flag front picks the half of the orbit.
vec4 marsMoon(vec2 v, float S, float t, int i, bool front) {
  float a = i == 0 ? 1.55 : 2.25;                 // orbit radius, in planet radii
  float period = i == 0 ? 70.0 : 160.0;           // seconds
  float ang = (i == 0 ? 0.6 : 3.4) + 6.2831853 * t / period;
  float tilt = i == 0 ? -0.2 : -0.12;
  vec2 e = vec2(a * cos(ang), a * 0.3 * sin(ang));    // the orbit seen from a little above: the lower half is the near one
  vec2 pos = vec2(cos(tilt) * e.x - sin(tilt) * e.y, sin(tilt) * e.x + cos(tilt) * e.y);
  if ((sin(ang) > 0.0) != front) return vec4(0.0);
  float shadow = planetShadow(vec3(pos.x, -pos.y, 0.954 * a * sin(ang)));     // the orbit is seen from 17 degrees above (sin 0.3): the near half has z > 0
  if (shadow >= 1.0) return vec4(0.0);
  float rad = (i == 0 ? 0.05 : 0.036) * S;         // in pixels
  vec2 o = (v - pos) * S / rad;                   // from the moon's centre, in moon radii
  o.x *= 0.82;                                    // a lump, not a ball
  float d = length(o);
  float alpha = 1.0 - smoothstep(1.0 - 0.9 / rad, 1.0 + 0.5 / rad, d);
  if (alpha <= 0.0) return vec4(0.0);
  vec3 n = vec3(o.x, -o.y, sqrt(max(1.0 - d * d, 0.0)));
  float k = pow(clamp((dot(n, planetDir()) + 0.05) / 1.05, 0.0, 1.0), 1.1);
  vec3 albedo = i == 0 ? vec3(0.38, 0.34, 0.30) : vec3(0.55, 0.50, 0.45);
  return vec4(albedo * (0.05 + 1.2 * mix(k, 0.65 + 0.35 * k, uDay)), alpha * dayVis(k) * (1.0 - shadow));      // (by day the colour does not darken towards the terminator, see planetLight)
}

// ---- a solar eclipse: the body keeps its picture and its light but is dimmed to ECLIPSE_LEFT of its
// brightness, and its outline glows, thin and bright at the rim, with a wide
// soft corona further out that is brighter on the side of the sun, and a bright point, the diamond,
// where the sun comes through at the rim
const float ECLIPSE_LEFT = 0.05;      // how much of its brightness a body keeps in an eclipse
vec3 corona(vec2 q, float Sk, float t) {
  float r = length(q);
  if (r < (1.0 - ECLIPSE_FEATHER) * Sk) return vec3(0.0);
  float rim = smoothstep((1.0 - ECLIPSE_FEATHER) * Sk, Sk, r);         // the glow fades in over the edge of the disc
  float d = max(r - Sk, 0.0) / Sk;
  vec2 up = vec2(q.x, -q.y);                                       // y up, like the light
  vec2 sunDir = vec2(cos(0.98 + uSun), sin(0.98 + uSun));
  float facing = dot(up / max(r, 1e-3), sunDir) * 0.5 + 0.5;
  float glow = 0.9 * exp(-d / 0.028) + 0.36 * exp(-d / 0.1) + 0.12 * exp(-d / 0.35);
  vec2 rel = up - sunDir * Sk;                                     // from the diamond
  float dd = length(rel) / Sk;
  float diamond = exp(-dd / 0.035) + 0.3 * exp(-dd / 0.16) + 0.18 * pow(abs(cos(atan(rel.y, rel.x) * 3.0 + t * 0.05)), 18.0) * exp(-dd / 0.45);
  vec3 warm = mix(vec3(1.0, 0.40, 0.10), vec3(1.0, 0.78, 0.46), exp(-d / 0.06));
  return (warm * glow * (0.6 + 0.4 * facing * facing) + vec3(1.0, 0.9, 0.7) * diamond * 0.9) * rim;
}

// ---- the Moon of Earth: one small grey sphere on a slanted orbit round the planet, made like the
// moon of the page (dark seas, craters) and lit by the same light as Earth. It hides behind the
// planet and crosses its disc in front, like the moons of Mars, and it vanishes in the shadow of the planet.
// Size and orbit are made to be seen.
vec4 earthMoon(vec2 v, float S, float t, bool front) {
  float a = 2.1;                                  // orbit radius, in planet radii
  float ang = -0.5 + 6.2831853 * t / 120.0;       // one round in two minutes
  float tilt = -0.15;
  vec2 e = vec2(a * cos(ang), a * 0.3 * sin(ang));
  vec2 pos = vec2(cos(tilt) * e.x - sin(tilt) * e.y, sin(tilt) * e.x + cos(tilt) * e.y);
  if ((sin(ang) > 0.0) != front) return vec4(0.0);
  float shadow = planetShadow(vec3(pos.x, -pos.y, 0.954 * a * sin(ang)));
  if (shadow >= 1.0) return vec4(0.0);
  float rad = 0.15 * S;                           // in pixels
  vec2 o = (v - pos) * S / rad;                   // from the moon's centre, in moon radii
  float d = length(o);
  float alpha = 1.0 - smoothstep(1.0 - 1.6 / rad, 1.0 + 0.4 / rad, d);
  if (alpha <= 0.0) return vec4(0.0);
  vec3 n = vec3(o.x, -o.y, sqrt(max(1.0 - d * d, 0.0)));
  float k = pow(clamp((dot(n, planetDir()) + 0.05) / 1.05, 0.0, 1.0), 1.1);
  vec2 uv = vec2(atan(n.x, n.z), asin(clamp(n.y, -1.0, 1.0)));
  float tex = (fbm(uv * 1.6 + 7.0) - 0.5) * 0.9 + craters(uv * 3.0) * 0.25;
  float kc = mix(k, 0.65 + 0.35 * k, uDay);       // (by day the colour does not darken towards the terminator, see planetLight)
  return vec4(moonRamp(20.0 + 215.0 * kc * clamp(1.0 + tex, 0.3, 1.5)), alpha * dayVis(k) * (1.0 - shadow));
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
  // three fields of stars on jittered grids: each finer, denser and dimmer than the one before
  for (int layer = 0; layer < 3; layer++) {
    float cell = layer == 0 ? 0.55 : layer == 1 ? 0.34 : 0.21;
    float chance = layer == 0 ? 0.5 : layer == 1 ? 0.4 : 0.3;
    float dim = layer == 0 ? 1.0 : layer == 1 ? 0.7 : 0.5;
    vec2 gid = floor(v / cell);
    vec2 id = gid + 57.0 * float(layer);
    float h = hash12(id + 11.0);
    if (h < chance) {
      vec2 sp = (gid + 0.15 + 0.7 * hash22(id + 5.0)) * cell;
      float tw = 0.75 + 0.25 * sin(t * (0.3 + h * 2.0) + h * 50.0);
      float d = length(v - sp) * S;
      add += vec3(0.9, 0.9, 0.95) * (1.0 - smoothstep(r - 0.5, r + 0.6, d)) * (0.2 + 0.5 * hash12(id + 2.0)) * tw * dim;
    }
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

// ---- by day: a few thin streaks of high cloud where the stars were, pale blue on the white of the sky
float cirrus(vec2 v, float S, float I) {
  const vec4 STREAK[3] = vec4[3](vec4(-1.15, -1.0, -0.4, -1.06), vec4(0.25, -1.5, 0.8, -1.52), vec4(1.55, -0.2, 2.0, -0.24));
  float a = 0.0;
  for (int i = 0; i < 3; i++) a = max(a, cover(sdSeg(v * S, STREAK[i].xy * S, STREAK[i].zw * S), max(0.011 * S, 1.5)));
  return a * smoothstep(0.25, 0.85, I) * mix(smoothstep(-2.6, -1.3, v.x), 1.0, uClock.z);     // the text keeps its sky quiet
}

// Puts a line of the scene on the page. At night it is light that is added; by day it is paint
// (lacquer, ink) that covers the page with the coverage that comes with the line.
vec3 lay(vec3 col, vec4 line, vec3 paint) {
  return uDay > 0.5 ? mix(col, paint, clamp(line.a, 0.0, 1.0)) : col + line.rgb;
}

// ---- the gate: two pillars, a tie beam and a curved roof beam, all in gold light (by day lacquered:
// the coverage of its lines is the fourth component)
vec4 torii(vec2 v, float S, float t, float I) {
  vec2 a = vec2(abs(v.x), v.y);
  vec3 acc = vec3(0.0);
  float cov = 0.0;
  float bold = 1.7;             // lacquer on a light page wants more body than light on the dark: the covered lines are this much wider
  float lw = max(0.0175 * S, 1.5);
  const float PX = 0.262;       // pillar offset from the centre
  const float BASE = 1.362;     // where the pillars stand
  const float TOP = 0.585;
  float breath = 1.0 + 0.03 * sin(t * 0.5);

  // pillars grow up from the water while the page opens
  float yTop = mix(BASE, TOP, smoothstep(0.2, 0.75, I));
  float dp = sdSeg(a * S, vec2(PX, yTop) * S, vec2(PX, BASE) * S);
  float br = mix(0.45, 1.0, smoothstep(0.55, 1.15, v.y));
  cov = max(cov, smoothstep(0.08, 0.3, I) * cover(dp, lw * 0.5 * bold));
  acc += smoothstep(0.08, 0.3, I) * br * (GOLD * (0.62 * cover(dp, lw * 0.5) + 0.3 * exp(-dp / (0.028 * S))) + HOT * 0.24 * cover(dp, lw * 0.2));

  // the pillars again in the water, fading and swaying
  float yb = v.y - BASE;
  if (yb > 0.0) {
    float sway = 0.003 * sin(yb * 30.0 - t * 0.5 + a.x * 20.0) * smoothstep(0.0, 0.3, yb);
    float dr = abs(a.x - PX - sway) * S;
    float fade = 0.75 * exp(-yb / 0.26) * (1.0 - smoothstep(0.5, 0.95, yb)) * smoothstep(0.5, 1.0, I);
    cov = max(cov, 0.3 * fade * cover(dr, lw * (0.5 + 0.8 * yb) * bold));
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
  float flush = 1.0 - smoothstep(-0.05 * S, thick * 0.5, (a.x - HS) * S);     // the glow dies away towards the tip and is gone where the beam ends, it does not trail on past it
  float glow = 0.26 * exp(-abs(dy) / (dy > 0.0 ? 0.06 * S : 0.015 * S)) * flush;
  cov = max(cov, shown * cover(dk, thick * 0.5 * bold));
  acc += shown * (GOLD * (0.85 * cover(dk, thick * 0.5) + glow * ends) + HOT * 0.5 * cover(dk, thick * 0.2));

  // the tie beam
  float dn = sdSeg(a * S, vec2(0.0, 0.699) * S, vec2(0.417, 0.699) * S);
  float tie = smoothstep(0.6, 0.95, I) * 0.76;
  cov = max(cov, smoothstep(0.6, 0.95, I) * cover(dn, max(0.0155 * S, 1.3) * 0.5 * bold));
  acc += tie * (GOLD * (0.85 * cover(dn, max(0.0155 * S, 1.3) * 0.5) + 0.14 * exp(-dn / (0.02 * S))) + HOT * 0.2 * cover(dn, 0.4));
  return vec4(acc * breath, cov);
}

// ---- the water: a pool of light round the feet and rings that grow slowly and fade (by day only the
// rings are drawn, as ink: their coverage is the fourth component)
vec4 water(vec2 v, float S, float t, float I) {
  vec2 w = vec2(v.x, v.y - 1.362);
  if (w.y < -0.45 || w.y > 1.0) return vec4(0.0);
  float vis = smoothstep(0.5, 1.0, I);
  vec2 e = vec2(w.x / 0.70, (w.y - 0.03) / 0.07);
  vec3 acc = GOLD * 0.32 * exp(-dot(e, e)) * vis;
  float ink = 0.0;
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
    ink += 0.7 * cover(d, lw * 0.5) * al * side * vis * clear;
    acc += GOLD * (1.35 * cover(d, lw * 0.5) + 0.3 * exp(-d / (0.014 * S))) * al * side * vis * clear;
  }
  return vec4(acc, ink);
}

// ---- rings from clicks: two ripples, the second a little behind the first. The water lies in
// perspective: its horizon is 0.93 moon radii below the moon's centre, so a ring is flatter and
// smaller further up and rounder and larger further down (at the gate it equals the rings above).
vec4 taps(vec2 v, float S) {
  vec3 acc = vec3(0.0);
  float ink = 0.0;
  float lw = max(0.0055 * S, 1.1);
  for (int k = 0; k < ${TAP_SLOTS}; k++) {
    vec4 tp = uTap[k];
    if (tp.w <= 0.0) continue;
    float depth = tp.y - 0.93;
    float s = clamp(depth / 0.432, 0.7, 1.45);
    vec2 u = v - tp.xy;
    for (int j = 0; j < 2; j++) {
      float delay = 0.13 * float(j);
      float p = (tp.z - delay) / (1.0 - delay);
      if (p <= 0.0) continue;
      float a = 1.0 * s * (1.0 - pow(1.0 - p, 2.0));      // spreads fast at first, then ever slower
      if (a < 0.02) continue;
      float b = a * (0.244 * depth + 0.0202 * a);
      float d = abs(ellipseD(vec2(u.x, u.y - 0.0298 * a * a) * S, vec2(a, b) * S));
      if (d > 24.0) continue;
      float al = smoothstep(0.0, 0.08, p) * pow(1.0 - p, 1.5) * (j == 0 ? 0.8 : 0.45);
      float side = 0.55 + 0.55 * min(abs(u.x) / a, 1.0);
      ink += 0.7 * cover(d, lw * 0.5) * al * side * tp.w;
      acc += GOLD * (1.35 * cover(d, lw * 0.5) + 0.3 * exp(-d / (0.014 * S))) * al * side * tp.w;
    }
  }
  return vec4(acc, ink);
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

  vec3 col;
  vec3 dim = mix(vec3(1.0), DAY_ECLIPSE, uEclipse * uDay);      // by day an eclipse dims the light of the page
  if (uDay > 0.5) {
    col = DAY_WHITE * dim;
    col = mix(col, CIRRUS * dim, 0.7 * cirrus(qB / S, S, I));
  } else {
    float lift = 1.0 - smoothstep(0.4, 4.6, length(rel / S - vec2(0.3, 0.9)));
    col = mix(BG0, BG1, lift);
    col += stars(qB / S, S, t, I);
  }

  int from = int(uPlanet.x + 0.5);
  int to = int(uPlanet.y + 0.5);
  float swap = smoothstep(0.0, 1.0, uPlanet.z);
  // Mars has its moons: they come with the planet and go with it
  float moonsIn = smoothstep(0.3, 0.8, I);
  float moons = ((from == 1 ? 1.0 - swap : 0.0) + (to == 1 ? swap : 0.0)) * moonsIn;
  float luna = ((from == 2 ? 1.0 - swap : 0.0) + (to == 2 ? swap : 0.0)) * moonsIn;     // and Earth has its Moon
  float r = length(qM);
  float cov = mix(bodyCover(r, S * bodyScale(from), from, I), bodyCover(r, S * bodyScale(to), to, I), swap);
  // behind the planet the whole disc hides the moons, even where it is transparent by day (the shadow side)
  float hides = mix(1.0, 1.0 - cov, uDay);
  if (luna > 0.0) {
    vec4 m = earthMoon(qM / S, S, t, false);
    col = mix(col, m.rgb, m.a * luna * hides);
  }
  if (moons > 0.0) {
    for (int i = 0; i < 2; i++) {
      vec4 m = marsMoon(qM / S, S, t, i, false);                 // behind the planet: the planet covers them
      col = mix(col, m.rgb, m.a * moons * hides);
    }
  }

  // by day the body is transparent where the sun does not light it (in an eclipse it is a dark disc as a whole)
  float vis = 1.0;
  if (uDay > 0.5) vis = mix(mix(bodyVis(from, qM, S), bodyVis(to, qM, S), swap), 1.0, uEclipse);
  if (cov > 0.0) {
    vec3 c = bodyColor(to, qM, S, I, t);
    if (swap < 1.0) c = mix(bodyColor(from, qM, S, I, t), c, swap);       // while one body turns into another, both are drawn
    col = mix(col, c * mix(1.0, ECLIPSE_LEFT, uEclipse), cov * vis);
  }
  if (uDay > 0.5) {         // a thin ink line round the lit edge of the body, so that its pale edge stands out from the sky
    float edge = mix(edgeCover(r, S * bodyScale(from), from), edgeCover(r, S * bodyScale(to), to), swap);
    col = mix(col, DAY_RIM, 4.0 * edge * (1.0 - edge) * 0.6 * vis * (1.0 - uEclipse) * smoothstep(0.0, 0.3, I));
  }
  col += mix(halo(qM, S, from, I), halo(qM, S, to, I), swap) * (1.0 - uEclipse) * (1.0 - uDay);       // the corona takes the place of the glow of Earth's air (by day there is none)
  if (uEclipse > 0.0) col += mix(corona(qM, S * bodyScale(from), t), corona(qM, S * bodyScale(to), t), swap) * uEclipse;
  float saturn = ((from == 3 ? 1.0 - swap : 0.0) + (to == 3 ? swap : 0.0)) * moonsIn;
  if (saturn > 0.0) {
    vec4 ring = saturnRings(qM, S, bodyCover(r, S * SATURN_SCALE, 3, 1.0));
    col = mix(col, ring.rgb * mix(1.0, ECLIPSE_LEFT, uEclipse), ring.a * saturn);
  }
  if (luna > 0.0) {
    vec4 m = earthMoon(qM / S, S, t, true);
    col = mix(col, m.rgb, m.a * luna);
  }
  if (moons > 0.0) {
    for (int i = 0; i < 2; i++) {
      vec4 m = marsMoon(qM / S, S, t, i, true);                  // in front of it
      col = mix(col, m.rgb, m.a * moons);
    }
  }

  col = lay(col, torii(qT / S, S, t, I), LACQUER * dim);
  col = lay(col, water(qT / S, S, t, I), WASH * dim);
  col = lay(col, taps(qT / S, S), WASH * dim);

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

function checkSunMode(mode) {
  if (!SUN_MODES.includes(mode)) throw new Error(`Unknown sun mode "${mode}", expected one of ${SUN_MODES.join(', ')}.`);
  return mode;
}

function checkTheme(theme) {
  if (!THEMES.includes(theme)) throw new Error(`Unknown theme "${theme}", expected one of ${THEMES.join(', ')}.`);
  return theme;
}

function bodyIndex(id) {
  const index = PLANETS.indexOf(id);
  if (index < 0) throw new Error(`Unknown planet "${id}", expected one of ${PLANETS.join(', ')}.`);
  return index;
}

// Returns false when the device has no WebGL2; shader or link errors throw.
// `solid` selects the elements of the page that take a click themselves (links, text): a click on
// them does not drop a ring.
export function createScene(canvas, { reduceMotion, solid = 'a, button', planet = 'moon', sunMode = SUN_MODES[0], theme = THEMES[0] }) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) return false;
  let scheme = checkTheme(theme);       // 'dark' (night) or 'light' (day)

  const host = canvas.parentElement;
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  // turn, lift: how far the sun is turned and lifted from its usual place; mode: what it follows;
  // mouse, click: where the mouse was and where it last clicked (null before); tilt: 1 while the sun
  // follows nothing, then the pointer turns the light a little, quickly (this fades in and out)
  const sun = { turn: 0, lift: 0, mode: checkSunMode(sunMode), tilt: sunMode === 'off' ? 1 : 0, mouse: null, click: null };
  const eclipse = { on: false, level: 0 };     // a click on the planet darkens it, the next click ends that; the sun stands still meanwhile
  let res = null;                // GL resources, rebuilt after a context loss
  let geo = null;
  let ratio = 1;
  let time = reduceMotion ? STILL_TIME : 0;
  let intro = reduceMotion ? 1 : 0;
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  // the body in the sky: `from` fades into `to` as `mix` goes from 0 to 1; a choice made meanwhile waits
  const sky = { from: bodyIndex(planet), to: bodyIndex(planet), mix: 1, queued: -1 };
  const taps = Array.from({ length: TAP_SLOTS }, () => ({ x: 0, y: 0, born: -Infinity, fade: -1 }));
  const tapData = new Float32Array(TAP_SLOTS * 4);
  const photos = PHOTOS.map(() => null);     // the photos, once they are loaded

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
    const names = ['uRes', 'uMoon', 'uLook', 'uSun', 'uSunLift', 'uEclipse', 'uDay', 'uClock', 'uTap', 'uPlanet', ...PHOTOS.flatMap(({ uniform }) => [uniform, `${uniform}On`])];
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    res = { p, u, vao: gl.createVertexArray(), textures: PHOTOS.map(() => gl.createTexture()) };
    gl.bindVertexArray(res.vao);
    PHOTOS.forEach((_, i) => upload(i));
    resize();
  }

  // photo i goes to texture unit i (a black pixel stands in until it is loaded)
  function upload(i) {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, res.textures[i]);
    if (photos[i]) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photos[i]);
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

  // A failed load is an error in the console (nothing catches it); the planet stays the generated one.
  async function load(i) {
    const { name, url } = PHOTOS[i];
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The photo of ${name} did not load (${response.status}): ${url}`);
    photos[i] = await createImageBitmap(await response.blob());
    if (!res) return;                  // the context is lost: build() uploads it when it comes back
    upload(i);
    if (!running) draw();
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
    gl.uniform1f(res.u.uSun, sun.turn - sun.tilt * 0.12 * look.x);
    gl.uniform1f(res.u.uSunLift, sun.lift);
    gl.uniform1f(res.u.uEclipse, smooth01(eclipse.level));
    gl.uniform1f(res.u.uDay, scheme === 'light' ? 1 : 0);
    gl.uniform3f(res.u.uClock, time, intro, geo.narrow ? 1 : 0);
    taps.forEach((t, i) => {
      const alive = tapAlive(t);
      const giving = t.fade < 0 ? 0 : Math.min((time - t.fade) / TAP_FADE, 1);
      tapData.set(alive ? [t.x, t.y, (time - t.born) / TAP_LIFE, 0.5 + 0.5 * Math.cos(Math.PI * giving)] : [0, 0, 0, 0], i * 4);
    });
    gl.uniform4fv(res.u.uTap, tapData);
    gl.uniform3f(res.u.uPlanet, sky.from, sky.to, sky.mix);
    PHOTOS.forEach(({ uniform }, i) => {
      gl.uniform1i(res.u[uniform], i);
      gl.uniform1f(res.u[`${uniform}On`], photos[i] ? 1 : 0);
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // a click ring lives for TAP_LIFE seconds, or until the one that replaces it has faded it out
  const tapAlive = (t) => time - t.born < TAP_LIFE && (t.fade < 0 || time - t.fade < TAP_FADE);

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt;
    intro = Math.min(1, intro + dt / INTRO_SECONDS);
    if (sky.mix < 1) {
      sky.mix = Math.min(1, sky.mix + dt / SWAP_SECONDS);
      if (sky.mix === 1 && sky.queued >= 0) swap(sky.queued);
    }
    // the pointer shifts the layers a little; it follows slowly
    const k = 1 - Math.exp(-dt / 1.3);
    look.x += (look.tx - look.x) * k;
    look.y += (look.ty - look.y) * k;
    // the sun chases the side of the planet the mouse is on (or the last click was), and the height that
    // goes with its distance; close to the planet's centre there is no side
    let turnTo = 0;
    let liftTo = 0;
    const aimAt = sun.mode === 'mouse' ? sun.mouse : sun.mode === 'click' ? sun.click : null;
    if (aimAt && geo) {
      const dx = aimAt.x - geo.x;
      const dy = geo.y - aimAt.y;
      const d = Math.hypot(dx, dy) / geo.R;
      liftTo = liftFor(d);
      turnTo = d < 0.25 ? sun.turn : wrap(Math.atan2(dy, dx) - SUN_AZIMUTH);
    }
    if (!eclipse.on) {       // during an eclipse the sun does not follow anything
      const chase = 1 - Math.exp(-dt / SUN_SECONDS);
      const turnReach = SUN_SPEED * dt;
      const liftReach = SUN_LIFT_SPEED * dt;
      sun.turn = wrap(sun.turn + clamp(wrap(turnTo - sun.turn) * chase, -turnReach, turnReach));
      sun.lift += clamp((liftTo - sun.lift) * chase, -liftReach, liftReach);
    }
    sun.tilt += ((sun.mode === 'off' ? 1 : 0) - sun.tilt) * (1 - Math.exp(-dt));
    // an eclipse comes in slowly and goes out slower still
    eclipse.level = clamp(eclipse.level + (eclipse.on ? dt / 3.5 : -dt / 5), 0, 1);
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
    sun.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    look.tx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    look.ty = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
  }

  // A click on the water drops a ring. At most two exist at a time: a click while one is alive lets
  // that one fade out softly (never cut off); a click while two are alive is ignored.
  function drop(e) {
    if (!geo || intro < 0.6 || e.target.closest(solid)) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - geo.x) / geo.R;
    const y = (e.clientY - rect.top - geo.y) / geo.R;
    // a click on the planet is an eclipse, and the next click on it ends the eclipse; neither moves the sun
    if (Math.hypot(x, y) <= BODY_RADIUS[sky.to]) {
      eclipse.on = !eclipse.on;
      return;
    }
    // any other click is where the sun goes when it follows the last click (but not during an eclipse)
    if (!eclipse.on) sun.click = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (y < TAP_WATER) return;
    const alive = taps.filter(tapAlive);
    if (alive.length >= 2) return;
    for (const t of alive) if (t.fade < 0) t.fade = time;
    // the water layer drifts a little with the pointer (see the shader): the ring lands under it
    Object.assign(taps.find((t) => !tapAlive(t)), { x: x + look.x * 0.012, y: y + look.y * 0.0084, born: time, fade: -1 });
  }

  // Starts the change to body `index` (the one before it ends is `from` of the next change).
  function swap(index) {
    sky.queued = -1;
    if (index === sky.to) return;
    Object.assign(sky, { from: sky.to, to: index, mix: 0 });
  }

  build();
  PHOTOS.forEach((_, i) => load(i));
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); res = null; update(); });
  canvas.addEventListener('webglcontextrestored', () => { build(); update(); });
  if (!reduceMotion) {
    host.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') aim(e); }, { passive: true });
    host.addEventListener('pointerleave', () => { look.tx = 0; look.ty = 0; }, { passive: true });
    // a touch has no hover: for the sun it counts as the mouse where the finger last was
    host.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const rect = canvas.getBoundingClientRect();
      sun.mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }, { passive: true });
    host.addEventListener('click', drop);
  }
  update();
  return {
    // The colour scheme: 'dark' (night) or 'light' (day). It changes at once and is drawn at once, so that
    // the circle that opens the new scheme (a view transition, see theme.js) finds it on the canvas.
    setTheme(name) {
      scheme = checkTheme(name);
      draw();
    },
    // Where the centre of the planet is, in viewport pixels (null until the scene has a size).
    bodyPosition() {
      if (!geo) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + geo.x, y: rect.top + geo.y };
    },
    // What the sun follows: 'mouse', 'click' (the last click) or 'off'; it never jumps, it turns slowly.
    setSunMode(mode) { sun.mode = checkSunMode(mode); },
    // Turns the body in the sky into `id` ('moon', 'mars' or 'earth'): at once when nothing moves
    // (reduced motion, hidden page), otherwise as a slow cross-fade; a change asked for while one
    // is under way follows it.
    setPlanet(id) {
      const index = bodyIndex(id);
      if (reduceMotion || !running) {
        Object.assign(sky, { from: index, to: index, mix: 1, queued: -1 });
        draw();
      } else if (sky.mix < 1) {
        sky.queued = index === sky.to ? -1 : index;
      } else {
        swap(index);
      }
    },
  };
}
