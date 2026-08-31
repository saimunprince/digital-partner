import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/app/settings/voice-picker.tsx'), 'utf8')

describe('voice picker selection', () => {
  // The bug this file exists to prevent: choosing a voice wrote `tts.provider`
  // and left `tts.streaming.provider` on whatever it had been, so the
  // assistant used the chosen voice while streaming was up and a different one
  // the moment it was not. Config observed in the wild after a pick:
  // tts.provider=edge (af-ZA-AdriNeural) with tts.streaming.provider=fish.
  it('sets the sync provider and CLEARS the streaming one, so it follows', () => {
    const select = source.slice(source.indexOf('const select ='), source.indexOf('return (', source.indexOf('const select =')))

    expect(select).toContain("'tts.provider': voice.provider")
    // Empty, not pinned: an unset streaming provider follows tts.provider by
    // design, which leaves one source of truth rather than two.
    expect(select).toContain("'tts.streaming.provider': ''")
  })

  it('writes the provider’s own voice key alongside them', () => {
    expect(source).toContain("edge: 'tts.edge.voice'")
    expect(source).toContain("fish: 'tts.fish.reference_id'")
  })
})
