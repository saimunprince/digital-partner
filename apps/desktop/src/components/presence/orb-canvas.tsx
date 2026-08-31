import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { PresenceState } from '@/store/presence'

import { fibonacciSphere, ORB_FRAGMENT, ORB_VERTEX, particleIds } from './orb-shaders'

/** Upstream's orchestrator tier — the same budget and radius as the Zoey OS orb. */
const PARTICLES = 2500
const RADIUS = 1.6
const NOISE_AMP = 0.24

/** Bright, because the canvas is blended with `screen` over a near-black page:
 *  a dim orb simply does not read there. */
const BRIGHTNESS = 2.2

/** Upstream frames its focused orb from about this far out; we sit closer so
 *  the sphere fills more of its stage than upstream's inset framing did. */
const UPSTREAM_CAMERA_Z = 5.2
/** The GL surface overshoots the orb's layout box (see .presence-orb__stage)
 *  and the camera pulls back by the same factor, so the sphere keeps its size
 *  on screen while gaining room around it. The margin is not cosmetic: the
 *  fragment vignette fades everything near the canvas edge, so a tight surface
 *  shears the crests off exactly when the voice pushes them furthest out. */
const STAGE_OVERSHOOT = 1.55
const CAMERA_Z = UPSTREAM_CAMERA_Z * STAGE_OVERSHOOT

/** Fallbacks only — the live values come from the theme (see --orb-* in
 *  styles.css) so the orb belongs to the interface around it. */
const PALETTE = { brightness: 1, cool: '#7fd9ff', equator: '#6e6af0', pole: '#9fd4ff', warm: '#e9a08b' }

/**
 * How lively each presence state is.
 *
 * Upstream drives this from a live voice envelope; here the same two signals —
 * a "thinking" blend and a voice amplitude — come from the assistant's state so
 * the orb behaves the same way for the same reasons.
 */
const THINK: Record<PresenceState, number> = {
  error: 0,
  executing: 0.85,
  idle: 0,
  listening: 0.2,
  speaking: 0.35,
  thinking: 1,
  transcribing: 0.5
}

/** A theme colour, or the fallback when the variable is unset or not a literal.
 *  `THREE.Color` does not throw on a value it cannot parse — it warns and stays
 *  white — so only literal colours are accepted. */
function readColor(cssVar: string, fallback: string): THREE.Color {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  const literal = /^(#|rgb|hsl)/i.test(raw) ? raw : ''

  try {
    return new THREE.Color(literal || fallback)
  } catch {
    return new THREE.Color(fallback)
  }
}

interface OrbCanvasProps {
  /** Live mic level [0..1]; read while listening or speaking. */
  level: number
  /** Reports whether a GL context was obtained, so the caller can drop the
   *  static fallback mark instead of drawing it behind the particles. */
  onReady?: (ready: boolean) => void
  state: PresenceState
}

/**
 * The presence orb: a particle sphere displaced by noise and lifted by voice.
 *
 * Written against three.js directly rather than react-three-fiber, whose JSX
 * augmentation conflicts with React 19's JSX namespace across the rest of the
 * app. The particle model, sprite falloffs and voice response are upstream's
 * (Zoey OS); the deformation and the screen-space vignette are ours.
 *
 * How it meets the page matters as much as what it draws. The canvas is
 * BLENDED (`mix-blend-mode: screen`), not composited: a WebGL layer lands
 * opaque on some GPU paths, and every attempt to make it match the page —
 * transparent clear, clearing to the theme colour, clipping it round — left a
 * visible disc or box. Under `screen`, black is the identity, so the vignette
 * in the fragment shader (which needs `u_resolution`, kept in step by `resize`)
 * guarantees the border contributes nothing at all.
 *
 * The component owns its GL context for its lifetime; props are mirrored into a
 * ref and read by the frame loop, so prop churn never rebuilds the scene.
 */
export function OrbCanvas({ level, onReady, state }: OrbCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const props = useRef({ level, onReady, state })

  props.current = { level, onReady, state }

  useEffect(() => {
    const mount = host.current

    if (!mount) {
      return undefined
    }

    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      // No GL context (software rendering, exhausted contexts). The SVG mark
      // behind this canvas keeps the surface intact.
      props.current.onReady?.(false)

      return undefined
    }

    renderer.setClearAlpha(0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.append(renderer.domElement)
    Object.assign(renderer.domElement.style, { display: 'block', height: '100%', width: '100%' })

    const onContextLost = (event: Event) => event.preventDefault()

    renderer.domElement.addEventListener('webglcontextlost', onContextLost)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200)

    camera.position.set(0, 0, CAMERA_Z)

    const positions = fibonacciSphere(PARTICLES)
    const ids = particleIds(PARTICLES)
    const geometry = new THREE.BufferGeometry()

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('a_basePosition', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('a_particleId', new THREE.BufferAttribute(ids, 1))

    const uniforms = {
      u_birth_origin: { value: new THREE.Vector3() },
      u_birth_progress: { value: 0 },
      u_birth_sweep: { value: 0 },
      u_brightness: { value: BRIGHTNESS * PALETTE.brightness },
      u_color_equator: { value: new THREE.Color() },
      u_color_pole: { value: new THREE.Color() },
      u_dimple_count: { value: 0 },
      u_dimple_dirs: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
      u_dissolve: { value: 0 },
      u_focus_scale: { value: 1.15 * STAGE_OVERSHOOT },
      u_noise_amp: { value: NOISE_AMP },
      u_parent_pos: { value: new THREE.Vector3() },
      u_radius: { value: RADIUS },
      // Replaced by the first resize below; the vignette reads it every frame,
      // and a stale value shifts the falloff off-centre — which is exactly how
      // a lopsided rectangle appears around the orb.
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_scatter: { value: 0 },
      u_time: { value: 0 },
      u_voice_amp: { value: 0 },
      u_voice_dir: { value: new THREE.Vector3(0, 0, 1) },
      u_voice_focus: { value: 0 }
    }

    const material = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fragmentShader: ORB_FRAGMENT,
      transparent: true,
      uniforms,
      vertexShader: ORB_VERTEX
    })

    const cloud = new THREE.Points(geometry, material)

    cloud.frustumCulled = false

    const group = new THREE.Group()

    group.add(cloud)
    scene.add(group)

    /** The palette the frame loop blends from. Re-read whenever the theme
     *  changes, or the orb keeps the colours of the mode it was born in. */
    const tones = {
      cool: new THREE.Color(),
      equator: new THREE.Color(),
      pole: new THREE.Color(),
      warm: new THREE.Color()
    }

    const readTones = () => {
      tones.equator.copy(readColor('--orb-equator', PALETTE.equator))
      tones.pole.copy(readColor('--orb-pole', PALETTE.pole))
      tones.warm.copy(readColor('--horizon-b', PALETTE.warm))
      tones.cool.copy(readColor('--orb-cool', PALETTE.cool))
    }

    readTones()

    // Coalesced to one read per frame. The theme's seeds land as inline custom
    // properties on <html> — but so does the workspace geometry, which rewrites
    // them on every frame of a sash drag. Reading four computed values per
    // mutation would force a style recalc on each of those frames.
    let tonesFrame = 0

    const themeObserver = new MutationObserver(() => {
      if (tonesFrame) {
        return
      }

      tonesFrame = requestAnimationFrame(() => {
        tonesFrame = 0
        readTones()
      })
    })

    themeObserver.observe(document.documentElement, {
      // The theme engine toggles `dark`, stamps both data attributes, and
      // writes its seeds inline (see themes/context.tsx applyTheme).
      attributeFilter: ['class', 'data-hermes-mode', 'data-hermes-theme', 'style'],
      attributes: true
    })

    const resize = () => {
      const { height, width } = mount.getBoundingClientRect()

      if (width === 0 || height === 0) {
        return
      }

      renderer.setSize(width, height, false)

      const ratio = renderer.getPixelRatio()

      // gl_FragCoord is in device pixels, so the vignette's frame of reference
      // has to be too.
      uniforms.u_resolution.value.set(width * ratio, height * ratio)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    resize()

    const observer = new ResizeObserver(resize)

    observer.observe(mount)

    const clock = new THREE.Clock()
    let frame = 0
    let last = performance.now()
    // Upstream's smoothing: fast attack, slow release on the body of the glow;
    // the pointed light lets go faster so syllables stay separate.
    let ampSmooth = 0
    let focusSmooth = 0
    let thinkBlend = 0
    let spinBoost = 0
    let bearing = 0
    let speakBlend = 0
    let listenBlend = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)

      const now = performance.now()
      const delta = Math.min((now - last) / 1000, 0.1)

      last = now

      const elapsed = clock.getElapsedTime()
      const { level, state } = props.current
      const live = state === 'listening' || state === 'speaking'
      const targetAmp = live ? Math.min(Math.max(level, 0), 1) : 0

      ampSmooth = targetAmp > ampSmooth ? ampSmooth * 0.15 + targetAmp * 0.85 : ampSmooth * 0.82 + targetAmp * 0.18
      focusSmooth =
        targetAmp > focusSmooth ? focusSmooth * 0.15 + targetAmp * 0.85 : focusSmooth * 0.55 + targetAmp * 0.45

      const thinkTarget = THINK[state] ?? 0

      thinkBlend += (thinkTarget - thinkBlend) * (thinkTarget > thinkBlend ? delta * 5 : delta * 1.2)

      if (thinkBlend < 0.01) {
        thinkBlend = 0
      }

      spinBoost += delta * thinkBlend * 0.4

      // Two more axes of drift and a slow swell. A sphere turning on one axis
      // reads as a model on a turntable; this reads as something breathing.
      group.rotation.y = elapsed * 0.15 + spinBoost
      group.rotation.x = Math.sin(elapsed * 0.23) * 0.16
      group.rotation.z = Math.sin(elapsed * 0.17 + 1.3) * 0.09
      group.scale.setScalar(
        1 + (Math.sin(elapsed * 0.55) * 0.5 + 0.5) * 0.02 + ampSmooth * 0.05 + thinkBlend * 0.012
      )

      // Colour carries the turn: cool while it listens, warm while it answers,
      // the product's own indigo the rest of the time.
      speakBlend += ((state === 'speaking' ? 1 : 0) - speakBlend) * Math.min(delta * 3, 1)
      listenBlend += ((state === 'listening' ? 1 : 0) - listenBlend) * Math.min(delta * 3, 1)

      const tone = speakBlend - listenBlend

      uniforms.u_color_equator.value
        .copy(tones.equator)
        .lerp(tone > 0 ? tones.warm : tones.cool, Math.min(Math.abs(tone), 1) * 0.5)
      uniforms.u_color_pole.value.copy(tones.pole).lerp(tones.warm, Math.max(tone, 0) * 0.3)

      uniforms.u_time.value = elapsed

      // Fades in rather than popping into existence.
      if (uniforms.u_birth_progress.value < 1) {
        uniforms.u_birth_progress.value = Math.min(1, uniforms.u_birth_progress.value + delta * 1.6)
      }

      uniforms.u_voice_amp.value = ampSmooth
      // Capped so the crests never reach the canvas edge. At the old lift the
      // orb's peak measured exactly 1.00 of the half-frame — dead on the
      // vignette — so a loud syllable had its far side shaved flat.
      uniforms.u_noise_amp.value = NOISE_AMP + (live ? ampSmooth * 0.45 : 0) + thinkBlend * 0.1
      uniforms.u_brightness.value =
        (BRIGHTNESS + (live ? ampSmooth * 2 : 0) + thinkBlend) * PALETTE.brightness * (state === 'error' ? 0.35 : 1)
      uniforms.u_voice_focus.value = live ? focusSmooth : 0

      // A slow floor so quiet speech still drifts, and the rest from the voice.
      bearing += delta * (0.12 + focusSmooth * 3.4)
      uniforms.u_voice_dir.value
        .set(Math.cos(bearing), Math.sin(bearing * 0.63) * 0.55, Math.sin(bearing))
        .normalize()

      renderer.render(scene, camera)
    }

    tick()
    props.current.onReady?.(true)

    return () => {
      props.current.onReady?.(false)
      cancelAnimationFrame(frame)
      observer.disconnect()
      themeObserver.disconnect()

      if (tonesFrame) {
        cancelAnimationFrame(tonesFrame)
      }

      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="presence-orb__stage" ref={host} />
}
