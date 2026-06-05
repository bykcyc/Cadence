# Changelog

All notable changes to **Cadence** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] — 2026-06-05

### Changed
- **ONNX is now the default speech-recognition engine.** New installs transcribe out of the box
  with the lightweight ONNX engine — no PyTorch/CUDA download, a much smaller and faster first-run
  setup, and none of the NeMo Windows crashes. The NeMo engine (PyTorch, GPU-accelerated, fastest
  on long meetings) is still one click away in **Settings → Recording**, and speaker diarization
  continues to use it. Existing users keep whichever engine they already selected.

### Fixed
- **ONNX no longer crashes partway through long recordings.** On long files (e.g. 84 min) the ONNX
  worker could die mid-way through ("fetch failed") because per-chunk inference buffers weren't
  released. The worker now frees them after each chunk (verified: 84 min → full transcript, 19 315
  chars / 3 203 words / 356 segments, no crash).

## [0.1.6] — 2026-06-05

### Fixed
- With the **ONNX** engine selected, the status banner now reads "ONNX runs on the CPU"
  instead of the misleading "No NVIDIA GPU detected" — CPU is the ONNX engine's design, not
  a missing GPU (the old warning only applies to the NeMo engine).

## [0.1.5] — 2026-06-05

### Added
- **Second speech-recognition engine — ONNX (lightweight).** In **Settings → Recording →
  "Speech recognition engine"** you can switch between:
  - **NeMo** (default) — Parakeet via PyTorch, most accurate, uses your NVIDIA GPU, heavy install.
  - **ONNX** — the same Parakeet v3 model via `onnx-asr`, **no PyTorch/CUDA**, installs tiny and
    runs on the CPU (~12× realtime). Same transcript quality, and it avoids the NeMo Windows
    crashes entirely. Speaker diarization still uses the NeMo engine.

## [0.1.4] — 2026-06-05

### Fixed
- **Transcription no longer fails with "fetch failed" on the second track.** The local ASR
  worker can hard-crash on a back-to-back transcribe call (a CUDA/NeMo bug on Windows — a fresh
  worker always handles its first call fine). The app now detects the dropped worker, restarts
  it, and retries the request once, so a meeting's mic + system tracks both transcribe.

## [0.1.3] — 2026-06-05

### Fixed
- **Long meetings now transcribe instead of failing.** A long recording (e.g. 84 min) was
  fed to the model in one pass → CUDA out-of-memory on smaller GPUs, producing an empty
  transcript or crashing the engine ("fetch failed"). Audio is now split into 120-second
  chunks and transcribed in a single low-memory pass (verified: 84 min → full transcript in
  ~28 s on an 8 GB GPU).
- **OpenRouter model picker is usable.** The model dropdown now scrolls and filters as you
  type (the previous list couldn't be scrolled with 300+ models).
- The Meeting-notes card shows the **currently-selected** model (updates when you switch
  provider/model), and a missing model gives a clear "No model selected" message instead of
  a cryptic provider error.

## [0.1.2] — 2026-06-05

### Fixed
- **Read-aloud / Alt hotkeys not firing.** Global hotkeys that use Alt (the default
  `Ctrl+Alt+R` read-aloud and `Ctrl+Alt+Space` dictate-and-translate) now match correctly
  when the right Alt / AltGr is used — left and right modifiers are treated as equivalent.

### Added
- **Read-aloud auto-detects the voice language** from the selected text (Cyrillic → Russian,
  CJK → Chinese/Japanese, Hangul → Korean, Arabic, Devanagari → Hindi; Latin → your default).
  A new **Voice language** setting lets you force a specific language or keep Auto-detect.
- **OpenRouter "Get models"** button in Settings: with your key entered, it fetches the list of
  available models into a searchable dropdown instead of typing the model id by hand.
- **API keys are stored per provider** — switching between DeepSeek / OpenRouter / Mistral now
  keeps each provider's key separately instead of sharing one field. Existing keys are migrated.

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

[0.1.6]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.6
[0.1.5]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.5
[0.1.4]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.4
[0.1.3]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.3
[0.1.2]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.2
[0.1.1]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.1
[0.1.0]: https://github.com/bykcyc/Cadence/releases/tag/v0.1.0
