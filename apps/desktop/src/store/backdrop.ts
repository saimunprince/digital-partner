import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

const KEY = 'hermes.desktop.backdrop.v1'

/** Whether the faint statue image renders behind the chat transcript.
 *
 *  Off by default: the product's ground is a calm, flat surface and a
 *  watermark behind live text costs contrast for decoration. Still available
 *  in Settings → Appearance for anyone who wants it. */
export const $backdrop = atom(storedBoolean(KEY, false))

$backdrop.subscribe(on => persistBoolean(KEY, on))

export function setBackdrop(on: boolean) {
  $backdrop.set(on)
}
