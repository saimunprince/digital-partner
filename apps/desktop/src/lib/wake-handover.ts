import { $gateway } from '@/store/gateway'
import { resumeWakeAfterVoice } from '@/store/wake-word'

/**
 * The mic handover between the wake-word detector and a voice conversation.
 *
 * Both hold the same capture device, so a conversation has to take it and then
 * give it back. Getting the second half wrong is invisible until you say the
 * wake phrase a second time and nothing happens — which is exactly what the
 * voice command centre did, because this logic lived only in the chat
 * composer and was never brought across.
 *
 * One instance per surface: the pause token is a record of whether WE paused
 * the detector, so a surface never resumes one another surface owns.
 */
export function createWakeHandover() {
  let paused = false
  let barrier: null | Promise<void> = null

  return {
    /** Await before opening the mic: the detector may still be releasing it,
     *  and opening ours while it holds it makes getUserMedia fail. */
    barrier: (): Promise<void> | undefined => barrier ?? undefined,

    /** Take the mic. Returns the same promise `barrier()` hands out. */
    pause() {
      paused = true

      barrier = (async () => {
        try {
          await $gateway.get()?.request('wake.pause', {})
        } catch {
          // No wake listener, or an older backend — nothing held the mic.
        }
      })()

      return barrier
    },

    /** Give it back. Reconciles rather than merely resuming: the wake word is
     *  a persistent setting, so ending a conversation must re-arm the listener
     *  whenever config says enabled — including when the raw resume loses the
     *  mic-release race. */
    resume() {
      if (!paused) {
        return
      }

      paused = false
      barrier = null
      void resumeWakeAfterVoice()
    }
  }
}
