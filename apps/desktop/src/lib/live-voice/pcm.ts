/**
 * The audio arithmetic a live session needs, as pure functions.
 *
 * `wake-client-capture.ts` carries its own copy of the resampler and the
 * int16 conversion. That file is upstream's, and lifting the maths out of it
 * would put a conflict in every future pull for the sake of thirty lines —
 * so this is a deliberate second copy, kept honest by the tests beside it.
 *
 * The rates are the provider's, not ours: Gemini's live socket takes 16 kHz
 * mono PCM16 upstream and answers at 24 kHz.
 */

export const INPUT_RATE = 16_000
export const OUTPUT_RATE = 24_000

/**
 * Linear-interpolate `input` from `inputRate` down to 16 kHz.
 *
 * Interpolated rather than nearest-neighbour: dropping samples on a
 * 48 kHz → 16 kHz decimation aliases audibly, and the speech recogniser on
 * the far side hears the artefacts as consonants that were never said.
 */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === INPUT_RATE || input.length === 0) {
    return input
  }

  const ratio = inputRate / INPUT_RATE
  const length = Math.floor(input.length / ratio)

  if (length <= 0) {
    return new Float32Array(0)
  }

  const out = new Float32Array(length)

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio
    const low = Math.floor(position)
    const high = Math.min(low + 1, input.length - 1)
    const weight = position - low

    out[i] = input[low] * (1 - weight) + input[high] * weight
  }

  return out
}

/** Float samples in [-1, 1] to little-endian signed 16-bit. */
export function floatToPcm16(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)

  for (let i = 0; i < input.length; i += 1) {
    // Clamp first: a sample past ±1 wraps to the opposite extreme once it is
    // truncated into 16 bits, which is heard as a click on every loud
    // syllable rather than as clipping.
    const sample = Math.max(-1, Math.min(1, input[i]))

    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return buffer
}

/** Little-endian signed 16-bit back to float samples in [-1, 1]. */
export function pcm16ToFloat(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  const out = new Float32Array(Math.floor(buffer.byteLength / 2))

  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 0x8000
  }

  return out
}

/** Bytes to base64, in chunks — `String.fromCharCode(...bytes)` on a whole
 *  buffer overflows the argument limit on anything longer than a moment. */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }

  return btoa(binary)
}

/** Base64 back to bytes. */
export function base64ToBytes(value: string): ArrayBuffer {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }

  return out.buffer
}
