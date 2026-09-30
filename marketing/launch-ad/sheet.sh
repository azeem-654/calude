#!/bin/bash
# sheet.sh out.png files...
out=$1; shift
FF=node_modules/ffmpeg-static/ffmpeg
args=(); n=0; for f in "$@"; do args+=(-i "$f"); n=$((n+1)); done
cols=5; rows=$(( (n+cols-1)/cols ))
layout=""; for ((i=0;i<n;i++)); do x=$(( (i%cols)*432 )); y=$(( (i/cols)*768 )); layout+="${x}_${y}|"; done
filt=""; for ((i=0;i<n;i++)); do filt+="[$i:v]scale=432:768[s$i];"; done
for ((i=0;i<n;i++)); do filt+="[s$i]"; done
filt+="xstack=inputs=$n:layout=${layout%|}:fill=black"
$FF -y -loglevel error "${args[@]}" -filter_complex "$filt" -frames:v 1 "$out"
