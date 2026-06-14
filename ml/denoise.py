"""DPDFNet speech enhancement (noise suppression) as a one-shot step: in.wav -> out.wav.

Runs on ONNX Runtime, CPU only (no PyTorch). Cadence calls this before ASR when the user turns
on "Noise suppression". The input is already 16 kHz mono (Cadence resamples with ffmpeg); we keep
the same rate and write 16-bit PCM so the ASR's WAV reader matches.
"""
import os
import sys

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import soundfile as sf
import dpdfnet


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: denoise.py <in.wav> <out.wav> [model]", file=sys.stderr)
        return 2
    inp, out = sys.argv[1], sys.argv[2]
    model = sys.argv[3] if len(sys.argv) > 3 else "dpdfnet4"
    audio, sr = sf.read(inp)
    res = dpdfnet.enhance(audio, sample_rate=sr, model=model)
    enhanced = res[0] if isinstance(res, tuple) else res
    sf.write(out, enhanced, sr, subtype="PCM_16")
    print("denoise done", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
