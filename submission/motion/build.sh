#!/usr/bin/env bash
# Builds out/otagai_v2.mp4 (165 s, 1920x1080, 30 fps) from source.
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

echo "== mix: level the narration, duck the music, and set a fixed delivery gain"
ffmpeg -y -loglevel error -i audio/score.wav -i audio/vo_track.wav -filter_complex \
  '[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.65[music];
   [1:a]aformat=sample_rates=48000:channel_layouts=mono,highpass=f=75,equalizer=f=300:t=o:w=1.3:g=-2,equalizer=f=2800:t=o:w=1.6:g=3,acompressor=threshold=0.09:ratio=2.5:attack=10:release=100:makeup=1.65,asplit[sc][vo];
   [music][sc]sidechaincompress=threshold=0.028:ratio=4:attack=20:release=320[ducked];
   [vo]pan=stereo|c0=c0|c1=c0[center];
   [ducked][center]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9:level=false:latency=true[mix]' \
  -map '[mix]' -c:a pcm_f32le audio/mix_raw.wav

# Apply one gain to the whole film. A short peak limiter catches transients.
stats=$(ffmpeg -hide_banner -nostats -i audio/mix_raw.wav -af loudnorm=print_format=json -f null - 2>&1)
gain_db=$(python3 -c '
import json
import sys

report = sys.stdin.read()
stats = json.loads(report[report.index("{"):report.rindex("}") + 1])
print(-14.5 - float(stats["input_i"]))
' <<< "$stats")
ffmpeg -y -loglevel error -i audio/mix_raw.wav \
  -af "volume=${gain_db}dB,aresample=192000,alimiter=limit=0.8:attack=2:release=45:level=false:latency=true,aresample=48000" \
  -c:a pcm_s24le audio/mix_vo.wav

echo "== render with $WORKERS workers"
node render.mjs --video --fps 30 --workers "$WORKERS" --preset veryfast --crf 18 --mute --out out/v2_silent.mp4

echo "== mux"
ffmpeg -y -loglevel error -i out/v2_silent.mp4 -i audio/mix_vo.wav -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart out/otagai_v2.mp4

echo "== share copy (H.265)"
ffmpeg -y -loglevel error -i out/otagai_v2.mp4 -c:v libx265 -preset medium -crf 22 -tag:v hvc1 \
  -pix_fmt yuv420p -c:a copy -movflags +faststart out/otagai_v2_share.mp4

ls -lh out/otagai_v2.mp4 out/otagai_v2_share.mp4
