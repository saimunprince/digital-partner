import { atom, computed } from 'nanostores'

import type { ConversationStatus } from '@/app/chat/composer/hooks/use-voice-conversation'
import { $voicePlayback } from '@/store/voice-playback'

/** Live mirror of the composer's voice-conversation state machine. The hook
 *  (`use-voice-conversation`) remains the single OWNER of the state; these
 *  atoms exist so presence surfaces (orb, titlebar, voice overlay) can read
 *  it without mounting the composer. Written only by the hook's mirror
 *  effect — never set these from feature code. */
export const $voiceConversationStatus = atom<ConversationStatus>('idle')

/** Live mic input level [0..1] while the conversation is capturing. Written
 *  by the conversation hook. */
export const $micLevel = atom(0)

/** Live output level [0..1] while the assistant is speaking. Written by the
 *  playback path from the audio graph itself, so the orb moves with the actual
 *  speech rather than a synthetic envelope. */
export const $speechLevel = atom(0)

/**
 * The level the presence surfaces read: the user's voice while listening, the
 * assistant's while speaking. One value, so an orb never has to know which side
 * of the conversation is making the sound.
 */
export const $voiceLevel = computed(
  [$micLevel, $speechLevel, $voiceConversationStatus, $voicePlayback],
  (mic, speech, status, playback) =>
    // Playback state is checked too: a reply read aloud outside a conversation
    // (auto-speak) leaves the conversation status idle, and the orb should
    // still move with it.
    status === 'speaking' || playback.status === 'speaking' ? speech : mic
)
