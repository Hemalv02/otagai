# Otagai promo film

A 2:45 promo for Otagai at 1920×1080, 30 fps. The app screens are rebuilt in HTML from the `mobile/` layouts, Chromium renders the frames, Python synthesises the score, and Kokoro narrates in the `af_heart` voice.

Use the build steps below to generate the master and a smaller share copy in `out/`.

## What's in here

| Path | What it is |
| --- | --- |
| `scenes/index.js` | Timeline: duration (165 s), background colours and scene order |
| `scenes/v2a.js` … `v2d.js` | Scenes, in order (see the timeline below) |
| `scenes/world2.js` | Background paper, contour lines, neighbour dots and the green line the camera follows |
| `scenes/kit2.js` | Camera zoom (`zoomRig`), transitions, taps, screen swaps |
| `lib/app.js`, `lib/style.css` | HTML copies of the app's UI parts (buttons, fields, cards, phone frame) |
| `lib/engine.js`, `render.mjs`, `index.html` | Frame engine and the Playwright renderer |
| `audio/voiceover.json` | Narration lines, timings and pronunciation fixes |
| `audio/vo_track.wav` | Recorded voice-over, so you don't need Kokoro to build the film |
| `audio/make_cues_v2.py`, `audio/score.py` | Music cues and the synthesiser (96 BPM, one bar = 2.5 s) |
| `audio/voiceover.py` | Kokoro renderer for the narration |
| `assets/`, `fonts/` | App photos and avatars, plus Inter, Lora, Geist Mono, Noto Sans JP and Bengali |
| `DIRECTOR_BRIEF.md` | The original creative brief (the "One Line" concept) |

## Timeline

| Time | Scene |
| --- | --- |
| 0:00–0:25 | Problem: Nagasaki's ageing hillsides, *enryo*, the Otagai reveal |
| 0:25–0:42 | Join a circle, explore neighbours |
| 0:42–1:02 | Tanaka-san asks; the request ripples out from family to nearby |
| 1:02–1:15 | Rahim offers, they meet |
| 1:15–1:35 | Rahim asks with a photo; a photo becomes a listing |
| 1:35–1:45 | Thank-yous, no ratings |
| 1:45–1:55 | Family (Ammu in Cumilla) asks on someone's behalf, with consent |
| 1:55–2:05 | Circle board: translated notices and events |
| 2:05–2:20 | Disaster mode: safety alert, "I'm safe" / "I need help", gentle check-ins |
| 2:20–2:32 | Trust and privacy |
| 2:32–2:45 | Logo and close |

The disaster mode, notice, and event screens are mobile concepts based on backend behaviour. Payments are shown as disabled options.

## Requirements

- Node 20 or later, plus pnpm
- FFmpeg with libx264 and libx265
- Python 3 with `numpy` and `scipy` (for the score)
- About 3 GB of free RAM for 4 render workers

```bash
cd submission/motion
pnpm install
pnpm exec playwright install chromium
pip install numpy scipy        # or inside a venv if your system Python blocks pip
```

## Build

```bash
./build.sh                # score, mix, render, mux: writes out/otagai_v2.mp4
WORKERS=3 ./build.sh      # on machines with less RAM
./build.sh --vo           # also re-record the narration (needs Kokoro, see below)
```

The render prints a frame count and estimated time remaining. The script also writes `out/otagai_v2_share.mp4`, a smaller H.265 copy for sharing.

The score uses a fixed random seed, so `score.py` produces the same music on every run.

### While editing

```bash
node render.mjs --still 52.9,130.2          # single frames to out/stills/
node render.mjs --sheet 0:165:2.5 --cols 9  # contact sheet, one frame every 2.5 s
```

## Voice-over with Kokoro (optional)

`audio/vo_track.wav` is already committed. Only set this up if you change the lines in `audio/voiceover.json`.

Kokoro runs locally through `kokoro-onnx`. Use Python 3.12. On Debian or Ubuntu you may need `python3.12-venv` and `espeak-ng`.

```bash
kokoro_dir="$HOME/kokoro-tts"
mkdir -p "$kokoro_dir"
python3.12 -m venv "$kokoro_dir/.venv"
"$kokoro_dir/.venv/bin/python" -m pip install kokoro-onnx soundfile numpy

release="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
for name in kokoro-v1.0.onnx voices-v1.0.bin; do
  curl -fL --retry 2 "$release/$name" -o "$kokoro_dir/$name"
done
```

Then record and rebuild:

```bash
./build.sh --vo
# or KOKORO_DIR=/path/to/kokoro ./build.sh --vo
```

Notes on `audio/voiceover.json`:

- `start` and `end` are film seconds. A line must fit inside its window. The renderer speeds a long line up to 1.18× once, then fails with a message if it still doesn't fit.
- Lines need at least 0.22 s between them.
- `pronunciation` maps Kokoro's phonemes to the ones you want. Nagasaki uses `"nˌæɡɐsˈæki": "nˌɑːɡəsˈɑːki"`. If a key doesn't match, the error prints the phonemes Kokoro produced so you can copy the right one.
- To try another voice, set `voice` (for example `af_sarah` or `bf_emma`) on the whole file or on one line.
