import { useStore } from '@nanostores/react'
import { lazy, Suspense, useState } from 'react'

import { cn } from '@/lib/utils'
import { $presence, type PresenceState } from '@/store/presence'
import { $voiceLevel } from '@/store/voice-conversation'

// three.js is ~600KB; keep it out of the boot bundle and off every surface
// that only ever shows the small mark.
const OrbCanvas = lazy(async () => ({ default: (await import('./orb-canvas')).OrbCanvas }))

export type PresenceOrbSize = 'compact' | 'hero' | 'micro'

const SIZE_PX: Record<PresenceOrbSize, number> = {
  hero: 560,
  compact: 16,
  micro: 20
}

/** Coil segments around the core. Ten reads as engineered without becoming a
 *  dotted line at small sizes. */
const SEGMENTS = 10

/**
 * The assistant's presence — a reactor.
 *
 * Concentric rings, a ring of coil segments, and a luminous core: the shape
 * reads as a power source rather than a chat bubble. It is drawn with the
 * product's own accent rather than a costume blue, so it belongs to this
 * interface instead of quoting a film frame.
 *
 * State is expressed by the reactor's BEHAVIOUR:
 *
 *   idle          core breathes, coil drifts
 *   listening     core swells with the live mic level
 *   transcribing  coil completes a quick revolution
 *   thinking      coil turns steadily
 *   executing     coil turns fast, segments brighten
 *   speaking      core pulses outward
 *   error         the light dies down; the housing opens
 */
export function PresenceOrb({
  className,
  size = 'compact',
  state
}: {
  className?: string
  size?: PresenceOrbSize
  /** Override for previews/tests; live surfaces omit it and follow $presence. */
  state?: PresenceState
}) {
  // The static mark is a FALLBACK, not a backdrop: once the particle orb has a
  // GL context it must go, or its housing ring reads as a stray circle drawn
  // around the sphere.
  const [glLive, setGlLive] = useState(false)
  const live = useStore($presence)
  const level = useStore($voiceLevel)
  const current = state ?? live
  const px = SIZE_PX[size]
  const isHero = size === 'hero'
  const isError = current === 'error'

  // Voice drives the core; the housing never resizes.
  const coreScale = current === 'listening' ? 1 + Math.min(level, 1) * 0.3 : 1

  const spin =
    current === 'executing' || current === 'transcribing'
      ? 'presence-rotate'
      : current === 'thinking'
        ? 'presence-rotate-slow'
        : 'presence-drift'

  const coilR = 33
  const coilCirc = 2 * Math.PI * coilR
  const segment = coilCirc / SEGMENTS

  return (
    <span
      aria-hidden="true"
      className={cn('presence-orb relative inline-block shrink-0 select-none align-middle', className)}
      data-presence-size={size}
      data-presence-state={current}
      style={{ height: px, width: px }}
    >
      {isHero && (
        <Suspense fallback={null}>
          <OrbCanvas level={level} onReady={setGlLive} state={current} />
        </Suspense>
      )}

      <svg
        className={cn('block size-full', isHero && 'presence-orb__fallback', isHero && glLive && 'hidden')}
        viewBox="0 0 100 100"
      >
        <defs>
          <radialGradient id="presence-core">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="color-mix(in srgb, var(--horizon-a) 40%, #ffffff)" />
            <stop offset="72%" stopColor="var(--horizon-a)" />
            <stop offset="100%" stopColor="color-mix(in srgb, var(--horizon-a) 35%, transparent)" />
          </radialGradient>
        </defs>

        {/* Housing — the outer case and its inner lip. */}
        <circle className="presence-orb__housing" cx="50" cy="50" r={46} strokeWidth={isHero ? 1.4 : 4} />
        <circle className="presence-orb__well" cx="50" cy="50" r={42} />
        {isHero && !isError && (
          <circle className="presence-orb__lip" cx="50" cy="50" r={24.5} strokeWidth={0.9} />
        )}

        {/* Coil — the segmented ring that turns while the assistant works. */}
        {!isError && (
          <g className={cn('presence-orb__coil', spin)}>
            <circle
              cx="50"
              cy="50"
              r={coilR}
              strokeDasharray={`${segment * 0.62} ${segment * 0.38}`}
              strokeLinecap="butt"
              strokeWidth={isHero ? 7 : 12}
            />
          </g>
        )}

        {/* Core — the light itself. */}
        {!isError && (
          <g
            className={cn('presence-orb__core', current === 'idle' && 'presence-breathe', current === 'speaking' && 'presence-ripple')}
            style={{ transform: `scale(${coreScale})`, transformOrigin: 'center' }}
          >
            <circle cx="50" cy="50" r={isHero ? 15 : 17} />
          </g>
        )}

        {isError && <circle className="presence-orb__dead" cx="50" cy="50" r={isHero ? 13 : 15} />}
      </svg>
    </span>
  )
}
