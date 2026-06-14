# Changelog

All notable changes to **Cadence** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.11] — 2026-06-10

### Added
- **Noise suppression before recognition (optional).** A new **Noise suppression** toggle in
  Settings → Recording cleans background noise from the audio before speech recognition — for
  **dictation** and **meeting transcription** (diarization still runs on the raw audio, since
  denoising can blur speaker cues). It uses **DPDFNet** (DeepFilterNet2 + dual-path RNN), an ONNX
  model that runs **on the CPU** (no GPU, no PyTorch); it's set up on first use. **Off by default**:
  it helps in noisy rooms but has little effect on already-clean audio (e.g. digital calls), and
  adds processing time on long meetings (~5× realtime on CPU). Apache-2.0 licensed.

## [0.2.10] — 2026-06-10

### Added
- **"✓ Saved" indicator next to the API key.** The key field saves automatically as you type (there
  is no Save button by design) — a green "✓ Saved" now appears whenever a key is stored, so you can
  be sure it persisted.

### Fixed
- **API keys are trimmed.** A key pasted from a web page often carries a trailing space or newline,
  which the provider then rejects as "invalid" (HTTP 401). Keys are now trimmed both on input and
  when sent, so a stray space no longer breaks meeting notes / dictation polish.

## [0.2.9] — 2026-06-09

### Fixed
- **Dictation now tells you when AI polish/translate was skipped.** With no LLM API key set (or if
  the call fails), dictation falls back to the raw recognized text — but it used to do so silently,
  so the result looked like the AI had just done a poor job. It now shows an alert with the reason
  (e.g. "No API key — Settings → LLM provider"). **Set an API key to actually get polished output.**

### Changed
- **Longer dictation limit (2 → 5 min)** so a long hold isn't auto-cut mid-sentence.
- **Read-aloud/dictation overlay** is more resilient — it re-syncs its state if the overlay window
  reloads, and now logs its show + on-screen position to help diagnose a missing popup.

## [0.2.8] — 2026-06-09

### Fixed
- **Dictation hotkey could get "stuck" and then fire on every keystroke.** If a global key-up was
  missed while holding the dictation hotkey (e.g. Ctrl+Space), the key stayed "pressed", and then
  any other key (Backspace, etc.) flipped the chord match — starting and stopping a dictation cycle
  on every keystroke (a burst of empty results). The hotkey now stays active only while its keys are
  actually held (extra keys are ignored instead of toggling it), and releasing the chord force-clears
  any stuck key so the next press starts clean.

## [0.2.7] — 2026-06-07

### Changed
- **Transcripts are split into sentence-sized, time-stamped lines** instead of one giant block for a
  long continuous monologue. A running utterance now also breaks at a sentence end (once it's a
  readable length), so you can scan and jump by sentence. No effect on recognition speed — it's only
  how the recognized words are grouped afterwards.

### Added
- **Read-aloud voice picker.** Settings → Read-aloud has a new **Voice** dropdown with female/male
  options per language (e.g. Russian Светлана / Дмитрий / Дарья). "Auto" keeps the per-language
  default; a chosen voice is used only when it matches the language being spoken (so an English
  passage is never read by a Russian voice).

## [0.2.6] — 2026-06-07

### Added
- **Progress bars for "By speakers" and Meeting notes** (like transcription has). Diarization now
  streams real per-step progress (segmentation → embeddings) as a live %, and notes generation
  streams the LLM response and shows a moving %. (The notes % is an estimate — an LLM call's final
  length isn't known up front — so it fills toward ~95% and snaps to 100% when the answer ends.)

### Fixed
- **Windows shows the app as "Cadence", not "Transcriber".** The Start-menu / search shortcut was
  still labelled "Transcriber"; it now matches the product name. Settings and downloaded models are
  untouched — only the display label changed.

## [0.2.5] — 2026-06-06

### Added
- **Choose the number of speakers for "By speakers".** A selector next to the button lets you pin
  the count (Auto / 2 / 3 / 4 / 5 / 6). On Auto, pyannote can over-split a 1-on-1 call into several
  "speakers" when the mic also picks up the other side (recording on speakers rather than
  headphones); setting the real number makes the result match the actual people.

## [0.2.4] — 2026-06-06

### Fixed
- **"By speakers" (diarization) no longer crashes.** On longer meetings it would spin for
  ~10 minutes and then fail with "fetch failed". Root cause: the diarization worker still
  imported NVIDIA NeMo at startup — a leftover, since speech recognition moved to ONNX back in
  0.1.9 — and pyannote transitively pulls NeMo in as well; the torch + NeMo native combination
  segfaults on Windows (a hard crash, not an out-of-memory or a slow run). The worker no longer
  touches NeMo at all, so diarization runs cleanly (verified end-to-end: an 84-minute meeting is
  diarized in ~2.5 min on an 8 GB GPU, peak ~4.3 GB).

## [0.2.3] — 2026-06-06

### Fixed
- **"Redo" on the transcript actually re-runs recognition again.** In 0.2.2 it instantly reused the
  cached result and looked like nothing happened. The ASR cache is now reused only by **"By
  speakers"** (diarization) — where skipping a second recognition pass is the whole point — while
  the plain transcript (and Redo) always re-runs ASR and refreshes the cache.
- **Meeting notes no longer fail with a timeout on long meetings.** A long transcript makes a large
  prompt; the LLM request timeout was raised (3 → 10 min) and, if it still times out, the error now
  explains the likely cause (transcript too long / slow provider) instead of a cryptic message.

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
