import { describe, expect, it } from 'vitest'

import { base64ToBytes, bytesToBase64, downsampleTo16k, floatToPcm16, INPUT_RATE, pcm16ToFloat } from './pcm'

describe('downsampleTo16k', () => {
  it('passes 16 kHz through untouched', () => {
    const input = new Float32Array([0.1, -0.2, 0.3])

    expect(downsampleTo16k(input, INPUT_RATE)).toBe(input)
  })

  it('thirds the sample count coming from 48 kHz', () => {
    expect(downsampleTo16k(new Float32Array(4800), 48_000).length).toBe(1600)
  })

  // The reason this interpolates instead of picking nearest: a constant
  // signal must stay constant, and a ramp must stay a ramp.
  it('preserves a constant signal exactly', () => {
    const flat = new Float32Array(300).fill(0.5)

    for (const sample of downsampleTo16k(flat, 48_000)) {
      expect(sample).toBeCloseTo(0.5, 6)
    }
  })

  it('keeps a ramp linear rather than stair-stepping it', () => {
    const ramp = new Float32Array(300)

    ramp.forEach((_, i) => (ramp[i] = i / 300))

    const out = downsampleTo16k(ramp, 32_000)
    const steps = out.slice(1).map((value, i) => value - out[i])

    for (const step of steps) {
      expect(step).toBeCloseTo(steps[0], 6)
    }
  })

  it('survives an empty buffer', () => {
    expect(downsampleTo16k(new Float32Array(0), 48_000).length).toBe(0)
  })
})

describe('floatToPcm16 / pcm16ToFloat', () => {
  it('round-trips samples within a quantisation step', () => {
    const input = new Float32Array([0, 0.25, -0.25, 0.75, -0.75])
    const out = pcm16ToFloat(floatToPcm16(input))

    input.forEach((sample, i) => expect(out[i]).toBeCloseTo(sample, 4))
  })

  it('writes little-endian, which is what the wire expects', () => {
    const view = new DataView(floatToPcm16(new Float32Array([1])))

    expect(view.getInt16(0, true)).toBe(0x7fff)
  })

  // Without the clamp a sample past +1 truncates into a NEGATIVE int16 — a
  // click on every loud syllable, not the soft clipping it sounds like it
  // should be.
  it('clamps rather than wrapping a sample past full scale', () => {
    const view = new DataView(floatToPcm16(new Float32Array([1.5, -1.5])))

    expect(view.getInt16(0, true)).toBe(0x7fff)
    expect(view.getInt16(2, true)).toBe(-0x8000)
  })
})

describe('base64', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])

    expect(new Uint8Array(base64ToBytes(bytesToBase64(bytes.buffer)))).toEqual(bytes)
  })

  // The chunking exists for exactly this: spreading a whole buffer into
  // String.fromCharCode overflows the argument limit somewhere in the tens of
  // thousands, and a second of audio is 32,000 bytes.
  it('encodes a buffer past the spread-argument limit', () => {
    const big = new Uint8Array(200_000).fill(7)

    expect(new Uint8Array(base64ToBytes(bytesToBase64(big.buffer)))).toEqual(big)
  })
})
