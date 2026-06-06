# Changelog

All notable changes to **Cadence** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] — 2026-06-06

### Changed
- **"By speakers" no longer re-transcribes.** The speech-recognition result is cached per meeting,
  so adding speaker labels (or "Redo") reuses the existing transcription and only runs the
  diarization step — instead of repeating the slow ASR pass. (Speech recognition is the slow part,
  especially on CPU; diarization alone is much quicker.)

## [0.2.1] — 2026-06-06

### Changed
- **Transcription now always works on a single mixed stream** — the whole conversation on one
  timeline — instead of the mic and meeting-audio tracks separately. Splitting by track was only
  reliable with headphones; when the mic also picked up the other side it produced overlapping,
  out-of-order text. The plain **Transcript** is now one clean chronological stream. To label who
  said what, use **By speakers** (diarization), which runs on that same mixed stream. (Recording
  still keeps the separate mic/meeting tracks — for playback in the audio player.)

## [0.2.0] — 2026-06-06

### Fixed
- **Transcript now reads in the correct order.** Tracks are interleaved turn-by-turn by timestamp
  instead of shown as two big per-track blocks. And when the mic also picked up the other side
  (recording on speakers, not headphones — both tracks then contain the whole conversation), the
  transcript automatically collapses to a single chronological stream instead of a confusing
  "me answering myself" split. For true speaker separation in that case, use **By speakers**
  (diarization) or record with headphones.
- **Long transcripts scroll in a fixed window** (max height) instead of growing the page endlessly.
- **LLM model is remembered per provider.** Switching DeepSeek ↔ OpenRouter ↔ Mistral no longer
  leaves the previous provider's model behind — each keeps its own (mirrors the per-provider API keys).
- **OpenRouter model picker is discoverable.** After *Get models*, the list opens automatically and
  the field shows a ▾ chevron so it's clear you can click to choose a model.

## [0.1.9] — 2026-06-05

### Changed
- **GPU mode now runs the ONNX engine on your GPU — ~7× faster, all-ONNX.** Transcription is now a
  single engine (ONNX Parakeet) with a **CPU / GPU** switch in *Settings → Recording*. **GPU** uses
  `onnxruntime-gpu` and is ~7× faster than CPU on long meetings (an 84-min file goes from ~8 min to
  ~1 min; benchmarked on an RTX 2070 SUPER: ~1.5 s vs ~11 s per 120-s chunk). The first time you
  switch to GPU it downloads the CUDA libraries (~1.8 GB). NeMo/PyTorch is no longer used for
  transcription at all — it's kept only for **speaker diarization** ("By speakers"). Your previous
  choice is migrated automatically (lightweight → CPU, fast → GPU).
- **The progress bar now also works in GPU mode** (both CPU and GPU stream per-chunk progress).

### Fixed
- **Corrected a wrong earlier finding that "ONNX on the GPU gives no speedup."** That measurement was
  a *silent CPU fallback* — onnxruntime couldn't load CUDA (a missing `cublasLt64_12.dll`), so it
  quietly ran on the CPU and looked identical. With CUDA actually bound, ONNX on the GPU is ~7× faster.

## [0.1.8] — 2026-06-05

### Changed
- **The speech-recognition toggle is now labeled by what you get: CPU / GPU** (instead of the
  internal engine names NeMo/ONNX). **CPU** = the lightweight default — no GPU or PyTorch needed,
  great for short clips and dictation. **GPU** = much faster on long meetings, but needs an NVIDIA
  GPU and a larger one-time download. (Under the hood CPU = ONNX, GPU = NeMo; ONNX on a GPU gives no
  speedup — its decoder is CPU-bound — so the toggle exposes the choice that actually matters.)

### Added
- **A real percentage progress bar while transcribing on CPU.** The CPU engine streams its
  per-chunk progress, so long recordings show a live `0 → 100 %` bar instead of an open-ended
  spinner. (GPU transcription finishes in seconds, so it keeps a simple spinner.)

### Removed
- The "ONNX runs on the CPU" notice on the meeting view is gone — it was redundant on the default
  path. A warning now appears only in the genuinely-wrong case: **GPU** mode selected on a machine
  with no NVIDIA GPU (where it silently falls back to a slow CPU run).

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
