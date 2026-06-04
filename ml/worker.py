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
import threading
from typing import Optional

import nemo.collections.asr as nemo_asr  # import NeMo before torch (Windows DLL order)
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

logging.getLogger("nemo_logger").setLevel(logging.ERROR)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
ASR_MODEL = os.environ.get("PARAKEET_MODEL", "nvidia/parakeet-tdt-0.6b-v3")
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


@app.post("/transcribe")
def transcribe(req: TranscribeReq):
    if not os.path.exists(req.audio_path):
        raise HTTPException(status_code=400, detail=f"audio not found: {req.audio_path}")
    model = get_asr()
    try:
        with torch.inference_mode():
            out = model.transcribe([req.audio_path], timestamps=True, verbose=False)
    except Exception as e:  # noqa: BLE001
        # Empty / too-short / malformed audio can make the model raise. Treat as no speech
        # instead of a 500 so dictation degrades gracefully.
        logging.getLogger("nemo_logger").warning("transcribe failed: %s", e)
        return {"text": "", "words": [], "segments": []}
    if not out:
        return {"text": "", "words": [], "segments": []}
    h = out[0]
    text = getattr(h, "text", "") or ""
    words, segments = [], []
    ts = getattr(h, "timestamp", None)
    if isinstance(ts, dict):
        for w in ts.get("word", []) or []:
            words.append({"start": float(w["start"]), "end": float(w["end"]), "word": w["word"]})
        for s in ts.get("segment", []) or []:
            segments.append(
                {"start": float(s["start"]), "end": float(s["end"]), "text": s.get("segment", "")}
            )
    return {"text": text, "words": words, "segments": segments}


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
