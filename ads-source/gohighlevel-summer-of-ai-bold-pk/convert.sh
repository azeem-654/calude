#!/usr/bin/env bash
# Converts the .webm Playwright records (video_raw/*.webm) into the final
# MP4: H.264 video + a silent AAC audio track for player/platform
# compatibility. Requires a system ffmpeg built with libx264 + aac (not
# Playwright's bundled ffmpeg, which is stripped down to webm/vp8 only).
set -euo pipefail
cd "$(dirname "$0")"

RAW=$(ls video_raw/*.webm | head -1)
mkdir -p ../../public/ads/gohighlevel-summer-of-ai-bold-pk

ffmpeg -y -i "$RAW" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset veryfast \
  -c:a aac -shortest -t 8 \
  ../../public/ads/gohighlevel-summer-of-ai-bold-pk/summer_of_ai_animated_whatsapp_status.mp4

echo "DONE"
