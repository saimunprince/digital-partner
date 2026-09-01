"""Resolve the active profile's STT/TTS config for CLIENT-DIRECT voice.

The desktop app can cut the audio relay hop (mic → gateway → provider and
provider → gateway → speaker) by calling the voice providers directly with
the profile's own credentials, fetched over the authenticated REST channel
at voice-session start. This module is the single resolver behind
``GET /api/audio/voice-config``: it reuses the exact provider/key/model/
language resolution chains ``tools.transcription_tools`` and
``tools.tts_tool`` use, so what the client receives is byte-for-byte what
the gateway itself would use for the same request.

Design rules:

* **Same-trust boundary.** The endpoint is profile-scoped and rides the
  same auth as every other REST route. A client that can reach it can
  already drive the agent (terminal included), so handing it the voice
  key is not a privilege escalation — but keys still never touch client
  disk (the desktop holds them in renderer memory only) and are never
  logged here.
* **Relay is the floor, not an error.** Providers that can only run on
  the gateway host (local whisper, edge-tts, command providers, plugins)
  resolve to ``{"mode": "relay"}`` and the desktop falls back to the
  existing ``/api/audio/*`` relay endpoints. A resolution failure also
  degrades to relay — the relay endpoint will surface the real error.
* **No new key stores.** Everything is read through the live resolvers;
  nothing is persisted anywhere new.

Config gate: ``voice.client_direct`` (config.yaml, default ``true``).
When false every provider reports relay and the desktop behaves exactly
as before this feature.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Wire shapes the desktop knows how to speak. Anything else → relay.
#   openai-multipart : POST {base_url}/audio/transcriptions (multipart, Bearer)
#   xai-stt          : POST {base_url}/stt (multipart, Bearer, format=true)
#   elevenlabs-stt   : POST {base_url}/speech-to-text (multipart, xi-api-key)
#   openai-speech    : POST {base_url}/audio/speech (JSON, Bearer) → audio bytes
#   elevenlabs-tts   : POST {base_url}/text-to-speech/{voice_id} (JSON, xi-api-key)
STT_WIRE_OPENAI = "openai-multipart"
STT_WIRE_XAI = "xai-stt"
STT_WIRE_ELEVENLABS = "elevenlabs-stt"
TTS_WIRE_OPENAI = "openai-speech"
TTS_WIRE_ELEVENLABS = "elevenlabs-tts"

_RELAY: Dict[str, Any] = {"mode": "relay"}


def _client_direct_enabled() -> bool:
    try:
        from hermes_cli.config import load_config

        voice_cfg = load_config().get("voice") or {}
        if not isinstance(voice_cfg, dict):
            return True
        value = voice_cfg.get("client_direct", True)
    except Exception:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}
    return True


def _relay(reason: str) -> Dict[str, Any]:
    """A relay verdict that tells the client (and logs) WHY, without secrets."""
    return {"mode": "relay", "reason": reason}


# ---------------------------------------------------------------------------
# Live (speech-to-speech)
# ---------------------------------------------------------------------------

#: The one wire shape the desktop knows how to speak for a live session.
#: Gemini's bidiGenerateContent: a WebSocket carrying PCM both ways, the
#: model's own turn detection, and function calls back to the caller.
LIVE_WIRE_GEMINI = "gemini-bidi"

#: Default backend. Measured against the alternative on this account:
#: 0.70s to first audio and steady (0.66/0.70/0.71) versus 2.08s and swinging
#: (1.62-3.17) for gemini-2.5-flash-native-audio. Latency IS the feature here,
#: so the steadier one wins; `voice.live.model` overrides it.
DEFAULT_LIVE_MODEL = "models/gemini-3.1-flash-live-preview"

_GEMINI_LIVE_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)


def _live_section() -> Dict[str, Any]:
    from hermes_cli.config import load_config

    voice_cfg = load_config().get("voice") or {}
    section = voice_cfg.get("live") if isinstance(voice_cfg, dict) else None

    return section if isinstance(section, dict) else {}


def _resolve_live_client_config() -> Dict[str, Any]:
    """Resolve the speech-to-speech session, or say why it is unavailable.

    Same shape and same trust boundary as the STT/TTS resolvers above: the
    key travels to an already-authenticated client that can drive the agent,
    and is held in client memory only.

    Unavailable is the normal answer. The four-stage path is what runs when
    this returns ``off``, and it is not a degraded mode — it is the mode this
    product shipped with.
    """
    section = _live_section()

    if section.get("enabled") is not True:
        return {"mode": "off", "reason": "voice.live.enabled is false"}

    from tools import tts_tool

    # Same env var and resolution order the rest of the Gemini surface uses,
    # so a key that works anywhere works here.
    api_key = tts_tool._resolve_provider_key("GEMINI_API_KEY", "gemini")

    if not api_key:
        return {"mode": "off", "reason": "no credentials"}

    def _text(key: str, fallback: str = "") -> str:
        value = section.get(key)

        return value.strip() if isinstance(value, str) and value.strip() else fallback

    return {
        "mode": "direct",
        "wire": LIVE_WIRE_GEMINI,
        "provider": "gemini",
        "url": _GEMINI_LIVE_URL,
        "api_key": api_key,
        "model": _text("model", DEFAULT_LIVE_MODEL),
        # Empty means "the provider decides" for both — a voice we do not name
        # is the provider's default, and a language we do not pin lets the
        # model follow whichever the speaker used, which is the point for
        # someone who switches mid-sentence.
        "voice": _text("voice"),
        "language": _text("language"),
    }


# ---------------------------------------------------------------------------
# STT
# ---------------------------------------------------------------------------


def _resolve_stt_client_config() -> Dict[str, Any]:
    from tools import transcription_tools as tt

    stt_config = tt._load_stt_config()
    if not tt.is_stt_enabled(stt_config):
        return _relay("stt disabled")

    provider = tt._get_provider(stt_config)

    # Server-host-only providers: local whisper, the env-var command escape
    # hatch, declared command providers, and anything plugin-registered.
    if tt._is_local_stt_provider(provider, stt_config):
        return _relay("local provider")
    if provider not in tt.BUILTIN_STT_PROVIDERS:
        return _relay("command/plugin provider")

    language = tt._resolve_stt_language(
        provider, stt_config,
        extra_keys=("language_code",) if provider == "elevenlabs" else (),
    )
    section = stt_config.get(provider) if isinstance(stt_config, dict) else None
    section = section if isinstance(section, dict) else {}

    if provider == "groq":
        api_key = tt._resolve_provider_key("GROQ_API_KEY", "groq")
        if not api_key:
            return _relay("no credentials")
        return {
            "mode": "direct",
            "wire": STT_WIRE_OPENAI,
            "provider": "groq",
            "base_url": tt.GROQ_BASE_URL,
            "api_key": api_key,
            "model": section.get("model") or tt.DEFAULT_GROQ_STT_MODEL,
            "language": language,
        }

    if provider == "openai":
        # Handles the Nous-managed selection too: the resolver returns the
        # user's own gateway token + managed base URL, which is exactly the
        # credential the client should use.
        try:
            api_key, base_url = tt._resolve_openai_audio_client_config()
        except ValueError as exc:
            return _relay(f"openai resolution failed: {exc}")
        return {
            "mode": "direct",
            "wire": STT_WIRE_OPENAI,
            "provider": "openai",
            "base_url": base_url,
            "api_key": api_key,
            "model": section.get("model") or tt.DEFAULT_STT_MODEL,
            "language": language,
        }

    if provider == "mistral":
        api_key = tt._resolve_provider_key("MISTRAL_API_KEY", "mistral")
        if not api_key:
            return _relay("no credentials")
        return {
            "mode": "direct",
            "wire": STT_WIRE_OPENAI,
            "provider": "mistral",
            "base_url": "https://api.mistral.ai/v1",
            "api_key": api_key,
            "model": section.get("model") or tt.DEFAULT_MISTRAL_STT_MODEL,
            "language": language,
        }

    if provider == "xai":
        # API key only. An xAI OAuth bearer refreshes server-side mid-session;
        # handing it out strands the client on the first 401. Relay instead.
        api_key = str(tt.get_env_value("XAI_API_KEY") or "").strip()
        if not api_key:
            return _relay("xai oauth (server-managed) or no credentials")
        base_url = str(
            section.get("base_url")
            or tt.get_env_value("XAI_STT_BASE_URL")
            or tt.XAI_STT_BASE_URL
        ).strip().rstrip("/")
        return {
            "mode": "direct",
            "wire": STT_WIRE_XAI,
            "provider": "xai",
            "base_url": base_url,
            "api_key": api_key,
            "model": None,
            "language": language,
        }

    if provider == "elevenlabs":
        api_key = tt._resolve_provider_key("ELEVENLABS_API_KEY", "elevenlabs")
        if not api_key:
            return _relay("no credentials")
        base_url = str(
            section.get("base_url")
            or tt.get_env_value("ELEVENLABS_STT_BASE_URL")
            or tt.ELEVENLABS_STT_BASE_URL
        ).strip().rstrip("/")
        return {
            "mode": "direct",
            "wire": STT_WIRE_ELEVENLABS,
            "provider": "elevenlabs",
            "base_url": base_url,
            "api_key": api_key,
            "model": section.get("model") or tt.DEFAULT_ELEVENLABS_STT_MODEL,
            "language": language,
        }

    if provider == "deepinfra":
        api_key = tt._resolve_provider_key("DEEPINFRA_API_KEY", "deepinfra")
        if not api_key:
            return _relay("no credentials")
        from hermes_cli.models import deepinfra_base_url, deepinfra_model_ids

        model = section.get("model")
        if not model:
            candidates = deepinfra_model_ids("stt")
            model = candidates[0] if candidates else None
        if not model:
            return _relay("no deepinfra stt model")
        return {
            "mode": "direct",
            "wire": STT_WIRE_OPENAI,
            "provider": "deepinfra",
            "base_url": deepinfra_base_url(section),
            "api_key": api_key,
            "model": model,
            "language": language,
        }

    return _relay(f"provider {provider!r} has no client wire")


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------


def _resolve_tts_client_config() -> Dict[str, Any]:
    from tools import tts_tool as tts

    tts_config = tts._load_tts_config()
    provider = tts._get_provider(tts_config)

    if provider not in tts.BUILTIN_TTS_PROVIDERS:
        return _relay("command/plugin provider")

    if provider == "openai":
        # Covers the direct-key, custom-base_url, and Nous-managed selections.
        try:
            api_key, base_url, is_managed = tts._resolve_openai_audio_client_config()
        except ValueError as exc:
            return _relay(f"openai resolution failed: {exc}")
        oai = tts_config.get("openai") if isinstance(tts_config, dict) else None
        oai = oai if isinstance(oai, dict) else {}
        model = oai.get("model") or tts.DEFAULT_OPENAI_MODEL
        config_base = oai.get("base_url")
        if config_base:
            base_url = config_base
        # The managed gateway only proxies MANAGED_OPENAI_TTS_MODELS — same
        # coercion text_to_speech applies server-side.
        if is_managed and not config_base and model not in tts.MANAGED_OPENAI_TTS_MODELS:
            model = tts.DEFAULT_OPENAI_MODEL
        speed_default = tts_config.get("speed", 1.0) if isinstance(tts_config, dict) else 1.0
        try:
            speed = float(oai.get("speed", speed_default))
        except (TypeError, ValueError):
            speed = 1.0
        return {
            "mode": "direct",
            "wire": TTS_WIRE_OPENAI,
            "provider": "openai",
            "base_url": base_url,
            "api_key": api_key,
            "model": model,
            "voice": oai.get("voice") or tts.DEFAULT_OPENAI_VOICE,
            "speed": speed,
        }

    if provider == "elevenlabs":
        api_key = tts._resolve_provider_key("ELEVENLABS_API_KEY", "elevenlabs")
        if not api_key:
            return _relay("no credentials")
        el = tts_config.get("elevenlabs") if isinstance(tts_config, dict) else None
        el = el if isinstance(el, dict) else {}
        return {
            "mode": "direct",
            "wire": TTS_WIRE_ELEVENLABS,
            "provider": "elevenlabs",
            "base_url": str(el.get("base_url") or "https://api.elevenlabs.io/v1").rstrip("/"),
            "api_key": api_key,
            "model": el.get("model_id") or tts.DEFAULT_ELEVENLABS_MODEL_ID,
            "voice": el.get("voice_id") or tts.DEFAULT_ELEVENLABS_VOICE_ID,
            "speed": None,
        }

    if provider == "deepinfra":
        api_key = tts._resolve_provider_key("DEEPINFRA_API_KEY", "deepinfra")
        if not api_key:
            return _relay("no credentials")
        from hermes_cli.models import deepinfra_base_url, deepinfra_model_ids

        di = tts_config.get("deepinfra") if isinstance(tts_config, dict) else None
        di = di if isinstance(di, dict) else {}
        model = di.get("model")
        if not model:
            candidates = deepinfra_model_ids("tts")
            model = candidates[0] if candidates else None
        if not model:
            return _relay("no deepinfra tts model")
        return {
            "mode": "direct",
            "wire": TTS_WIRE_OPENAI,
            "provider": "deepinfra",
            "base_url": deepinfra_base_url(di),
            "api_key": api_key,
            "model": model,
            "voice": di.get("voice") or "af_bella",
            "speed": None,
        }

    # edge / minimax / xai / mistral / gemini / neutts / kittentts / piper:
    # either server-host-only engines or wire shapes the desktop doesn't
    # speak yet. The relay path (speak-stream WS + POST fallback) serves them.
    return _relay(f"provider {provider!r} has no client wire")


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------


def resolve_client_voice_config() -> Dict[str, Any]:
    """Resolve both directions for the CURRENT profile scope.

    Callers scope the profile via ``hermes_constants.set_hermes_home_override``
    (the web server's ``_config_profile_scope``) before calling — identical to
    how ``/api/audio/transcribe`` scopes ``transcribe_recording``.
    """
    if not _client_direct_enabled():
        disabled = _relay("voice.client_direct disabled")

        # A live session IS a direct client call, so the same switch turns it
        # off. Its "unavailable" word is `off`, not `relay`: there is no relay
        # path for speech-to-speech to fall back to.
        return {
            "stt": disabled,
            "tts": disabled,
            "live": {"mode": "off", "reason": "voice.client_direct disabled"},
        }

    try:
        stt = _resolve_stt_client_config()
    except Exception:
        logger.exception("client voice-config STT resolution failed")
        stt = _relay("resolution error")
    try:
        tts = _resolve_tts_client_config()
    except Exception:
        logger.exception("client voice-config TTS resolution failed")
        tts = _relay("resolution error")

    try:
        live = _resolve_live_client_config()
    except Exception:
        logger.exception("client voice-config live resolution failed")
        live = {"mode": "off", "reason": "resolution error"}

    return {"stt": stt, "tts": tts, "live": live}
