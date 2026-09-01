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

### It answered with nothing, then said the same thing again

Fourteen assistant turns in the voice session had **no content and no tool
calls**, several with `finish_reason: "length"` — the model spent its entire
completion budget and produced not one word. Gemini 2.5 Flash is a thinking
model: hidden reasoning is billed against the same budget as the answer, and a
small cap can finish with an empty message. Hermes already knew this shape —
its Meta provider plugin carries the note *"spends completion budget on hidden
reasoning tokens first; small caps can finish with empty content"*.

The agent re-answers when a turn comes back empty. That is what "it says the
same thing twice" actually was.

`model.max_tokens: 16384` (the default is unset, and the effective cap was far
lower). The fourteen empty turns were deactivated rather than deleted: while
they stayed in the working transcript the pre-call sanitizer healed them on
**every single call** — 125 times, and the count per call was still climbing.

What this was NOT: `reasoning_effort`. Benchmarked at the free tier's 10 RPM
with pacing, default / `low` / `none` came in at 1.82 / 1.71 / 1.52s median,
all picking the right tool. An earlier unpaced run showed 2.69 vs 1.41 and was
pure network noise. A 0.3s difference does not explain a 34s turn, so nothing
was changed on that basis.

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

## Two engines run on this machine

Worth knowing before diagnosing anything, because it produced a wrong diagnosis
once already:

- **The desktop's own** — `hermes_cli.main serve`, spawned from THIS checkout on
  launch (`HERMES_DESKTOP_HERMES_ROOT` in `digital-partner.sh`), a child of
  electron. This is what answers the app.
- **`hermes-gateway.service`** — a systemd user unit, `Restart=always`, running
  the INSTALLED copy under `~/.hermes/hermes-agent`. It carries the messaging
  integrations. It is not what serves the app; leave it alone.

```bash
pgrep -af "hermes_cli.main"   # the desktop's is the child of electron
```

Seeing only the systemd one — the desktop's is not running between launches —
led to "none of the backend work is live", which was wrong. The real fault was
that this checkout's `.venv` was missing `mcp` and `snowballstemmer`, so MCP
servers failed with ImportError and tool search was skipped. `uv pip install
--python .venv/bin/python <pkg>` fixes that; the venv has no `pip` of its own,
so `pip list` reports nothing and is not evidence of an empty environment.

## Adding an MCP server

Two traps, both hit on the first one added.

**The starter entry is not a template — it is saved.** "Add server" seeds
`/path/to/dir`, and saving it unedited gives a server that cannot start and is
retried every few seconds, forever, into a log nobody reads. One ran a day and
a half that way. Saving is now refused while a placeholder path is still there.

**`client_id_metadata_document_supported: true` is not a promise.** Airtable
advertises it, so the SDK identified Hermes by the URL of its published Client
ID Metadata Document — and Airtable rejected that with *"invalid client_id or
mismatched redirect_uri"*, **after** login, having accepted the same request
before it. Everything else checked out: the document returned 200, its
`redirect_uris` contained the exact callback, and all five pinned ports
(27890–27894) were free.

The fix is a per-server knob:

```yaml
mcp_servers:
  airtable:
    url: "https://mcp.airtable.com/mcp"
    auth: oauth
    oauth:
      cimd: false     # force RFC 7591 dynamic registration
```

Then `./.venv/bin/hermes mcp login <name>` — interactively, in a terminal. A
systemd service cannot open a browser, which is what `OAuthNonInteractiveError`
means. Clear any stale `~/.hermes/mcp-tokens/<name>.client.json` first so the
client re-registers.

Afterwards, **leave that file alone**. Dynamic registration binds the client id
to the exact callback port it registered with (a random one), and Hermes reads
the port back from there. Delete it and the next authorization is a
`redirect_uri` mismatch.

## Still open

- A **queued prompt lands in the thread as a user message**. Home no longer
  shows a transcript so it is invisible there, but opening the voice session in
  Chat shows the briefing instruction as something the user said. The fix is a
  hidden-message flag through the submit pipeline, not a display filter.
- **Chat still looks like upstream** below the corner orb — transcript rows,
  tool rows, approval cards.
- **Turn latency still runs 6–34s** when a turn makes several tool calls. Each
  round trip is a fresh model call at ~2s plus the tool's own time, so four
  calls is eight seconds before the tools have done anything. The empty-answer
  retries above inflated it further; whether anything remains beyond the
  arithmetic is unmeasured.
- **The free Gemini tier rate-limits at 10 requests/minute.** Nine rapid calls
  hit 429, and it cleared within the minute — a per-minute cap, not a daily
  one. A busy conversation with tool round-trips can reach it.

## Checking it still works

```bash
cd apps/desktop && npm run typecheck && npm run lint && npm run test
./scripts/run_tests.sh tests/
```

Roughly 8,800 desktop tests. Run them from `apps/desktop` — two of them read
files relative to `process.cwd()` and fail from anywhere else.
