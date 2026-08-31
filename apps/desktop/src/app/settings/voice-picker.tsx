import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader } from '@/components/ui/loader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type CatalogVoice, listVoices, speakText } from '@/hermes'
import { useI18n } from '@/i18n'
import { Mic } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

import { SectionHeading } from './primitives'

/** Which config key holds the voice for each provider. The picker writes the
 *  voice, the sync provider and the STREAMING provider in one save; any two of
 *  those drifting apart is precisely how the assistant ended up answering in a
 *  different voice each turn. */
const VOICE_KEY: Record<string, string> = {
  edge: 'tts.edge.voice',
  elevenlabs: 'tts.elevenlabs.voice_id',
  fish: 'tts.fish.reference_id'
}

const ALL = '__all__'

/** Spoken on preview. Long enough to hear a voice's character, short enough
 *  that auditioning twenty of them is not a chore. */
const SAMPLE = 'Good evening, sir. Everything is ready when you are.'

function languageLabel(code: string): string {
  if (!code) {
    return '—'
  }

  try {
    const display = new Intl.DisplayNames(undefined, { type: 'language' })

    return display.of(code) ?? code
  } catch {
    return code
  }
}

export function VoicePicker({
  onSelect,
  provider,
  voiceId
}: {
  /** Writes `tts.provider` and the provider's voice key together. */
  onSelect: (patch: Record<string, string>) => void
  provider: string
  voiceId: string
}) {
  const { t } = useI18n()
  const copy = t.partner.voicePicker
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState(ALL)
  const [gender, setGender] = useState(ALL)
  const [playing, setPlaying] = useState<null | string>(null)

  const catalogue = useQuery({ queryKey: ['voices'], queryFn: listVoices, retry: false, staleTime: 15 * 60_000 })
  const voices = catalogue.data?.voices ?? []

  // Built FROM the catalogue: Bengali appears because this install can speak
  // it, not because someone remembered to list it.
  const languages = useMemo(() => {
    const seen = new Map<string, string>()

    for (const voice of voices) {
      const base = voice.language.split('-')[0]

      if (base && !seen.has(base)) {
        seen.set(base, languageLabel(base))
      }
    }

    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [voices])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return voices.filter(voice => {
      if (language !== ALL && !voice.language.startsWith(language)) {
        return false
      }

      if (gender !== ALL && voice.gender !== gender) {
        return false
      }

      return !needle || `${voice.name} ${voice.id} ${voice.language}`.toLowerCase().includes(needle)
    })
  }, [gender, language, search, voices])

  const preview = async (voice: CatalogVoice) => {
    setPlaying(voice.id)

    try {
      const response = await speakText(SAMPLE, { provider: voice.provider, voice: voice.id })
      const audio = new Audio(response.data_url)

      await audio.play()
      await new Promise(resolve => audio.addEventListener('ended', resolve, { once: true }))
    } catch (error) {
      notifyError(error, copy.previewFailed)
    } finally {
      setPlaying(null)
    }
  }

  const select = (voice: CatalogVoice) => {
    const key = VOICE_KEY[voice.provider]

    onSelect({
      'tts.provider': voice.provider,
      // CLEARED, not pinned. An unset streaming provider follows `tts.provider`
      // by design (`resolve_streaming_provider`: "we never silently swap to a
      // different provider just to get streaming"), so clearing it leaves one
      // source of truth instead of two that can disagree. Writing only
      // `tts.provider` left this on whatever it was before — the assistant
      // then used the chosen voice while streaming was up and a different one
      // the moment it was not, which is the drift this picker exists to end.
      'tts.streaming.provider': '',
      ...(key ? { [key]: voice.id } : {})
    })
  }

  return (
    <section className="pb-8">
      <SectionHeading icon={Mic} meta={catalogue.isPending ? undefined : `${filtered.length}`} title={copy.title} />

      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Input
          className="h-7 min-w-0 flex-1 text-xs"
          onChange={event => setSearch(event.target.value)}
          placeholder={copy.search}
          value={search}
        />
        <Select onValueChange={setLanguage} value={language}>
          <SelectTrigger className="h-7 w-auto min-w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{copy.allLanguages}</SelectItem>
            {languages.map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={setGender} value={gender}>
          <SelectTrigger className="h-7 w-auto min-w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{copy.allGenders}</SelectItem>
            <SelectItem value="male">{copy.male}</SelectItem>
            <SelectItem value="female">{copy.female}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {catalogue.isPending ? (
        <Loader />
      ) : catalogue.isError ? (
        <p className="text-xs text-(--ui-text-tertiary)">{copy.loadFailed}</p>
      ) : (
        // Capped height: 722 voices is a catalogue, not a page.
        <ul className="max-h-80 overflow-y-auto rounded-md border border-(--ui-stroke-tertiary)">
          {filtered.map(voice => {
            const active = voice.provider === provider && voice.id === voiceId

            return (
              <li
                className={cn(
                  'flex items-center gap-2 border-b border-(--ui-stroke-tertiary)/50 px-2.5 py-1.5 last:border-b-0',
                  active && 'bg-(--ui-bg-quaternary)'
                )}
                key={`${voice.provider}:${voice.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-(--ui-text-primary)">{voice.name}</span>
                  <span className="block truncate text-[0.6875rem] text-(--ui-text-tertiary)">
                    {[languageLabel(voice.language.split('-')[0]), voice.gender, voice.provider]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>

                <Button
                  disabled={playing !== null}
                  onClick={() => void preview(voice)}
                  size="xs"
                  variant="text"
                >
                  {playing === voice.id ? copy.playing : copy.preview}
                </Button>
                <Button
                  disabled={active}
                  onClick={() => select(voice)}
                  size="xs"
                  variant={active ? 'text' : 'outline'}
                >
                  {active ? copy.selected : copy.use}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
