"""Make optional English captions from the recorded narration."""

import json
import sys
import textwrap
import wave
from pathlib import Path

import numpy as np


def timestamp(milliseconds):
    seconds, millis = divmod(milliseconds, 1000)
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def captions(plan, recording):
    with wave.open(str(recording), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth()) != (1, 2):
            raise ValueError("Expected a mono 16-bit narration WAV")
        rate = audio.getframerate()
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2")
    if len(samples) != round(plan["duration"] * rate):
        raise ValueError("The narration and caption timeline have different durations")

    entries = []
    for cue in plan["cues"]:
        first = round(cue["start"] * rate)
        last = round(cue["end"] * rate)
        audible = np.flatnonzero(np.abs(samples[first:last].astype(np.int32)) > 64)
        if not len(audible):
            raise ValueError(f"No narration found at {cue['start']} seconds")
        start = round((first + int(audible[0])) * 1000 / rate)
        end = min(round(cue["end"] * 1000), round((first + int(audible[-1])) * 1000 / rate) + 150)
        lines = textwrap.wrap(cue["text"], width=44, break_long_words=False, break_on_hyphens=False)
        blocks = ["\n".join(lines[i:i + 2]) for i in range(0, len(lines), 2)]
        size = sum(map(len, blocks))
        consumed = 0
        cursor = start
        for block in blocks:
            consumed += len(block)
            boundary = start + round((end - start) * consumed / size)
            entries.append(f"{len(entries) + 1}\n{timestamp(cursor)} --> {timestamp(boundary)}\n{block}\n")
            cursor = boundary

    return "\n".join(entries)


if __name__ == "__main__":
    plan_path, recording, output = map(Path, sys.argv[1:])
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    output.write_text(captions(plan, recording), encoding="utf-8")
