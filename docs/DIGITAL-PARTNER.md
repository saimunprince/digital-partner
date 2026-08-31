# The digital partner

A voice-first personal assistant, built **in place** on top of the Hermes
desktop app rather than beside it. Hermes is the engine; this is the product.
One entry point:

```bash
./digital-partner.sh            # start
./digital-partner.sh --restart  # rebuild and restart
```

This file records **what was changed and why**, and — just as usefully — **what
broke along the way**. `docs/UPSTREAM.md` is its companion: how to keep pulling
from `NousResearch/hermes-agent` without either half fighting the other.

It is deliberately not `README.md`. That file is upstream's, and editing it
would put a conflict in every future pull for no design reason.

---

## The shape of it

| Surface | What it is for |
|---|---|
| **Home** | Talking. The orb is the only control. No transcript — see below. |
| **Chat** | Typing. A separate session, so speaking never rewrites what Chat shows. |
| **Tasks** | The kanban plugin's own board. What you say in voice and what you see here are one list. |
| **Memory** | What it remembers about you, editable in place. |
| The rail | 16 of 17 routes, one click away. Settings is the 17th, at the foot. |

Home and Chat keeping **separate sessions** is the load-bearing decision. It is
why opening Chat cannot interrupt a spoken thread, and why the voice session
shows up under *Active now* like any other session.

## What runs it

Everything below is config, not code. None of it is a secret — keys live in
`~/.hermes/.env`, which is the user's to manage, and are referenced by variable
name only.

| Concern | Setting | Note |
|---|---|---|
| Model | `providers.gemini-openai` + `model.provider` | `key_env: GEMINI_API_KEY`; the key never enters `config.yaml` |
| Speech in | `stt.provider: groq`, `whisper-large-v3` | `stt.language` deliberately **empty** — see *Hearing*, below |
| Speech out | `tts.provider`, with `tts.streaming.provider` **empty** | empty means "follow `tts.provider`" — one source of truth, see below |
| Speaking first | `partner.briefing.*`, `partner.nudge.*` | quiet hours are shared by both |

## Engine changes

Five Python files, all additive:

- `tools/tts_streaming.py` — a Fish Audio streamer (chunked PCM over plain
  HTTP; no msgpack socket, no new dependency), and a first-chunk rule in
  `SentenceChunker`. The first piece is the only latency a listener
  experiences: *"Got it, sir."* went 1.6s → 0.4s, a long sentence 3.8s → 1.8s.
- `tools/tts_tool.py` — Fish as a full builtin provider, not only a streamer,
  plus a per-request `voice` override.
- `hermes_cli/web_routers/voices.py` — `GET /api/voices`, one normalized
  catalogue across providers.
- `hermes_cli/web_models.py`, `web_server.py` — optional `provider`/`voice` on
  the speak request; `fish` in the provider enum.
- `hermes_cli/config_defaults.py` — the `partner:` section. Pure data; no
  prompt or toolset change.

---

## Problems, and what they actually were

Kept because most of them looked like something else first.

### It never spoke

Three independent causes, all live at once, each of which alone was enough:

1. An English-only TTS voice reading Bengali text — `NoAudioReceived`.
2. STT pinned to `en`.
3. The model returning 401.

### It spoke in a different voice every time

Fish invents a voice per request when no `reference_id` is set — and `fish` was
not in `BUILTIN_TTS_PROVIDERS`, so the sync path *could not use it*. That is
why a second provider was configured at all, and why the voice changed the
moment streaming was unavailable. Fixed by making Fish a real provider and
pinning the id. A later fix on top: `reference_id` was being silently dropped
because `_get_named_provider_config` returns nothing for builtin names.

It came back, months later, through the picker built to prevent it: selecting a
voice wrote `tts.provider` and left `tts.streaming.provider` alone, so a config
could sit at `edge`/`af-ZA-AdriNeural` on the sync path and `fish` on the
streaming one. Two providers, two voices, exactly as before. The picker now
**clears** the streaming provider rather than pinning it — unset means "follow
`tts.provider`" by design, which leaves one source of truth instead of two that
can disagree.

The lesson is the one worth keeping: a fix that writes two values to keep them
equal is a fix waiting to be undone. Delete one of them.

### It said the same thing twice

Two speech sessions opening three seconds apart. The turn-drive effect re-runs
on every render and `setStatus('speaking')` had not committed yet, so a delta
arriving mid-open synthesized the whole answer a second time.

### It spoke only the first fragment

`pendingResponse` closed over a render snapshot. The speech machine captures
these callbacks once and polls them on a timer, so the reply froze at whatever
had streamed in by the first frame. It reads `$sessionStates` live now.

### The wake word worked exactly once per launch

The detector and a voice conversation share one microphone, and the half that
gives it back lived only in the chat composer. Moving `wake.detected` to Home
left it behind. Both surfaces now share one handover, which refuses to resume a
detector it did not pause.

### The starfield painted nothing

`count=0 w=5 h=4`. A canvas is a **replaced element**, so `inset-0` does not
stretch it — and the draw loop wrote the collapsed size back every frame. (The
logs that proved this were invisible too: the console forwarder only carries
level 3.)

### The orb clipped at loud voice

Measured: peak/half-frame = 1.00, exactly the fragment vignette. The GL surface
is 1.55× the layout box now and the camera pulls back to match, so this buys
room rather than scale.

### The device hung

Blamed on the orb. It was **16 vitest workers holding 4.5 GB with 927 MB
free** — repeated test runs, not the animation. (A real per-frame
`createRadialGradient` allocation in the starfield was found and fixed while
looking, but it was not the cause.)

### The orb rode up the screen when the transcript grew

The page itself scrolled. While talking it does not, which is what guarantees
the orb holds its place.

### Mistakes worth naming

- **The i18n script branded the key, not the value** — `updateHermes:` became
  `update{brand}:`, and thousands of TS errors with it.
- **Settings got the navigation list.** Backwards: Settings is for configuring
  the product, the rail is for moving around it.
- **Groq was adopted before it was measured.** The key authenticates fine; the
  free tier caps at 8k tokens/minute against a ~29k-token tool prompt, so every
  turn 413s. Gemini replaced it on evidence, not preference.

---

## Two things that are platform limits, not choices

**Browser speech recognition does not work here.** Probed directly in Electron:

```
present: true   constructed: true   started: false   error: "network"
```

Chromium sends audio to Google's speech service and needs API keys baked into
the build, which Electron ships without — and the endpoint is not one a normal
Google Cloud key opens. A web app in real Chrome gets this for free; we use
Groq Whisper instead and pay an upload for it.

**Calendar needs Google OAuth**, which is set aside. The page exists and is
wired; it has nothing to show until the consent screen is through review.

---

## Still open

- A **queued prompt lands in the thread as a user message**. Home no longer
  shows a transcript so it is invisible there, but opening the voice session in
  Chat shows the briefing instruction as something the user said. The fix is a
  hidden-message flag through the submit pipeline, not a display filter.
- **Chat still looks like upstream** below the corner orb — transcript rows,
  tool rows, approval cards.
- **Turn latency runs 6–34s** with tools in play, and the model has been seen
  repeating itself and re-running the same tool. Not diagnosed.

## Checking it still works

```bash
cd apps/desktop && npm run typecheck && npm run lint && npm run test
./scripts/run_tests.sh tests/
```

Roughly 8,800 desktop tests. Run them from `apps/desktop` — two of them read
files relative to `process.cwd()` and fail from anywhere else.
