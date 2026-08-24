#!/usr/bin/env bash
# Converts the .webm files recorded by record_number_variant.js into the
# final MP4s (H.264 + silent AAC track for player/platform compatibility).
#
#   SLUG=03021202000 ./convert_number_variant.sh
#
# Requires a system ffmpeg built with libx264 + aac (not Playwright's
# bundled ffmpeg, which is stripped down to webm/vp8 only).
set -euo pipefail
cd "$(dirname "$0")"

SLUG="${SLUG:?set SLUG to the same value used with record_number_variant.js}"
OUT=../../public/ads/gohighlevel-summer-of-ai-bold-pk
mkdir -p "$OUT"

for fmt in vertical square horizontal; do
  RAW=$(ls "video_raw_${SLUG}_${fmt}"/*.webm | head -1)
  ffmpeg -y -i "$RAW" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -preset veryfast \
    -c:a aac -shortest -t 8 \
    "$OUT/gohighlevel_summer_of_ai_${fmt}_${SLUG}.mp4"
done

echo "DONE"
