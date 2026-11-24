#!/usr/bin/env bash
# Builds out/otagai_v2.mp4 (170 s, 1920x1080, 30 fps) from source.
#   ./build.sh            score -> mix -> render -> mux
#   ./build.sh --vo       also re-record the voice-over with Kokoro first
#   WORKERS=3 ./build.sh  fewer Chromium workers on low-RAM machines (default 4)
set -euo pipefail
cd "$(dirname "$0")"
WORKERS="${WORKERS:-4}"
KOKORO_DIR="${KOKORO_DIR:-$HOME/kokoro-tts}"
mkdir -p out

if [[ "${1:-}" == "--vo" ]]; then
  echo "== voice-over (Kokoro af_heart)"
  "$KOKORO_DIR/.venv/bin/python" audio/voiceover.py audio/voiceover.json audio/vo_track.wav --model-dir "$KOKORO_DIR"
fi

echo "== score (96 BPM, seeded, so the output is identical every run)"
python3 audio/make_cues_v2.py
python3 audio/score.py

echo "== mix: duck music under the voice, then loudness-normalise to about -14 LUFS"
ffmpeg -y -loglevel error -i audio/score.wav -i audio/vo_track.wav -filter_complex \
  '[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.85[music];[1:a]highpass=f=90,aformat=sample_rates=48000:channel_layouts=mono,volume=1.25,asplit[sc][vo];[music][sc]sidechaincompress=threshold=0.02:ratio=6:attack=60:release=400[ducked];[vo]pan=stereo|c0=c0|c1=c0[center];[ducked][center]amix=inputs=2:duration=longest:normalize=0,volume=0.7,alimiter=limit=0.85:level=false:latency=true[mix]' \
  -map '[mix]' audio/mix_raw.wav
ffmpeg -y -loglevel error -i audio/mix_raw.wav -af loudnorm=I=-14.5:TP=-1.5:LRA=11 -ar 48000 audio/mix_vo.wav

echo "== render 5100 frames with $WORKERS workers (about 30 min on 8 cores)"
node render.mjs --video --fps 30 --workers "$WORKERS" --preset veryfast --crf 18 --mute --out out/v2_silent.mp4

echo "== mux"
ffmpeg -y -loglevel error -i out/v2_silent.mp4 -i audio/mix_vo.wav -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart out/otagai_v2.mp4

echo "== share copy (H.265, about 115 MB)"
ffmpeg -y -loglevel error -i out/otagai_v2.mp4 -c:v libx265 -preset medium -crf 22 -tag:v hvc1 \
  -pix_fmt yuv420p -c:a copy -movflags +faststart out/otagai_v2_share.mp4

ls -lh out/otagai_v2.mp4 out/otagai_v2_share.mp4
