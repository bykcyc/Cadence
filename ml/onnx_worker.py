"""Lightweight ONNX ASR worker for Cadence — Parakeet TDT v3 via onnx-asr (no PyTorch/NeMo).

A drop-in alternative to worker.py's /transcribe: same response contract
({text, words:[{start,end,word}], segments:[{start,end,text}]}), but streamed as NDJSON
({"type":"progress","value":0..1} ... {"type":"result","data":{...}}) so Electron can show a real
progress bar. Runs on onnxruntime: CPU by default (installs tiny, no torch), or CUDA when launched
with `--device gpu` — then it wires the nvidia-*-cu12 CUDA/cuDNN wheels for ~7x faster transcription.
Diarization stays in worker.py (pyannote needs torch).

Input audio must be 16 kHz mono WAV (Electron resamples with ffmpeg before calling).
"""
import os
import sys

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# Electron picks the device with `--device cpu|gpu`. We detect it here (before importing
# onnxruntime) because the GPU path must put the CUDA/cuDNN DLLs on the search path FIRST.
WANT_GPU = "gpu" in sys.argv


def _wire_cuda_dlls():
    """Make onnxruntime-gpu's CUDA + cuDNN DLLs (shipped by the nvidia-*-cu12 wheels installed in
    this venv) loadable. MUST run before `import onnxruntime`. Explicit add_dll_directory is
    required — onnxruntime.preload_dlls() binds CUDA but leaves the cuDNN convolutions on a slow
    CPU fallback (measured ~11 s vs ~1.5 s per 120 s chunk)."""
    import glob
    import site

    roots = list(site.getsitepackages())
    if getattr(sys, "prefix", None):
        roots.append(os.path.join(sys.prefix, "Lib", "site-packages"))
    added = []
    for root in roots:
        for d in glob.glob(os.path.join(root, "nvidia", "*", "bin")):
            if os.path.isdir(d) and d not in added:
                try:
                    os.add_dll_directory(d)
                    os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
                    added.append(d)
                except OSError:
                    pass
    return added


if WANT_GPU:
    _CUDA_DIRS = _wire_cuda_dlls()
    print(f"[onnx-worker] wired {len(_CUDA_DIRS)} CUDA dll dir(s)", flush=True)

import argparse
import gc
import json
import logging
import math
import re
import tempfile
import threading
import wave
from typing import Optional

import onnx_asr
import onnxruntime as ort  # noqa: F401  (kept for parity / provider introspection)
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.WARNING)

ASR_MODEL = os.environ.get("PARAKEET_ONNX_MODEL", "nemo-parakeet-tdt-0.6b-v3")
ASR_CHUNK_SECONDS = float(os.environ.get("ASR_CHUNK_SECONDS", "120"))
PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"] if WANT_GPU else ["CPUExecutionProvider"]
# Resolved when the model loads — CUDA can be requested but still fall back to CPU (no driver, etc.).
_device = "cuda" if WANT_GPU else "cpu"

_asr = None
_asr_lock = threading.Lock()
_asr_error: Optional[str] = None


def _find_sessions(obj, seen=None, depth=0):
    """Collect the onnxruntime InferenceSession objects nested inside an onnx-asr model so we can
    read which providers actually bound (CUDA vs a CPU fall-back)."""
    out = []
    if seen is None:
        seen = set()
    if depth > 4 or id(obj) in seen:
        return out
    seen.add(id(obj))
    if hasattr(obj, "get_providers"):
        out.append(obj)
    for v in (getattr(obj, "__dict__", {}) or {}).values():
        out += _find_sessions(v, seen, depth + 1)
    return out


def get_asr():
    """Load the Parakeet ONNX model (with token-level timestamps), once, thread-safe. On the GPU
    path, resolves the actual device from the sessions (CUDA may fall back to CPU silently)."""
    global _asr, _asr_error, _device
    if _asr is not None:
        return _asr
    with _asr_lock:
        if _asr is None:
            try:
                try:
                    m = onnx_asr.load_model(ASR_MODEL, providers=PROVIDERS).with_timestamps()
                except TypeError:  # older onnx-asr without a providers kwarg
                    m = onnx_asr.load_model(ASR_MODEL).with_timestamps()
                if WANT_GPU:
                    on_cuda = any(
                        "CUDAExecutionProvider" in s.get_providers() for s in _find_sessions(m)
                    )
                    _device = "cuda" if on_cuda else "cpu"
                    print(f"[onnx-worker] model loaded, device={_device}", flush=True)
                _asr = m
            except Exception as e:  # noqa: BLE001
                _asr_error = str(e)
                raise
    return _asr


app = FastAPI(title="Cadence ONNX ASR worker")


class TranscribeReq(BaseModel):
    audio_path: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": _device,
        "asr_model": ASR_MODEL,
        "asr_loaded": _asr is not None,
        "asr_error": _asr_error,
        "diar_loaded": False,  # diarization is not supported here (use the NeMo worker)
    }


@app.post("/warmup")
def warmup():
    get_asr()
    return {"ok": True, "device": _device}


def _reconstruct_words(result, offset: float):
    """onnx-asr returns token-level (subword) timestamps; rebuild word-level {start,end,word}.
    A new word begins at a token that starts with a space (SentencePiece word marker)."""
    tokens = list(getattr(result, "tokens", []) or [])
    stamps = list(getattr(result, "timestamps", []) or [])
    groups = []
    cur = None
    for tok, ts in zip(tokens, stamps):
        if cur is None or tok.startswith(" "):
            if cur:
                groups.append(cur)
            cur = {"start": float(ts), "end": float(ts), "toks": [tok]}
        else:
            cur["toks"].append(tok)
            cur["end"] = float(ts)
    if cur:
        groups.append(cur)
    words = []
    for i, g in enumerate(groups):
        text = "".join(g["toks"]).strip()
        if not text:
            continue
        start = g["start"] + offset
        end = (groups[i + 1]["start"] if i + 1 < len(groups) else g["end"] + 0.3) + offset
        words.append({"start": round(start, 2), "end": round(end, 2), "word": text})
    return words


def _to_segments(words):
    """Group words into segments at sentence-ending punctuation or a >1.5 s pause."""
    segments, buf = [], []

    def flush():
        if buf:
            segments.append(
                {
                    "start": buf[0]["start"],
                    "end": buf[-1]["end"],
                    "text": " ".join(w["word"] for w in buf),
                }
            )

    for w in words:
        if buf and w["start"] - buf[-1]["end"] > 1.5:
            flush()
            buf = []
        buf.append(w)
        if re.search(r"[.!?…]$", w["word"]):
            flush()
            buf = []
    flush()
    return segments


def _transcribe_stream(model, audio_path: str):
    """Yield NDJSON lines: {"type":"progress","value":0..1} per chunk, then a final
    {"type":"result","data":{text,words,segments}}. The Electron side reads this stream
    to drive a real percentage bar (CPU transcription is slow enough to warrant one)."""
    try:
        try:
            with wave.open(audio_path, "rb") as w:
                sr = w.getframerate()
                nframes = w.getnframes()
                nchan = w.getnchannels()
                sampwidth = w.getsampwidth()
                raw = w.readframes(nframes)
        except Exception as e:  # noqa: BLE001 — not a readable PCM WAV; let the model try the path
            logging.warning("wav read failed (%s); single-pass", e)
            try:
                r = model.recognize(audio_path)
                words = _reconstruct_words(r, 0.0)
                yield json.dumps({"type": "progress", "value": 1.0}) + "\n"
                yield json.dumps(
                    {"type": "result", "data": {"text": getattr(r, "text", "") or "", "words": words, "segments": _to_segments(words)}}
                ) + "\n"
            except Exception as e2:  # noqa: BLE001
                logging.warning("transcribe failed: %s", e2)
                yield json.dumps({"type": "result", "data": {"text": "", "words": [], "segments": []}}) + "\n"
            return

        # Chunk long audio so the O(n^2) Conformer encoder fits in memory. onnx-asr has no
        # back-to-back-call crash (unlike NeMo), so a simple per-chunk recognize loop is safe.
        bytes_per_frame = nchan * sampwidth
        frames_per_chunk = int(ASR_CHUNK_SECONDS * sr)
        n_chunks = max(1, math.ceil(nframes / float(frames_per_chunk)))
        all_text, all_words = [], []
        for i in range(n_chunks):
            a = i * frames_per_chunk
            b = min((i + 1) * frames_per_chunk, nframes)
            if b <= a:
                continue
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp.close()
            try:
                with wave.open(tmp.name, "wb") as out:
                    out.setnchannels(nchan)
                    out.setsampwidth(sampwidth)
                    out.setframerate(sr)
                    out.writeframes(raw[a * bytes_per_frame : b * bytes_per_frame])
                print(f"[transcribe] chunk {i + 1}/{n_chunks}", flush=True)
                r = model.recognize(tmp.name)
                text = getattr(r, "text", "") or ""
                if text:
                    all_text.append(text)
                all_words.extend(_reconstruct_words(r, i * ASR_CHUNK_SECONDS))
                # Reclaim onnxruntime's per-call buffers each chunk — without this the worker grows
                # and dies partway through a long (e.g. 84-min / 42-chunk) file.
                del r
                gc.collect()
            except Exception as e:  # noqa: BLE001
                logging.warning("transcribe chunk %d failed: %s", i + 1, e)
            finally:
                try:
                    os.remove(tmp.name)
                except OSError:
                    pass
            yield json.dumps({"type": "progress", "value": round((i + 1) / n_chunks, 4)}) + "\n"
        yield json.dumps(
            {"type": "result", "data": {"text": " ".join(all_text), "words": all_words, "segments": _to_segments(all_words)}}
        ) + "\n"
    except Exception as e:  # noqa: BLE001 — surface as a stream error line so the client can react
        logging.warning("transcribe stream failed: %s", e)
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"


@app.post("/transcribe")
def transcribe(req: TranscribeReq):
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=400, detail=f"audio not found: {req.audio_path}")
    model = get_asr()
    return StreamingResponse(
        _transcribe_stream(model, req.audio_path), media_type="application/x-ndjson"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--device", default="cpu", choices=["cpu", "gpu"], help="cpu or gpu (CUDA)")
    parser.add_argument("--warmup", action="store_true", help="load ASR model at startup")
    args = parser.parse_args()

    if args.warmup:
        threading.Thread(target=lambda: get_asr(), daemon=True).start()

    print(
        f"[onnx-worker] starting on {args.host}:{args.port} device={_device} (requested {args.device})",
        flush=True,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
