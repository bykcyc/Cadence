# Changelog

All notable changes to **Cadence** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-06-05

### Added
- **Complete UI translations for all 14 languages.** The 12 non-English/Russian locales
  previously fell back to English for ~46 strings — the first-run onboarding, the read-aloud
  (text-to-speech) settings, the dictation translate mode, and ML/setup progress messages.
  These are now fully localized in Chinese, Spanish, French, German, Portuguese, Italian,
  Japanese, Korean, Arabic, Hindi, Turkish and Polish.

### Changed
- Added a test guard that fails if any locale drifts from the English key set.

## [0.1.0] — 2026-06-05

First public release.

### Added
- **Dual-track recording** — your microphone and the meeting/system audio captured as
  separate tracks (FLAC) plus a mixed track for playback, via WASAPI loopback (no virtual cable).
- **Local transcription** — NVIDIA Parakeet TDT v3 on your GPU.
- **Speaker diarization** — pyannote splits multiple remote speakers (optional, free Hugging Face token).
- **AI meeting notes** — summaries, action items and open questions via DeepSeek / OpenRouter / Mistral.
- **Voice dictation** — three global-hotkey modes: raw, DeepSeek-polished, and polished + translated.
- **Read aloud** — speak any selected text with Microsoft Edge neural voices (text-to-speech).
- **14 interface languages** with a language switcher.
- **Self-sufficient setup** — installs `uv`, a Python environment, PyTorch (CUDA) and the models on
  first transcription; no console, no manual steps. Aborts early with a clear message if disk is low.
- First-run onboarding, CPU-fallback warning, file logging with rotation.
- One-click NSIS installer and a no-install portable build.

### Notes
- Builds are unsigned, so Windows SmartScreen may warn on first launch (More info → Run anyway).
- An NVIDIA GPU is recommended; the app falls back to CPU, which works but is slow.

[0.1.1]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.1
[0.1.0]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.0
