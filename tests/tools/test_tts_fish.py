"""Tests for the Fish Audio sync TTS provider.

Fish exists on BOTH paths: ``FishAudioStreamer`` (tools.tts_streaming) for
chunked PCM, and ``_generate_fish_tts`` here for a whole file. They are one
provider deliberately — the assistant must not change voice the moment
streaming is unavailable — so these tests pin the things that would let the
two drift: the model default, and that the pinned voice is actually sent.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class _FakeResponse:
    def __init__(self, body=b"\x00\x01", status=200):
        self.content = body
        self._status = status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def raise_for_status(self):
        if self._status != 200:
            raise RuntimeError(f"HTTP {self._status}")


@pytest.fixture
def _key(monkeypatch):
    from tools import tts_tool

    monkeypatch.setattr(tts_tool, "_resolve_provider_key", lambda env, _: "secret")


def _post_capture(captured, response=None):
    def _post(url, json=None, headers=None, timeout=None, stream=None):
        captured.update(url=url, json=json, headers=headers, stream=stream)
        return response or _FakeResponse()

    return _post


def test_fish_is_a_builtin_provider():
    """Not a builtin means the sync path cannot reach it, which is what forced
    a SECOND provider — and a second voice — into the config."""
    from tools.tts_tool import BUILTIN_TTS_PROVIDERS

    assert "fish" in BUILTIN_TTS_PROVIDERS


def test_sends_the_pinned_voice_and_free_tier_model(_key, tmp_path):
    from tools.tts_tool import _generate_fish_tts

    captured: dict = {}
    out = str(tmp_path / "out.mp3")

    with patch.dict("sys.modules", {"requests": MagicMock(post=_post_capture(captured))}):
        _generate_fish_tts("Hello sir.", out, {"fish": {"reference_id": "voice-42"}})

    assert captured["url"].endswith("/v1/tts")
    assert captured["json"]["reference_id"] == "voice-42"
    assert captured["json"]["text"] == "Hello sir."
    # Format follows the requested file, so an .mp3 request never gets PCM.
    assert captured["json"]["format"] == "mp3"
    assert captured["headers"]["Authorization"] == "Bearer secret"
    # The paid models 402 on an account with no API credit; defaulting to one
    # would make a working key look broken.
    assert captured["headers"]["model"] == "s2.1-pro-free"
    assert (tmp_path / "out.mp3").read_bytes() == b"\x00\x01"


def test_omits_reference_id_when_unset(_key, tmp_path):
    """An empty voice must not be sent as an empty string — Fish would reject
    it outright rather than falling back to its own default."""
    from tools.tts_tool import _generate_fish_tts

    captured: dict = {}

    with patch.dict("sys.modules", {"requests": MagicMock(post=_post_capture(captured))}):
        _generate_fish_tts("Hi.", str(tmp_path / "out.mp3"), {})

    assert "reference_id" not in captured["json"]


def test_honours_a_configured_model_and_format(_key, tmp_path):
    from tools.tts_tool import _generate_fish_tts

    captured: dict = {}

    with patch.dict("sys.modules", {"requests": MagicMock(post=_post_capture(captured))}):
        _generate_fish_tts("Hi.", str(tmp_path / "out.wav"), {"fish": {"model": "s1"}})

    assert captured["headers"]["model"] == "s1"
    assert captured["json"]["format"] == "wav"


def test_refuses_without_a_key(tmp_path, monkeypatch):
    from tools import tts_tool

    monkeypatch.setattr(tts_tool, "_resolve_provider_key", lambda *_: "")

    with pytest.raises(ValueError, match="FISH_API_KEY"):
        tts_tool._generate_fish_tts("Hi.", str(tmp_path / "out.mp3"), {})


def test_a_rejected_request_raises_rather_than_writing_silence(_key, tmp_path):
    """A 402 must surface. Swallowing it would leave a zero-byte file that
    plays as nothing — working-but-silent is the worst failure here."""
    from tools.tts_tool import _generate_fish_tts

    captured: dict = {}
    post = _post_capture(captured, response=_FakeResponse(status=402))

    with patch.dict("sys.modules", {"requests": MagicMock(post=post)}):
        with pytest.raises(RuntimeError):
            _generate_fish_tts("Hi.", str(tmp_path / "out.mp3"), {})
