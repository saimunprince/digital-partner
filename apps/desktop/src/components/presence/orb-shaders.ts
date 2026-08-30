/**
 * GLSL for the presence orb: a particle sphere driven by wave displacement,
 * voice amplitude, a birth animation and a curl-noise dissolve.
 *
 * Ported verbatim from the Zoey OS companion orb
 * (apps/web/src/components/world/orbShaders.ts) so the two products' orbs are
 * the same object rather than two interpretations of one. Keep them in sync:
 * changes belong upstream first.
 *
 * The whole look comes from the point sprite fragment shader — a soft core plus
 * two halo falloffs, additively blended — so there is no lighting pass and no
 * geometry beyond a single points cloud.
 */

export const ORB_VERTEX = /* glsl */ `
uniform float u_time;
uniform float u_radius;
uniform float u_noise_amp;
uniform float u_birth_progress;
uniform vec3  u_birth_origin;
uniform float u_voice_amp;
uniform float u_dissolve;
uniform vec3  u_parent_pos;
uniform float u_brightness;
uniform vec3  u_dimple_dirs[8];
uniform int   u_dimple_count;
uniform float u_birth_sweep;
uniform float u_focus_scale;
/**
 * Where the voice is landing.
 *
 * The whole orb brightening together reads as a dimmer being turned up. A voice
 * arrives from somewhere and has a shape, so part of the lift is pointed: this
 * direction drifts slowly, and the surface facing it catches more of the light.
 * Light only — the geometry never learns about it.
 */
uniform vec3 u_voice_dir;
/**
 * The pointed light's own level.
 *
 * Separate from the amplitude because it lets go faster. The body of the glow
 * stays calm and the pointed part follows the syllables, which is the
 * difference between an orb that shows sound happening and one that shows
 * words being said.
 */
uniform float u_voice_focus;
/**
 * How far apart the cloud is: 0 whole, 1 scattered across the view.
 *
 * The offset is a function of each particle's own resting place and nothing
 * that moves, so winding this back to zero returns every particle exactly
 * where it left. The orb reforms; it does not re-seed.
 */
uniform float u_scatter;

attribute vec3 a_basePosition;
attribute float a_particleId;

varying float v_depth;
varying float v_alpha;
varying float v_latitude;
varying float v_dimple_glow;
varying float v_voice;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  float n1 = snoise(p + dy) - snoise(p - dy);
  float n2 = snoise(p + dz) - snoise(p - dz);
  float n3 = snoise(p + dx) - snoise(p - dx);
  float n4 = snoise(p + dz) - snoise(p - dz);
  float n5 = snoise(p + dx) - snoise(p - dx);
  float n6 = snoise(p + dy) - snoise(p - dy);
  return normalize(vec3(n1 - n2, n3 - n4, n5 - n6));
}

void main() {
  vec3 norm = normalize(a_basePosition);
  vec3 spherePos = norm * u_radius;

  float waveDisp = sin(a_basePosition.x * 3.0 + u_time * 0.8) *
                   sin(a_basePosition.y * 2.0 + u_time * 0.6) *
                   u_noise_amp;
  spherePos += norm * waveDisp;

  float sweepGlow = 0.0;
  if (u_birth_sweep > 0.0) {
    float burstIntensity = u_birth_sweep < 0.3
      ? smoothstep(0.0, 0.3, u_birth_sweep)
      : 1.0 - smoothstep(0.3, 1.0, u_birth_sweep);

    for (int i = 0; i < 8; i++) {
      if (i >= u_dimple_count) break;
      vec3 dimpleDir = normalize(u_dimple_dirs[i]);
      float alignment = dot(norm, dimpleDir);
      float nearExit = smoothstep(0.9, 0.97, alignment);
      sweepGlow = max(sweepGlow, nearExit * burstIntensity * 1.2);
    }
  }
  v_dimple_glow = sweepGlow;

  spherePos *= (1.0 + u_voice_amp * 0.15);

  // Broad and soft: a tight spot would read as a torch being shone at the orb
  // rather than as sound reaching it.
  v_voice = smoothstep(-0.45, 1.0, dot(norm, normalize(u_voice_dir))) * u_voice_focus;

  vec3 birthStart = u_parent_pos + u_birth_origin;
  vec3 emerged = mix(birthStart, spherePos, smoothstep(0.0, 1.0, u_birth_progress));

  vec3 dissolveOffset = curlNoise(a_basePosition * 2.0 + u_time * 0.5) * u_dissolve * 3.0;
  vec3 finalPos = emerged + dissolveOffset * u_dissolve;

  if (u_scatter > 0.0) {
    // Outward along the particle's own normal, bent by the curl field. A curl
    // field alone has a net direction and drifts the whole cloud one way, which
    // opens the orb lopsided instead of filling the view.
    //
    // curlNoise returns a unit vector, so the per-particle reach matters too:
    // without it every particle travels the same distance and the result is a
    // larger shell rather than a cloud.
    float reach = 0.25 + fract(sin(a_particleId * 91.7) * 43758.5453) * 2.1;
    vec3 open = normalize(norm + curlNoise(a_basePosition * 1.5 + 4.0) * 0.55);
    finalPos += open * u_scatter * reach * 4.2;
  }

  vec4 mvPos = modelViewMatrix * vec4(finalPos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float rawDepth = dot(norm, vec3(0.0, 0.0, 1.0));
  v_depth = rawDepth * 0.5 + 0.5;

  float ptSize = mix(1.1, 2.5, v_depth);
  float birthSizeBoost = 1.0 + (1.0 - smoothstep(0.0, 0.7, u_birth_progress)) * 0.29;
  ptSize = mix(ptSize * birthSizeBoost, 0.05, u_dissolve) * (1.0 + u_voice_amp * 0.2);
  // Thinning as it opens: particles nearing the camera would otherwise swell
  // into lamps and white the screen out, which erases the view rather than
  // filling it.
  ptSize *= 1.0 - u_scatter * 0.4;
  gl_PointSize = ptSize * (8.0 / -mvPos.z) * u_focus_scale;

  v_alpha = (1.0 - u_dissolve) * smoothstep(0.0, 0.3, u_birth_progress) * (1.0 - u_scatter * 0.25);
  v_latitude = a_basePosition.y;
}
`

export const ORB_FRAGMENT = /* glsl */ `
uniform vec3  u_color_equator;
uniform vec3  u_color_pole;
uniform float u_brightness;
uniform float u_birth_progress;
uniform vec2  u_resolution;

varying float v_depth;
varying float v_alpha;
varying float v_latitude;
varying float v_dimple_glow;
varying float v_voice;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  if (r > 0.5) discard;

  float core = smoothstep(0.35, 0.0, r);
  float halo = smoothstep(0.5, 0.1, r) * 0.4;
  float glow = smoothstep(0.5, 0.0, r) * 0.25;
  float intensity = core + halo + glow;

  vec3 color = mix(u_color_equator, u_color_pole, abs(v_latitude));

  float birthGlow = 1.0 - smoothstep(0.0, 0.7, u_birth_progress);
  color = mix(color, vec3(1.0, 0.95, 0.9), birthGlow * 0.24);
  float birthBrightBoost = 1.0 + birthGlow * 0.3;

  float depthAlpha = 0.18 + 0.67 * v_depth;

  float glowMult = v_depth > 0.45 ? 1.0 + (v_depth - 0.45) * 1.2 : 0.7;

  float sweepBright = 1.0 + v_dimple_glow * 0.7 + v_voice * 4.0;
  color = mix(color, vec3(1.0, 0.95, 0.9), v_dimple_glow * 0.25 + v_voice * 0.5);

  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  float lumCompensation = mix(1.0, 0.7, lum);

  vec3 emitted = color * u_brightness * birthBrightBoost * glowMult * sweepBright * intensity * lumCompensation;

  // Screen-space vignette.
  //
  // The canvas is a rectangle and the orb's light spreads across it, so
  // whatever the layer is cleared to, the lit area ends on a straight edge and
  // reads as a box on the page. Falling the light off with distance from the
  // centre guarantees the border is exactly black — which, under the screen
  // blend this canvas uses, is the identity and therefore invisible. Doing it
  // here rather than with a CSS clip matters: a clip on an ancestor would
  // isolate the blend and bring the box straight back.
  vec2 fromCentre = (gl_FragCoord.xy - u_resolution * 0.5) / (min(u_resolution.x, u_resolution.y) * 0.5);
  // Ascending edges: smoothstep is undefined when edge0 >= edge1, and writing
  // it the other way round zeroed the whole frame on this driver.
  emitted *= 1.0 - smoothstep(0.9, 1.0, length(fromCentre));

  // Coverage follows the light, not the sprite.
  //
  // Upstream's alpha is intensity * v_alpha * depthAlpha, while the colour is
  // additionally multiplied by intensity — so toward a sprite's edge the
  // colour reaches zero well before the alpha does. Over an opaque scene that
  // is invisible; over app UI the buffer is premultiplied, so those fragments
  // composite as (0,0,0,a) and lay a black haze across the whole canvas. Taking
  // coverage from the emitted luminance means no light is no coverage, and the
  // surround stays genuinely empty.
  float coverage = max(emitted.r, max(emitted.g, emitted.b));

  gl_FragColor = vec4(emitted, min(1.0, coverage * v_alpha * depthAlpha));
}
`

/**
 * Fibonacci sphere: evenly distributed points with no clustering at the poles,
 * which a naive lat/long grid would produce.
 */
export function fibonacciSphere(count: number): Float32Array {
  const pts = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = golden * i
    pts[i * 3] = Math.cos(a) * r
    pts[i * 3 + 1] = y
    pts[i * 3 + 2] = Math.sin(a) * r
  }

  return pts
}

export function particleIds(count: number): Float32Array {
  const ids = new Float32Array(count)

  for (let i = 0; i < count; i++) {ids[i] = i / count}

  return ids
}
