"""Render timed narration cues with local Kokoro model files."""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.tokenizer import Tokenizer

MIN_GAP = 0.22
MAX_FIT_SPEED = 1.18
SAMPLE_RATE = 24000


def synthesize(kokoro, phonemes, voice, speed):
    samples, rate = kokoro.create(
        phonemes, voice=voice, speed=speed, is_phonemes=True
    )
    samples = np.asarray(samples, dtype=np.float32)
    audible = np.flatnonzero(np.abs(samples) > 0.005)
    if rate != SAMPLE_RATE or not audible.size:
        raise ValueError("Expected audible Kokoro v1.0 output at 24 kHz")
    start = max(0, audible[0] - round(0.02 * rate))
    end = audible[-1] + 1 + round(0.08 * rate)
    return samples[start:end]


def render(plan, model_dir, output):
    duration = float(plan["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Film duration must be positive and finite")
    if not plan["cues"]:
        raise ValueError("Add at least one narration cue")

    kokoro = Kokoro(
        str(model_dir / "kokoro-v1.0.onnx"),
        str(model_dir / "voices-v1.0.bin"),
    )
    tokenizer = Tokenizer()
    track = np.zeros(round(duration * SAMPLE_RATE), dtype=np.float32)
    previous_end = None

    for index, cue in enumerate(plan["cues"], 1):
        start, end = float(cue["start"]), float(cue["end"])
        speed = float(cue.get("speed", 1.0))
        if not 0 <= start < end <= duration:
            raise ValueError(f"Cue {index} has a window outside the film")
        if not math.isfinite(speed) or speed <= 0:
            raise ValueError(f"Cue {index} must have a positive, finite speed")
        start_sample = round(start * SAMPLE_RATE)
        if previous_end is not None and start_sample < previous_end + round(MIN_GAP * SAMPLE_RATE):
            raise ValueError(f"Cue {index} starts too close to the previous line")

        voice = cue.get("voice", plan.get("voice", "af_heart"))
        lang = cue.get("lang", plan.get("lang", "en-us"))
        phonemes = tokenizer.phonemize(cue["text"], lang)
        for original, replacement in cue.get("pronunciation", {}).items():
            if original not in phonemes:
                raise ValueError(f"Cue {index} pronunciation override did not match: {phonemes!r}")
            phonemes = phonemes.replace(original, replacement)

        samples = synthesize(kokoro, phonemes, voice, speed)
        window_samples = round(end * SAMPLE_RATE) - start_sample
        if window_samples < 1:
            raise ValueError(f"Cue {index} must span at least one audio sample")
        if len(samples) > window_samples and speed < MAX_FIT_SPEED:
            speed = min(MAX_FIT_SPEED, speed * len(samples) / window_samples)
            samples = synthesize(kokoro, phonemes, voice, speed)
        if len(samples) > window_samples:
            raise ValueError(f"Cue {index} exceeds its window. Shorten the line or widen the window.")

        previous_end = start_sample + len(samples)
        track[start_sample:previous_end] = samples
        print(f"Cue {index:02d}  {start:.2f}–{previous_end / SAMPLE_RATE:.2f}s  {voice}  {speed:.2f}x")

    track *= 0.5 / np.max(np.abs(track))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, track, SAMPLE_RATE, subtype="PCM_16")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cues", type=Path, help="Timed narration JSON")
    parser.add_argument("output", type=Path, help="Voice-only WAV")
    parser.add_argument("--model-dir", type=Path, default=Path.home() / "kokoro-tts")
    args = parser.parse_args()
    try:
        render(json.loads(args.cues.read_text(encoding="utf-8")), args.model_dir, args.output)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"Voiceover: {error}\n")


if __name__ == "__main__":
    main()
