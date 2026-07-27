#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

FPS=30
mkdir -p clips

declare -A DURATIONS=(
  [01_hook]=5
  [02_intro]=6
  [03_features]=8
  [04_offer]=6
  [05_cta]=5
)

ORDER=(01_hook 02_intro 03_features 04_offer 05_cta)

for name in "${ORDER[@]}"; do
  dur=${DURATIONS[$name]}
  frames=$((dur * FPS))
  ffmpeg -y -loop 1 -i "frames/${name}.png" \
    -vf "scale=1920:1080,zoompan=z='min(zoom+0.0006,1.06)':d=${frames}:s=1920x1080:fps=${FPS},fade=t=in:st=0:d=0.4,fade=t=out:st=$((dur - 1)):d=0.4" \
    -t "${dur}" -r "${FPS}" -pix_fmt yuv420p -c:v libx264 -crf 18 -preset veryfast \
    "clips/${name}.mp4"
done

# concat list
: > clips/list.txt
for name in "${ORDER[@]}"; do
  echo "file '$(pwd)/clips/${name}.mp4'" >> clips/list.txt
done

ffmpeg -y -f concat -safe 0 -i clips/list.txt -c copy clips/silent_video.mp4

# add silent audio track for player/platform compatibility
DUR_TOTAL=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 clips/silent_video.mp4)

ffmpeg -y -i clips/silent_video.mp4 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -c:v copy -c:a aac -shortest -t "${DUR_TOTAL}" \
  ../output/gohighlevel_ai_affiliate_ad_16x9.mp4

echo "DONE"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ../output/gohighlevel_ai_affiliate_ad_16x9.mp4
