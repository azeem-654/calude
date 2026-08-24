#!/usr/bin/env bash
# Converts the .webm files recorded by record_extra_formats.js into the
# final MP4s: H.264 video + a silent AAC audio track for player/platform
# compatibility. Requires a system ffmpeg built with libx264 + aac (not
# Playwright's bundled ffmpeg, which is stripped down to webm/vp8 only).
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p ../../public/ads/gohighlevel-summer-of-ai-bold-pk

for fmt in square horizontal; do
  RAW=$(ls video_raw_${fmt}/*.webm | head -1)
  ffmpeg -y -i "$RAW" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset veryfast \
    -c:a aac -shortest -t 8 \
    ../../public/ads/gohighlevel-summer-of-ai-bold-pk/gohighlevel_summer_of_ai_${fmt}.mp4
done

echo "DONE"
