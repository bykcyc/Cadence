"""Lightweight ONNX ASR worker for Cadence — Parakeet TDT v3 via onnx-asr (no PyTorch/NeMo).

A drop-in alternative to worker.py's /transcribe: same request/response contract
({text, words:[{start,end,word}], segments:[{start,end,text}]}) so the rest of the app is
unchanged. Runs on onnxruntime (CPU by default), so it installs tiny and avoids the heavy
torch venv + the NeMo-on-Windows crashes. Diarization stays in worker.py (pyannote needs torch).

Input audio must be 16 kHz mono WAV (Electron resamples with ffmpeg before calling).
"""
import os

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

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
import onnxruntime as ort
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.WARNING)

ASR_MODEL = os.environ.get("PARAKEET_ONNX_MODEL", "nemo-parakeet-tdt-0.6b-v3")
ASR_CHUNK_SECONDS = float(os.environ.get("ASR_CHUNK_SECONDS", "120"))
DEVICE = "cuda" if "CUDAExecutionProvider" in ort.get_available_providers() else "cpu"

_asr = None
_asr_lock = threading.Lock()
_asr_error: Optional[str] = None


def get_asr():
    """Load the Parakeet ONNX model (with token-level timestamps), once, thread-safe."""
    global _asr, _asr_error
    if _asr is not None:
        return _asr
    with _asr_lock:
        if _asr is None:
            try:
                _asr = onnx_asr.load_model(ASR_MODEL).with_timestamps()
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
        "device": DEVICE,
        "asr_model": ASR_MODEL,
        "asr_loaded": _asr is not None,
        "asr_error": _asr_error,
        "diar_loaded": False,  # diarization is not supported here (use the NeMo worker)
    }


@app.post("/warmup")
def warmup():
    get_asr()
    return {"ok": True, "device": DEVICE}


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
    parser.add_argument("--warmup", action="store_true", help="load ASR model at startup")
    args = parser.parse_args()

    if args.warmup:
        threading.Thread(target=lambda: get_asr(), daemon=True).start()

    print(f"[onnx-worker] starting on {args.host}:{args.port} device={DEVICE}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
