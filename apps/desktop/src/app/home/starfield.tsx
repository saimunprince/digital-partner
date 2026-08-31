import { useEffect, useRef } from 'react'

import { RENDERER_ANIMATIONS_PAUSED_ATTRIBUTE } from '@/lib/renderer-loop-pause'

/** Enough to read as a sky, few enough to stay a background. Scaled by area so
 *  a wide window does not look emptier than a narrow one. */
const STARS_PER_MEGAPIXEL = 210
const MAX_STARS = 900

/** Pixels per second at the nearest depth. Slow enough that you notice it only
 *  if you look — a background that visibly travels is a distraction. */
const DRIFT_PX_PER_SECOND = 5

/** Flares, in stars per second across the WHOLE field — not per star. Tuned by
 *  the count so a wide window does not flicker more than a narrow one. About
 *  one and a half a second: often enough that the sky is never quite still,
 *  rare enough that catching one still feels like catching one. */
const FLARES_PER_SECOND = 1.5

/** A flare rises and falls over this long. Faster reads as a blink; much
 *  slower and it stops being an event. */
const FLARE_SECONDS = 2.2

interface Star {
  depth: number
  /** 0 when at rest, else how far through a flare this star is (0..1). */
  flare: number
  phase: number
  radius: number
  twinkle: number
  x: number
  y: number
}

/** A theme colour, or the fallback when the variable is unset or not a literal
 *  (the theme resolves some tokens to `color-mix()`, which canvas cannot use). */
function readColor(cssVar: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()

  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex

  return [
    Number.parseInt(full.slice(1, 3), 16),
    Number.parseInt(full.slice(3, 5), 16),
    Number.parseInt(full.slice(5, 7), 16)
  ]
}

/**
 * The sky the orb hangs in.
 *
 * Deliberately its own 2D canvas rather than more points in the orb's WebGL
 * scene: the orb's surface is sized to the orb (see `.presence-orb__stage`),
 * and stretching it to the page would drag the whole particle system's framing
 * with it. This is also far cheaper — a few hundred filled arcs a frame.
 *
 * Depth is the whole trick. Near stars are larger, brighter and drift faster;
 * far ones barely move. That parallax is what makes it read as distance rather
 * than as dots sliding across a flat plane.
 */
export function Starfield({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      return undefined
    }

    // A canvas is a REPLACED element: `inset-0` alone does not stretch it the
    // way it stretches a div, so it keeps its intrinsic size — and because the
    // draw loop then writes that size back into the width/height attributes,
    // it collapses a little further every pass. It measured 5x4 pixels. Owned
    // here rather than left to the caller's className: getting this wrong
    // paints nothing at all, silently.
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    let stars: Star[] = []
    let width = 0
    let height = 0
    let ratio = 1
    let colour: [number, number, number] = hexToRgb(readColor('--orb-pole', '#9fd4ff'))

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')

    // One soft dot, drawn once at a fixed size and scaled per star. Its own
    // canvas so the gradient object is created a single time in the lifetime
    // of the field rather than tens of times per frame.
    const halo = document.createElement('canvas')
    const HALO_PX = 64

    halo.width = HALO_PX
    halo.height = HALO_PX

    const paintHalo = () => {
      const haloContext = halo.getContext('2d')

      if (!haloContext) {
        return
      }

      const [hr, hg, hb] = colour
      const mid = HALO_PX / 2
      const gradient = haloContext.createRadialGradient(mid, mid, 0, mid, mid, mid)

      gradient.addColorStop(0, `rgb(${hr} ${hg} ${hb} / 1)`)
      gradient.addColorStop(1, `rgb(${hr} ${hg} ${hb} / 0)`)
      haloContext.clearRect(0, 0, HALO_PX, HALO_PX)
      haloContext.fillStyle = gradient
      haloContext.fillRect(0, 0, HALO_PX, HALO_PX)
    }

    paintHalo()

    const resize = () => {
      const rect = canvas.getBoundingClientRect()

      if (rect.width === 0 || rect.height === 0) {
        return
      }

      ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

      const count = Math.min(MAX_STARS, Math.round((width * height * STARS_PER_MEGAPIXEL) / 1_000_000))

      stars = Array.from({ length: count }, () => {
        // Raised to a high power, so the great majority sit far away and only
        // a few come near. An even spread reads as confetti, and too many
        // near ones read as a snowstorm.
        const depth = Math.random() ** 4

        return {
          depth,
          flare: 0,
          phase: Math.random() * Math.PI * 2,
          radius: 0.4 + depth * 1.0,
          twinkle: 0.35 + Math.random() * 0.9,
          x: Math.random() * width,
          y: Math.random() * height
        }
      })
    }

    resize()

    const observer = new ResizeObserver(resize)

    observer.observe(canvas)

    // The theme's colours land as inline custom properties on <html>; re-read
    // when they change so the sky follows a skin or light/dark switch.
    const themeObserver = new MutationObserver(() => {
      colour = hexToRgb(readColor('--orb-pole', '#9fd4ff'))
      paintHalo()
    })

    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class', 'data-hermes-mode', 'data-hermes-theme', 'style'],
      attributes: true
    })

    let frame = 0
    let last = performance.now()

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)

      const paused = document.documentElement.hasAttribute(RENDERER_ANIMATIONS_PAUSED_ATTRIBUTE)
      const delta = paused || still.matches ? 0 : Math.min((now - last) / 1000, 0.1)

      last = now

      context.clearRect(0, 0, width, height)

      const [r, g, b] = colour
      // Per star, per frame — derived from the whole-field rate so density
      // never changes how busy the sky looks.
      const igniteChance = stars.length > 0 ? (FLARES_PER_SECOND * delta) / stars.length : 0

      for (const star of stars) {
        if (delta > 0) {
          // Rightward and slightly up: a single shared direction is what makes
          // scattered points read as one sky moving, not as noise.
          star.x += DRIFT_PX_PER_SECOND * (0.25 + star.depth) * delta
          star.y -= DRIFT_PX_PER_SECOND * 0.25 * (0.25 + star.depth) * delta
          star.phase += delta * star.twinkle

          if (star.flare > 0) {
            star.flare = Math.min(1, star.flare + delta / FLARE_SECONDS)

            if (star.flare >= 1) {
              star.flare = 0
            }
          } else if (Math.random() < igniteChance) {
            // Nudged off zero so the same frame does not read it as at-rest.
            star.flare = 0.0001
          }

          if (star.x > width + 2) {
            star.x = -2
            star.y = Math.random() * height
          }

          if (star.y < -2) {
            star.y = height + 2
            star.x = Math.random() * width
          }
        }

        // Rises and falls on a sine, so a flare has no edges at either end —
        // a linear ramp switches on and a linear decay switches off, and both
        // read as a glitch rather than as light.
        const flare = star.flare > 0 ? Math.sin(Math.PI * star.flare) : 0

        const alpha = Math.min(
          1,
          (0.2 + star.depth * 0.55) * (0.72 + 0.28 * Math.sin(star.phase)) + flare * 0.55
        )

        const radius = star.radius * (1 + flare * 0.9)

        // The nearest handful always carry a tight halo; a flaring star gets
        // one wherever it sits, because the bloom IS the flare. A wide bloom
        // on a small dot reads as a smudge on the glass rather than a star.
        const haloStrength = Math.max(star.depth > 0.75 ? 0.32 : 0, flare * 0.5)

        if (haloStrength > 0.01) {
          const reach = radius * (2.6 + flare * 2.4)

          // Drawn from a pre-rendered sprite, not a fresh gradient.
          // `createRadialGradient` allocates a new object every call, and this
          // ran per bright star per frame — a couple of thousand short-lived
          // objects a second, which is not a leak but is steady pressure on
          // the collector, and a stutter you can feel. The sprite is built
          // once and scaled into place.
          context.globalAlpha = Math.min(1, alpha * haloStrength * 3.2)
          context.drawImage(halo, star.x - reach, star.y - reach, reach * 2, reach * 2)
          context.globalAlpha = 1
        }

        context.fillStyle = `rgb(${r} ${g} ${b} / ${alpha})`
        context.beginPath()
        context.arc(star.x, star.y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }

    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      themeObserver.disconnect()
    }
  }, [])

  return <canvas aria-hidden="true" className={className} ref={ref} />
}
