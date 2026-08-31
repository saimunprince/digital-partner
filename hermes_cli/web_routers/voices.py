"""The voice catalogue: every voice this install can actually speak in.

One normalized list across providers so the desktop can offer a single
searchable picker rather than a per-provider dropdown of hard-coded names.
Today that is 322 free Edge voices across 75 languages (no key required) plus
the Fish Audio library when a key resolves.

Only providers that would really work are listed. A voice the user can select
but the backend cannot speak is worse than one that is not offered.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

_log = logging.getLogger("hermes_cli.web_server")

router = APIRouter()

# The catalogues are remote and effectively static. Re-fetching them on every
# keystroke in the picker's search box would be a network call per character.
_CACHE_TTL_SECONDS = 15 * 60
_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}

# Fish's library is large and community-authored; this is the slice worth
# offering — the most-used voices, which are also the ones most likely to be
# stable and well-recorded.
_FISH_PAGE_SIZE = 100
_FISH_PAGES = 4


def _cached(key: str) -> Optional[List[Dict[str, Any]]]:
    hit = _cache.get(key)

    if hit and time.monotonic() - hit[0] < _CACHE_TTL_SECONDS:
        return hit[1]

    return None


def _store(key: str, voices: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    _cache[key] = (time.monotonic(), voices)

    return voices


def _edge_voices() -> List[Dict[str, Any]]:
    """Microsoft Edge's neural voices. Free, no key, 75 languages."""
    cached = _cached("edge")

    if cached is not None:
        return cached

    try:
        import asyncio

        import edge_tts

        raw = asyncio.run(edge_tts.list_voices())
    except Exception as exc:
        _log.debug("edge voice catalogue unavailable: %s", exc)
        return []

    voices = [
        {
            "id": v.get("ShortName") or "",
            "provider": "edge",
            "name": (v.get("FriendlyName") or v.get("ShortName") or "").replace(
                "Microsoft ", ""
            ).replace(" Online (Natural) - ", " · "),
            "language": v.get("Locale") or "",
            "gender": (v.get("Gender") or "").lower(),
            # Multilingual voices carry any language, which is what a Banglish
            # speaker actually wants — worth surfacing as a tag to filter on.
            "tags": ["multilingual"] if "Multilingual" in (v.get("ShortName") or "") else [],
        }
        for v in raw
        if v.get("ShortName")
    ]

    return _store("edge", voices)


def _fish_voices() -> List[Dict[str, Any]]:
    """Fish Audio's library. Needs a key; omitted entirely without one."""
    from tools.tts_streaming import _resolve_key

    api_key = _resolve_key("FISH_API_KEY", "fish") or _resolve_key("FISH_AUDIO_API_KEY", "fish")

    if not api_key:
        return []

    cached = _cached("fish")

    if cached is not None:
        return cached

    import requests

    voices: List[Dict[str, Any]] = []

    for page in range(1, _FISH_PAGES + 1):
        try:
            response = requests.get(
                "https://api.fish.audio/model",
                headers={"Authorization": f"Bearer {api_key}"},
                params={
                    "page_size": _FISH_PAGE_SIZE,
                    "page_number": page,
                    "sort_by": "task_count",
                },
                timeout=20,
            )
            response.raise_for_status()
            items = response.json().get("items") or []
        except Exception as exc:
            _log.debug("fish voice catalogue page %d failed: %s", page, exc)
            break

        if not items:
            break

        for item in items:
            languages = item.get("languages") or []
            voices.append(
                {
                    "id": item.get("_id") or "",
                    "provider": "fish",
                    "name": item.get("title") or item.get("_id") or "",
                    "language": languages[0] if languages else "",
                    # Fish's library does not record gender; the picker shows
                    # the name and a preview instead of claiming one.
                    "gender": "",
                    "tags": ["multilingual"] if len(languages) > 1 else [],
                }
            )

    return _store("fish", [v for v in voices if v["id"]])


@router.get("/api/voices")
async def list_voices(provider: Optional[str] = Query(None)):
    """Every selectable voice, normalized.

    ``{ id, provider, name, language, gender, tags }`` — the shape the desktop
    picker filters on. A provider whose catalogue cannot be reached contributes
    nothing rather than failing the whole request: losing Fish should not cost
    the user the 322 voices that need no key at all.
    """
    import asyncio

    wanted = (provider or "").strip().lower()
    voices: List[Dict[str, Any]] = []

    for name, loader in (("edge", _edge_voices), ("fish", _fish_voices)):
        if wanted and wanted != name:
            continue

        try:
            voices.extend(await asyncio.to_thread(loader))
        except Exception:
            _log.exception("voice catalogue for %s failed", name)

    return {"voices": voices}
