"""Local ML worker for Transcriber: Parakeet v3 ASR + optional pyannote diarization.

Runs as a FastAPI service on 127.0.0.1. The Electron app spawns and manages it.
Audio passed to /transcribe and /diarize must be 16 kHz mono WAV (Electron resamples
with ffmpeg before calling).
"""
import os

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")  # Windows OpenMP safety
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import argparse
import logging
import math
import tempfile
import threading
import wave
from typing import Optional

import nemo.collections.asr as nemo_asr  # import NeMo before torch (Windows DLL order)
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

logging.getLogger("nemo_logger").setLevel(logging.ERROR)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
ASR_MODEL = os.environ.get("PARAKEET_MODEL", "nvidia/parakeet-tdt-0.6b-v3")
# Long audio is transcribed in fixed-size chunks so a long meeting fits in limited VRAM.
# 120 s matches the proven-safe dictation length; tune via env if a GPU needs smaller.
ASR_CHUNK_SECONDS = float(os.environ.get("ASR_CHUNK_SECONDS", "120"))
DIAR_MODEL = os.environ.get("PYANNOTE_MODEL", "pyannote/speaker-diarization-3.1")

_asr = None
_asr_lock = threading.Lock()
_asr_error: Optional[str] = None

_diar = None
_diar_lock = threading.Lock()


def get_asr():
    global _asr, _asr_error
    if _asr is not None:
        return _asr
    with _asr_lock:
        if _asr is None:
            try:
                model = nemo_asr.models.ASRModel.from_pretrained(ASR_MODEL)
                if DEVICE == "cuda":
                    model = model.to("cuda")
                model.eval()
                _asr = model
            except Exception as e:  # noqa: BLE001
                _asr_error = str(e)
                raise
    return _asr


def get_diar(hf_token: str):
    global _diar
    if _diar is not None:
        return _diar
    with _diar_lock:
        if _diar is None:
            from pyannote.audio import Pipeline

            # Newer huggingface_hub may ignore the deprecated `use_auth_token` kwarg, but it
            # always honors these env vars for gated downloads — set both to be safe.
            if hf_token:
                os.environ["HF_TOKEN"] = hf_token
                os.environ["HUGGING_FACE_HUB_TOKEN"] = hf_token

            # PyTorch 2.6 made torch.load(weights_only=True) the default, which fails to
            # unpickle pyannote checkpoints ("TorchVersion was not an allowed global").
            # Lightning passes weights_only=True explicitly, so we FORCE it back to False
            # while loading. The models come from the official pyannote repos, so this is safe.
            _orig_load = torch.load

            def _load_full_weights(*args, **kwargs):
                kwargs["weights_only"] = False
                return _orig_load(*args, **kwargs)

            torch.load = _load_full_weights
            try:
                pipe = Pipeline.from_pretrained(DIAR_MODEL, use_auth_token=hf_token)
            finally:
                torch.load = _orig_load
            if pipe is None:
                raise RuntimeError(
                    "pyannote pipeline failed to load — check the HF token and that the "
                    f"model '{DIAR_MODEL}' license has been accepted on huggingface.co"
                )
            if DEVICE == "cuda":
                pipe.to(torch.device("cuda"))
            _diar = pipe
    return _diar


app = FastAPI(title="Cadence ML worker")


class TranscribeReq(BaseModel):
    audio_path: str


class DiarizeReq(BaseModel):
    audio_path: str
    hf_token: Optional[str] = None
    num_speakers: Optional[int] = None
    min_speakers: Optional[int] = None
    max_speakers: Optional[int] = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "asr_model": ASR_MODEL,
        "asr_loaded": _asr is not None,
        "asr_error": _asr_error,
        "diar_loaded": _diar is not None,
    }


@app.post("/warmup")
def warmup():
    get_asr()
    return {"ok": True, "device": DEVICE}


def _parse_hyp(h, offset: float):
    """Extract text + word/segment timestamps from a NeMo hypothesis, shifting times by `offset`."""
    text = getattr(h, "text", "") or ""
    words, segments = [], []
    ts = getattr(h, "timestamp", None)
    if isinstance(ts, dict):
        for w in ts.get("word", []) or []:
            words.append(
                {"start": float(w["start"]) + offset, "end": float(w["end"]) + offset, "word": w["word"]}
            )
        for s in ts.get("segment", []) or []:
            segments.append(
                {
                    "start": float(s["start"]) + offset,
                    "end": float(s["end"]) + offset,
                    "text": s.get("segment", ""),
                }
            )
    return text, words, segments


def _transcribe_one(model, path: str, offset: float):
    """Transcribe a single file. Returns (text, words, segments) or empties on failure.
    Frees the CUDA cache afterwards so chunked long-audio runs don't accumulate VRAM."""
    try:
        with torch.inference_mode():
            out = model.transcribe([path], timestamps=True, verbose=False)
    except Exception as e:  # noqa: BLE001
        # Empty / too-short / malformed / OOM can make the model raise. Treat as no speech
        # instead of a 500 so callers degrade gracefully.
        logging.getLogger("nemo_logger").warning("transcribe failed: %s", e)
        out = None
    finally:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    if not out:
        return "", [], []
    return _parse_hyp(out[0], offset)


@app.post("/transcribe")
def transcribe(req: TranscribeReq):
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=400, detail=f"audio not found: {req.audio_path}")
    model = get_asr()

    # The input is a 16 kHz mono PCM WAV (Electron resamples with ffmpeg). Read it with the
    # stdlib `wave` module — no extra native deps that could break the NeMo/torch DLL order.
    try:
        with wave.open(req.audio_path, "rb") as w:
            sr = w.getframerate()
            nframes = w.getnframes()
            nchan = w.getnchannels()
            sampwidth = w.getsampwidth()
            raw = w.readframes(nframes)
        total = nframes / float(sr) if sr else 0.0
    except Exception:  # noqa: BLE001 — not a readable PCM WAV; let the model try the path directly
        text, words, segments = _transcribe_one(model, req.audio_path, 0.0)
        return {"text": text, "words": words, "segments": segments}

    # Short audio (dictation, short clips) — single pass.
    if total == 0.0 or total <= ASR_CHUNK_SECONDS:
        text, words, segments = _transcribe_one(model, req.audio_path, 0.0)
        return {"text": text, "words": words, "segments": segments}

    # Long audio (meetings) — split into fixed-size chunks so it fits in limited VRAM.
    # Transcribing a long file at once OOMs on small GPUs (empty transcript / worker crash).
    bytes_per_frame = nchan * sampwidth
    frames_per_chunk = int(ASR_CHUNK_SECONDS * sr)
    n_chunks = max(1, math.ceil(nframes / float(frames_per_chunk)))

    # Write each chunk to a temp WAV, then transcribe them ALL in ONE call. Calling
    # model.transcribe() repeatedly rebuilds NeMo's Lhotse dataloader (with Windows
    # multiprocessing workers) each time and hard-crashes (c10 AbortHandler) after a few spawns.
    # One call + batch_size=1 keeps peak VRAM to a single chunk; num_workers=0 avoids the
    # multiprocessing dataloader entirely.
    chunk_paths, chunk_starts = [], []
    for i in range(n_chunks):
        fa = i * frames_per_chunk
        fb = min((i + 1) * frames_per_chunk, nframes)
        if fb <= fa:
            continue
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()
        with wave.open(tmp.name, "wb") as out:
            out.setnchannels(nchan)
            out.setsampwidth(sampwidth)
            out.setframerate(sr)
            out.writeframes(raw[fa * bytes_per_frame : fb * bytes_per_frame])
        chunk_paths.append(tmp.name)
        chunk_starts.append(float(i * ASR_CHUNK_SECONDS))

    print(f"[transcribe] {len(chunk_paths)} chunks ({ASR_CHUNK_SECONDS:.0f}s each)", flush=True)
    try:
        with torch.inference_mode():
            outs = model.transcribe(
                chunk_paths, timestamps=True, verbose=False, batch_size=1, num_workers=0
            )
    except Exception as e:  # noqa: BLE001
        logging.getLogger("nemo_logger").warning("transcribe failed: %s", e)
        outs = None
    finally:
        for p in chunk_paths:
            try:
                os.remove(p)
            except OSError:
                pass
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    all_text, all_words, all_segs = [], [], []
    for h, start in zip(outs or [], chunk_starts):
        t, w, s = _parse_hyp(h, start)
        if t:
            all_text.append(t)
        all_words.extend(w)
        all_segs.extend(s)
    return {"text": " ".join(all_text), "words": all_words, "segments": all_segs}


@app.post("/diarize")
def diarize(req: DiarizeReq):
    # No hard token requirement: once the gated model is cached locally it loads without a
    # token. A token is only needed for the first download; if it's missing AND not cached,
    # get_diar() returns the clear "check the HF token / accept the license" error below.
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=400, detail=f"audio not found: {req.audio_path}")
    try:
        pipe = get_diar(req.hf_token)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"diarization unavailable: {e}")
    kwargs = {}
    if req.num_speakers:
        kwargs["num_speakers"] = req.num_speakers
    if req.min_speakers:
        kwargs["min_speakers"] = req.min_speakers
    if req.max_speakers:
        kwargs["max_speakers"] = req.max_speakers
    with torch.inference_mode():
        annotation = pipe(req.audio_path, **kwargs)
    segments = [
        {"start": float(turn.start), "end": float(turn.end), "speaker": label}
        for turn, _, label in annotation.itertracks(yield_label=True)
    ]
    return {"segments": segments}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--warmup", action="store_true", help="load ASR model at startup")
    args = parser.parse_args()

    if args.warmup:
        threading.Thread(target=lambda: get_asr(), daemon=True).start()

    print(f"[worker] starting on {args.host}:{args.port} device={DEVICE}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
