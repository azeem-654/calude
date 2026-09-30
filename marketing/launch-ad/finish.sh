#!/bin/bash
set -e
FF=node_modules/ffmpeg-static/ffmpeg
OUT=out; mkdir -p $OUT
ENC="-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 256k -ar 48000"
# Master
$FF -y -loglevel error -i master_silent.mp4 -i master_audio_norm.wav -map 0:v -map 1:a $ENC -shortest $OUT/PC_Launch_Master_55s_9x16.mp4
$FF -y -loglevel error -i $OUT/PC_Launch_Master_55s_9x16.mp4 -vf "crop=1080:1080:0:420" $ENC $OUT/PC_Launch_Master_55s_1x1.mp4
$FF -y -loglevel error -i $OUT/PC_Launch_Master_55s_9x16.mp4 -vf "crop=1080:1350:0:285" $ENC $OUT/PC_Launch_Master_55s_4x5.mp4
$FF -y -loglevel error -i $OUT/PC_Launch_Master_55s_9x16.mp4 -filter_complex "[0:v]crop=1080:1080:0:420,split[a][b];[a]scale=1920:1920,crop=1920:1080,boxblur=40:2,eq=brightness=-0.12[bg];[bg][b]overlay=420:0" $ENC $OUT/PC_Launch_Master_55s_16x9.mp4
# Cutdowns: frame-exact segments from the silent master.
for c in c30 c15; do
  SEGS=$(cat segs_$c.json)
  F=$(node -e "const s=$SEGS;let f='';s.forEach(([a,b],i)=>{f+='[0:v]trim=start_frame='+Math.round(a*30)+':end_frame='+Math.round(b*30)+',setpts=PTS-STARTPTS[v'+i+'];'});f+=s.map((_,i)=>'[v'+i+']').join('')+'concat=n='+s.length+':v=1:a=0[v]';console.log(f)")
  name=$([ $c = c30 ] && echo PC_Launch_30s || echo PC_Launch_15s)
  $FF -y -loglevel error -i master_silent.mp4 -i ${c}_audio_norm.wav -filter_complex "$F" -map "[v]" -map 1:a $ENC -shortest $OUT/${name}_9x16.mp4
  $FF -y -loglevel error -i $OUT/${name}_9x16.mp4 -vf "crop=1080:1080:0:420" $ENC $OUT/${name}_1x1.mp4
done
ls -la $OUT
