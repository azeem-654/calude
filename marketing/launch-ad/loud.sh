#!/bin/bash
# loud.sh in.wav out.wav  — two-pass EBU R128 to -14 LUFS, -1.5 dBTP
FF=node_modules/ffmpeg-static/ffmpeg
J=$($FF -hide_banner -i "$1" -af loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g(){ echo "$J" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
$FF -y -loglevel error -i "$1" -af "loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" -ar 48000 "$2"
$FF -hide_banner -i "$2" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tr -s ' '
