"""Local speaker-diarization worker for Cadence (pyannote).

Runs as a FastAPI service on 127.0.0.1; the Electron app spawns and manages it. Audio passed
to /diarize must be 16 kHz mono WAV (Electron resamples with ffmpeg first).

Speech recognition lives in the separate ONNX worker (onnx_worker.py). This process must
NEVER import NeMo: pyannote.audio's `Pipeline.from_pretrained` transitively tries to import
`nemo` (via Lightning's plugin/entry-point discovery), and on Windows the torch + NeMo native
combo segfaults (exit 139) partway through loading or clustering — that was the real cause of
"By speakers" dying with "fetch failed". We block the `nemo` import entirely (below), which
makes loading the pyannote pipeline stable (verified: 84-min file → 3 speakers in ~143 s,
peak ~4.3 GB VRAM, no crash).
"""
import os

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")  # Windows OpenMP safety
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# --- Block NeMo before any torch / pyannote import -----------------------------------------
# The finder raises ImportError for any `nemo*` module; Lightning's plugin discovery catches
# that and simply skips the (unneeded) NeMo integration, so the pipeline loads cleanly.
import importlib.abc
import sys


class _BlockNeMo(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path, target=None):
        if name == "nemo" or name.startswith("nemo."):
            raise ImportError("nemo is intentionally disabled in the diarization worker")
        return None


sys.meta_path.insert(0, _BlockNeMo())
# -------------------------------------------------------------------------------------------

import argparse
import json
import queue
import threading
from typing import Iterator, Optional

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DIAR_MODEL = os.environ.get("PYANNOTE_MODEL", "pyannote/speaker-diarization-3.1")

_diar = None
_diar_lock = threading.Lock()


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


app = FastAPI(title="Cadence diarization worker")


class DiarizeReq(BaseModel):
    audio_path: str
    hf_token: Optional[str] = None
    num_speakers: Optional[int] = None
    min_speakers: Optional[int] = None
    max_speakers: Optional[int] = None


@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "diar_loaded": _diar is not None}


# Map pyannote speaker-diarization-3.1 steps → an overall 0..1 progress fraction. Probed call
# order: segmentation → speaker_counting → embeddings → discrete_diarization; only segmentation
# and embeddings report numeric completed/total (and completed can briefly exceed total).
_DIAR_STEP_BASE = {"segmentation": 0.0, "speaker_counting": 0.45, "embeddings": 0.5, "discrete_diarization": 0.95}
_DIAR_STEP_SPAN = {"segmentation": 0.45, "speaker_counting": 0.0, "embeddings": 0.45, "discrete_diarization": 0.05}


def _diarize_stream(pipe, audio_path: str, kwargs: dict) -> Iterator[str]:
    """Run pyannote in a worker thread while a progress hook feeds a queue, so we can yield NDJSON
    {"type":"progress","value":0..1} lines LIVE, then a final {"type":"result","data":{segments}}.
    (A plain accumulate-then-drain would only report progress after the whole run finished.)"""
    q: "queue.Queue" = queue.Queue()
    holder: dict = {}

    def hook(step_name, step_artifact=None, file=None, total=None, completed=None):
        base = _DIAR_STEP_BASE.get(step_name)
        if base is None:
            return
        if total and completed is not None:
            frac = min(max(completed / total, 0.0), 1.0)
            q.put(base + _DIAR_STEP_SPAN.get(step_name, 0.0) * frac)
        else:
            q.put(base)

    def run():
        try:
            with torch.inference_mode():
                ann = pipe(audio_path, hook=hook, **kwargs)
            holder["segments"] = [
                {"start": float(t.start), "end": float(t.end), "speaker": lbl}
                for t, _, lbl in ann.itertracks(yield_label=True)
            ]
        except Exception as e:  # noqa: BLE001
            holder["error"] = str(e)
        finally:
            q.put(None)  # sentinel: work finished

    threading.Thread(target=run, daemon=True).start()
    last = 0.0
    while True:
        val = q.get()
        if val is None:
            break
        if val > last:  # monotonic — never let the bar jump backwards
            last = val
            yield json.dumps({"type": "progress", "value": round(val, 4)}) + "\n"
    if "error" in holder:
        yield json.dumps({"type": "error", "message": holder["error"]}) + "\n"
        return
    yield json.dumps({"type": "progress", "value": 1.0}) + "\n"
    yield json.dumps({"type": "result", "data": {"segments": holder.get("segments", [])}}) + "\n"


@app.post("/diarize")
def diarize(req: DiarizeReq):
    # No hard token requirement: once the gated model is cached locally it loads without a
    # token. A token is only needed for the first download; if it's missing AND not cached,
    # get_diar() raises the clear "check the HF token / accept the license" error below.
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
    # Stream NDJSON progress like the ONNX /transcribe worker so the UI shows a live %.
    return StreamingResponse(
        _diarize_stream(pipe, req.audio_path, kwargs), media_type="application/x-ndjson"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--warmup", action="store_true", help="pre-load the diarization model")
    args = parser.parse_args()

    if args.warmup:
        # Best-effort pre-load so the first /diarize is fast. Needs the gated model cached
        # (or a token on the first call); ignore failures — /diarize reports them clearly.
        def _warm():
            try:
                get_diar("")
            except Exception as e:  # noqa: BLE001
                print(f"[diar] warmup skipped: {e}", flush=True)

        threading.Thread(target=_warm, daemon=True).start()

    print(f"[diar] starting on {args.host}:{args.port} device={DEVICE}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
