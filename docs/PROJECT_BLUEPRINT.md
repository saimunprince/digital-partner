# Digital Partner — Project Blueprint

> Internal codename: **digital-partner** (final brand TBD — identity is configurable, never hardcoded).
> Mission: transform the existing Hermes desktop workspace (`hermes gui` → `apps/desktop`) **in-place**
> into a voice-first Personal Digital Partner. Hermes remains the execution engine; the user-facing
> product identity, navigation, home experience, and voice UX become a new premium product.

## 1. Current repository architecture (verified)

| Layer | What it is | Key paths |
| --- | --- | --- |
| Agent core | Synchronous, thread-based loop; `run_agent.py` is a facade over `agent/` | `agent/conversation_loop.py`, `agent/tool_executor.py`, `agent/transports/` |
| Control plane | JSON-RPC 2.0, transport-agnostic (stdio + WS), ~145 methods, ~50 event types | `tui_gateway/` (`server.py`, `methods_*.py`, `ws.py`) |
| Web backend | FastAPI, ~200 REST endpoints + `/api/ws` + `/api/audio/*`; `hermes serve` = headless mode | `hermes_cli/web_server.py`, `hermes_cli/web_routers/` |
| Desktop app | Electron 40 + React 19 + Vite; nanostores; `@assistant-ui/react` chat; spawns `hermes serve` | `apps/desktop/` (renderer `src/`, main process `electron/`) |
| Shared TS | JSON-RPC client + WS URL/auth helpers | `apps/shared/` (`@hermes/shared`) |
| Voice engine | STT (faster-whisper local + cloud), 11+ TTS providers, streaming sentence-chunked TTS, wake word, barge-in, stop phrases, VAD | `tools/voice_mode.py`, `tools/tts_*.py`, `tools/transcription_tools.py`, `tools/wake_word.py`, `hermes_cli/voice.py` |
| State | SQLite `state.db` (schema v26): sessions, messages, usage, cross-process turn leases; FTS5/trigram/CJK search | `hermes_state*.py` |
| Memory | Curated MEMORY.md/USER.md (§ entries) + staged-write approval; learning graph; pluggable memory providers | `tools/memory_tool.py`, `tools/write_approval.py`, `agent/learning_graph.py`, `plugins/memory/` |
| Approvals | Hardline/dangerous detection, smart (LLM guardian) mode, async gateway queue with replay, pluggable transports | `tools/approval.py`, `hermes_cli/approval_transport.py` |
| Automation | Cron scheduler (jobs.json + separate executions DB), blueprints (incl. `morning-brief`), suggestions, heartbeat/goals | `cron/` |
| Tasks | Kanban DB + CLI + dashboard HTTP plugin (no gateway RPC yet) | `hermes_cli/kanban_db.py`, `plugins/kanban/`, `apps/desktop/src/plugins/kanban/` |
| Integrations | 22+ messaging platforms, MCP client/catalog/OAuth, 33 model providers, 197 skills (incl. google-workspace with OAuth + daily-brief procedure) | `plugins/platforms/`, `tools/mcp_tool.py`, `skills/` |
| Extension API | PluginContext: 20+ registration points, 24 hooks; plugins cannot register gateway RPC | `hermes_cli/plugins.py` |

**Hard constraints** (root `AGENTS.md`):
1. Per-conversation prompt caching is sacred — no mid-session system-prompt/toolset changes.
2. The core is a narrow waist — capability lands at the edges (gateway method modules, plugins, skills, config), never as edits deep in `run_agent.py` / `cli.py`.
3. Cross-process turn leases in `state.db` must be honored; approvals fail closed without a registered notify callback.

## 2. Target architecture

```
User (voice / text)
  └─ Digital Partner UI (apps/desktop — redesigned in-place)
       ├─ presence + voice controller (client-derived assistant state)
       ├─ product areas: Home · Chat · Tasks · Calendar · Memory · Skills · Activity · Integrations
       └─ JSON-RPC over /api/ws  +  /api/audio/*
            └─ tui_gateway
                 ├─ existing methods (~145)
                 └─ methods_partner.py — partner.* RPC          ← new
                      ├─ hermes_cli/activity_log.py  (activity.db)  ← new
                      ├─ hermes_cli/partner_calendar.py            ← new
                      ├─ hermes_cli/kanban_db.py     (tasks)
                      ├─ cron/ (reminders, morning-brief)
                      └─ tools/memory_tool.py + write_approval.py
            └─ plugins/digital-partner/ — activity capture hooks   ← new
                 (post_tool_call, pre/post_approval, session lifecycle)
```

Three new backend pieces, all at sanctioned extension edges:
1. **`tui_gateway/methods_partner.py`** — all new RPC, namespaced `partner.*` (`HandlerRegistry` pattern; 2-line install edit in `server.py`).
2. **`plugins/digital-partner/`** — bundled plugin: best-effort activity capture via hooks; optional static (cache-safe) system-prompt section; `/partner` debug command.
3. **`hermes_cli/activity_log.py` + `hermes_cli/partner_calendar.py`** — shared implementation libraries (the `kanban_db.py` precedent), imported by both the plugin and the RPC module.

New data: **`$HERMES_HOME/activity.db`** with its own `PRAGMA user_version` ladder (the `cron/executions.py` precedent). `state.db` `SCHEMA_VERSION` stays 26 — zero migration risk; rollback = disable plugin / delete file.

New config: one pure-data **`partner:`** section in `hermes_cli/config_defaults.py`:
`enabled, voice_first, wake_word, briefing{enabled,time,deliver}, quiet_hours{enabled,start,end}, activity{enabled,retention_days}, tasks{board}, calendar{cache_seconds}`.

## 3. Frontend architecture

- **Brand layer**: `apps/desktop/src/brand.ts` + `electron/brand.ts` — product name / assistant name / tagline / mark asset. i18n strings use a `{brand}` token interpolated once per (locale, brand) in `src/i18n/context.tsx`; engine-truth strings ("Hermes background process exited", "Hermes Cloud") stay literal. 5 locales: en, ja, zh, zh-hant, ar (RTL).
- **IA**: labeled collapsible rail — Home / Chat / Tasks / Calendar / Memory / Skills / Activity / Integrations, Settings at bottom. New areas are core `APP_ROUTES` (static path reservation required by session-id parsing); the contribution registry remains the plugin seam. Demotions (nothing deleted): starmap → Memory "Graph view"; messaging + webhooks → Integrations tabs; artifacts + command-center → Activity + palette; cron → Tasks "Automations"; profiles/agents → Settings; pet → Settings→Appearance.
- **Home**: greeting, presence hero + Talk/Type CTAs, cards backed by real data (active work, tasks, automations, recent activity); schedule/priorities are honest stubs until the calendar RPC lands.
- **Presence**: `$presence` computed atom (idle | listening | transcribing | thinking | executing | speaking | error), derived client-side from voice/wake events, working-session stores and playback state. Rendered by a layered CSS/SVG orb (transform/opacity only; optional 2D-canvas level ring; static under reduced motion) in hero / compact / micro sizes. Not WebGL.
- **Voice-first**: the existing `use-voice-conversation` state machine is lifted into a shared controller + store so composer, voice overlay, orb and titlebar read one instance. Full-window voice overlay with live transcript, barge-in hint, rebindable hotkey, wake-word entry (no focus stealing).
- **Conversation**: extend `@assistant-ui` components (never fork): tool-call activity clusters with expandable detail; redesigned approval cards with risk badges.
- **Design contract**: `apps/desktop/DESIGN.md` remains authoritative; its IA section and named-contract entries are amended with every phase that touches them.

## 4. Data & API surface (new)

| RPC | Backing |
| --- | --- |
| `partner.activity.list / since` | `activity_log.py` → `activity.db` (`activity_events`: ts, session_id, turn_id, tool_call_id, kind, tool, summary, target, status, risk, approval_request_id, duration_ms, meta) |
| `partner.tasks.list / create / update / move / complete / delete / remind` | `kanban_db.py`, pinned lazily-created `personal` board; reminders = cron one-shot jobs (job_id in task metadata) |
| `partner.calendar.status / agenda` | `partner_calendar.py` → google-workspace skill token (status = token+scope presence, no network; agenda = REST with refreshed bearer, 10 s timeout, 60–300 s cache, honest `not_connected` on failure) |
| `partner.briefing.latest / configure` | `morning-brief` cron blueprint + `cron/executions.py` (fallback: `attach_to_session` into a hidden session) |
| `partner.memory.list / edit / pending / resolve` | `MemoryStore` (§ entries, apply_batch, drift detection) + `write_approval` pending queue |

Plus one additive field: `risk` in approval_data dicts (`tools/approval.py`) — display-only.

## 5. Roadmap (each phase leaves `hermes gui` launchable)

- **A — Brand layer**: blueprint doc, `brand.ts`, `{brand}` i18n sweep + interpolation, BrandMark asset param. No visual change.
- **B — Routes + rail**: six new core routes with placeholder pages; new nav rail; sidebar flip; demotions; DESIGN.md IA amendment.
- **C — Home**: real cards + honest stubs; cold-start lands on `/home`.
- **D — Presence + voice**: `$presence`, orb, voice controller extraction, voice overlay, hotkey/wake entries.
- **E — Backend product layer**: `methods_partner.py`, `partner:` config, activity capture plugin + DB, tasks/calendar/briefing/memory RPC, approval `risk` field.
- **F — Product pages**: Tasks (kanban promotion), Memory, Activity, Calendar, Integrations.
- **G — Polish**: activity clusters in transcript, approval card redesign, settings reorg, titlebar presence, a11y/RTL/reduced-motion pass.

## VISUAL ART DIRECTION

> The direction extends the existing architecture — the seed-driven theme engine (`--theme-*` seeds
> color-mixed into `--ui-*` fills/strokes), the radius-scalar system, `shadow-nous`, the one-primitive-
> per-concern contract in `apps/desktop/DESIGN.md` — rather than fighting it. The product look ships as
> a new default theme preset (**"Horizon"**, in `src/themes/presets.ts`) plus a small set of new tokens.
> Everything below respects DESIGN.md's durable principles (flat not boxed, tokens not literals,
> borderless elevation, motion follows state).

### Design thesis

The partner is tied to the rhythm of your day — it greets you in the morning, briefs you, works
beside you, closes your evening. The visual identity is built on that: a **near-monochrome, warm
graphite interface with exactly one living element** — the assistant's presence, drawn in a
signature two-stop "horizon" gradient (dusk indigo → dawn peach). The interface is the quiet room;
the presence is the only thing in it that breathes. No neon, no glass, no decoration competing
with content.

### Signature element — the Aperture

The assistant presence is **not an orb/blob**. It is a thin luminous **ring** — an aperture — on a
dark disc: closer to an annular eclipse than to a glowing ball. It is legible from 12 px (micro,
around the mic) to 160 px (hero), renders with 2D canvas/SVG strokes (no WebGL, no blur-heavy
glow), and is the product's recognizable mark. State is expressed by ring *behavior*, never by
text alone:

| State | Ring behavior |
| --- | --- |
| idle | slow breathing (scale 0.98→1.0, ~6 s), gradient barely rotating |
| listening | ring thickness responds to live mic level (the waveform *is* the ring) |
| transcribing | ring settles, a single bright point orbits once |
| thinking | a gradient arc (~90°) rotates smoothly (~2 s/rev) |
| executing | arc rotation + discrete tick marks appear around the ring per tool call |
| speaking | soft concentric ripple emitted outward on sentence boundaries |
| waiting for approval | ring pauses, holds a steady dashed segment |
| error | ring desaturates to `--ui-orange`-mixed, static, small gap in the stroke |

Reduced motion: static ring, state shown by stroke color/dash only. The Aperture appears in three
sizes — `hero` (Home, voice overlay), `compact` (titlebar, ~16 px), `micro` (composer mic ring) —
all one component, one canvas implementation.

### Color

Defined as **Horizon** theme seeds (dark is the primary design target; light is a first-class
sibling, not an inversion):

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| ground (`--theme-background-seed`) | `#141318` warm graphite | `#F7F6F3` warm paper | window ground — never pure black/white |
| panel (`--theme-card-seed`) | `#1A191F` | `#FCFBF9` | sidebar/panel differentiation (hairline-separated, not boxed) |
| elevated (`--theme-elevated-seed`) | `#201F26` | `#FFFFFF` | floating surfaces (with `shadow-nous`) |
| ink (`--theme-foreground`) | `#E9E7E2` | `#1B1A1F` | text — warm off-tones, no #FFF/#000 text |
| accent (`--theme-primary`) | `#8B87F5` | `#5D59D8` | focus ring, selection, links, active nav — used sparingly |
| `--horizon-a` → `--horizon-b` | `#6E6AF0` → `#E9A08B` | same | **presence gradient + brand moments ONLY** — never buttons, never charts |
| semantic | existing `--ui-red/orange/yellow/green/...` | 〃 | risk badges, status — unchanged |

Rules: primary buttons are **ink-on-ground monochrome** (premium restraint — the accent is not a
button color); the horizon gradient never appears outside the Aperture, onboarding hero, and the
brand mark tile; text hierarchy comes from the existing `--ui-text-primary/secondary/tertiary`
mixes, not opacity hacks.

### Typography

Three roles, two families added to none of the hot paths:

- **UI sans** — the existing token-driven sans stack (`--dt-font-sans`), 13 px base (`text-xs`
  floor per web README rules), weights 400/500/600. Tracking normal; no uppercase except the
  existing `text-display` utility.
- **Voice serif** — **Fraunces** (SIL OFL, self-hosted woff2, optical-size axis), *italic, light
  weights only*, reserved for moments where the partner "speaks": the Home greeting, the voice
  overlay live transcript, empty-state first lines, onboarding headlines. This is the humanist
  counterpoint that keeps the product from reading as a developer console — and it is rationed:
  never in body copy, lists, buttons, or settings.
- **Mono** — JetBrains Mono (already bundled): code, terminal, paths, timestamps, keybind chips.

Hierarchy: greeting/display 28–32 px Fraunces italic → page title 15 px sans 600 → section label
12 px sans 500 `--ui-text-secondary` → body 13 px sans 400 → caption/data 11–12 px mono or sans
`--ui-text-tertiary`.

### Layout — "stage and wings"

Content lives on a centered stage; chrome recedes into quiet wings. Nav rail (wing) → stage
(max-width column) → contextual pane (wing, existing pane-shell). The stage column max-width:
~44 rem for conversation/reading surfaces, full-bleed grid for boards. Gutters via the existing
`PAGE_INSET_X`; vertical rhythm on the 4 px Tailwind scale with section steps of 24/32/48 px.
Wide content scrolls inside its own container — the stage never scrolls horizontally.

**Nav rail proportions**: expanded 15 rem (icon 18 px + 13 px label, 32 px row height, 8 px row
radius on the active pill); collapsed 3.25 rem (icon-only, `Tip` labels). Active item: accent-tinted
pill (`--theme-row-active-accent-mix`), not a left border. Rail bottom: Settings + profile chip.
Titlebar stays at its current height with the compact Aperture on the right cluster.

### Surfaces, borders, radius

Three elevations only: **ground** (page), **panel** (hairline `--ui-stroke-tertiary` separation,
same-ground or panel seed), **floating** (`shadow-nous` + `--stroke-nous` hairline, no hard
border). No card-in-card, no drop shadows on in-flow content. Radius language via the existing
`--radius-scalar`: controls 4 px, pills/rows 8 px, floating panels 10–12 px, the Aperture is the
only perfect circle. Text buttons stay square (existing contract).

### Background treatment

Flat seed color. The single permitted atmosphere: an extremely faint radial tint (≤3% horizon-a
mix) behind the Home hero and voice overlay, static, token-driven (`--presence-atmosphere`) —
removed under reduced-transparency/contrast preferences. No noise textures, no mesh gradients,
no animated backgrounds.

### Iconography

Existing contract holds: **Tabler** (via `src/lib/icons.ts` aliases) for chrome/components,
**Codicon** for compact editor/tool/status vocabulary. Stroke width 1.5, `iconSize` scale.
No third set, no filled/outline mixing within a control group. The Aperture replaces decorative
sparkles/stars everywhere ("AI" glyphs are banned); `BrandMark` keeps its white tile for
about/updates.

### Motion

Motion communicates state; it never delays it. Controls 100 ms; panel/overlay enter 160–200 ms
(opacity + 4 px translate — no scale-pop); orchestrated moments (voice overlay open, onboarding)
300–450 ms staggered. Only `transform`/`opacity` animate; named properties, never
`transition-all` on hot paths. Continuous animation exists only inside the Aperture, and it
registers with the existing `data-renderer-animations-paused` machinery so a backgrounded window
goes fully still. Blanket reduced-motion kill-switch already in `styles.css` applies.

### Voice mode composition

Full-window quiet stage: ground dims to ~92% (no blur), hero Aperture centered at the upper
third, live transcript beneath it in Fraunces italic (single line, character-faded entry),
recognized→final text transitions from `--ui-text-tertiary` to primary ink. Bottom edge: mute,
stop, and keybind hint in quiet `text` buttons. Barge-in hint appears only while speaking
("speak to interrupt"). Esc follows the single-cancel rule.

### Tool execution visuals

Compact activity clusters in the transcript: one 28 px row per tool group — Codicon glyph +
verb-first summary ("Searching files… → Found 7") + elapsed mono timestamp — collapsed by
default, expandable to the existing detailed tool cards (`LogView` for raw output). Running rows
get a 2 px indeterminate hairline sweep, not spinners. Inline result widgets keep
`WIDGET_SHELL_CLASS`. The Aperture's executing tick-marks mirror the cluster count, connecting
presence to work.

### Approval cards

The one deliberately *heavy* moment in the interface — a decision should feel like a threshold.
Floating treatment (`shadow-nous`) even inline: risk badge (semantic color + label:
Caution/Dangerous) top-left, intent sentence in primary ink ("Send this email to Alex?"),
the exact command/diff/recipient in `LogView`, consequence line in secondary text ("This runs in
your home directory · can be undone"), then Allow once / Always allow / Deny — Deny is
`secondary`, Allow once is the focused default, keyboard-first (Enter/Esc/A). While a decision is
pending the Aperture holds its dashed-segment state everywhere it is visible.

### Loading / empty / error states

- **Loading**: the existing `Loader` (animated math/ascii curves) is already distinctive — it
  stays the product's loader. Skeletons only for row lists; never the text "Loading…".
- **Empty**: an invitation, not an apology — first line in Fraunces italic voice ("Nothing on
  your plate today."), one plain-verb action button, micro Aperture as the glyph instead of a
  gray icon. `EmptyState`/`PanelEmpty` primitives extended, not forked.
- **Error**: `ErrorState` + canonical `ErrorIcon`; copy states cause → effect → recovery ("Can't
  reach your calendar. Your Google connection needs to be renewed. → Reconnect"). Never a bare
  code; distinguishes network/provider/permission per the error taxonomy.

### Light & dark

Dark is designed first; light is re-seeded, not inverted — warm paper ground, same hairline
logic, `shadow-nous` weights already adapt via `color-mix` on foreground. Both ship in the
Horizon preset; the theme engine's existing mode plumbing (`.dark` variant, skin sync) is
unchanged. Every new surface is checked in both modes plus `ar` RTL before a phase closes.

### Desktop window composition

The window reads as one seamless surface: titlebar shares the ground color (no separate chrome
band), traffic-light/window controls per platform convention, rail and stage separated by a
single hairline. Quick-entry and wake-indicator satellite windows adopt the same ground + Aperture
so every surface of the product is recognizable at a glance. Translucency stays behind its
existing setting (off by default for the flat look).

### Token deliverables (Phase B/D)

`--presence-*` (ring stroke, atmosphere, state mixes), `--horizon-a/b`, Horizon preset seeds in
`src/themes/presets.ts`, Fraunces `@font-face` + `--font-voice` token, nav-rail dimension tokens.
Each lands with its named-contract entry in `apps/desktop/DESIGN.md` in the same change.

## 6. Risks

1. Chat-sidebar nav flip (1,870-line coupled file) — build the rail in parallel, flip as an isolated step.
2. i18n sweep breadth — mechanical `{brand}` token substitution; engine-vs-product triage done in `en.ts`, mirrored to the other four locales.
3. Voice controller extraction — composer behavior must remain identical; existing hook tests stay green.
4. Briefing output persistence — verify `cron/executions.py` stores agent output; documented session fallback otherwise.
5. Electron `productName` change moves userData dirs — deferred until final branding (documented, deliberate).

## 7. Testing strategy

- Frontend: `cd apps/desktop && npm run typecheck && npm run lint && npm run test` per phase; `npm run check` at phase-final. Watchdogs: `no-native-title.test.ts`, `hermes-parity.test.ts`, `routes.workspace-reveal.test.ts`.
- Python: `scripts/run_tests.sh` (never bare pytest) over new `tests/partner/`, plugin hook tests, `methods_partner` handler tests modeled on `tests/test_tui_gateway_server.py`.
- Manual per phase: launch `hermes gui`; boot → connect; demoted routes reachable; voice round-trip (mic → transcribe → respond → speak → barge-in); locale spot-check incl. `ar` RTL; reduced-motion orb.

## 8. Deployment

No deployment-model change: the product ships as the existing desktop app (`hermes gui` / packaged builds via `npm run dist:*`), backend spawned per-machine as today. Remote-gateway and profile support are unchanged.

## 9. Out of scope (for this transformation)

Full-duplex realtime voice (turn-based conversation stays; realtime is a future engine track), multi-user accounts, mobile clients, final brand name/logo, Electron `productName` migration, structured email client UI.
