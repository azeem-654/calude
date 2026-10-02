#!/bin/bash
# The film as an HLS ladder: four renditions with keyframes every 4 s in the
# same places, so the player can step between them at any segment boundary.
set -e
FF=node_modules/ffmpeg-static/ffmpeg
M=out/PC_Launch_Film_5min_16x9_v3.mp4
rm -rf hls && mkdir -p hls
enc() { # name height vbit vmax profile level abit preset
  local n=$1 h=$2 vb=$3 vm=$4 pr=$5 lv=$6 ab=$7 ps=$8
  mkdir -p hls/$n
  local V="-vf scale=-2:$h:flags=lanczos -c:v libx264 -preset $ps -tune animation -profile:v $pr -level $lv -pix_fmt yuv420p -b:v $vb -maxrate $vm -bufsize $((${vm%k}*2))k -g 120 -keyint_min 120 -sc_threshold 0 -force_key_frames expr:gte(t,n_forced*4)"
  $FF -y -loglevel error -i $M $V -pass 1 -passlogfile hls/$n/x -an -f null /dev/null
  $FF -y -loglevel error -i $M $V -pass 2 -passlogfile hls/$n/x -c:a aac -b:a $ab -ac 2 -ar 48000 \
     -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_filename hls/$n/s%03d.ts hls/$n/index.m3u8
  rm -f hls/$n/x*
  echo "$n done"
}
enc 360  360  120k 260k  main 3.0 64k medium
enc 480  480  210k 450k  main 3.1 64k medium
enc 720  720  360k 800k  high 3.1 80k slow
enc 1080 1080 560k 1200k high 4.0 80k slow
du -sh hls/*
