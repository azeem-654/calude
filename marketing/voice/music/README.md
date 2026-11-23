# Music for the films

`bed-uplifting.mp3` is the bed under `platform-showcase` (and any film whose
narration script names it in `music`). It is git-ignored like every other
generated sound here; rebuild it with:

```bash
curl -s -o /tmp/uplifting.mp3 https://cdn.freesound.org/previews/670/670819_13228046-hq.mp3
curl -s -o /tmp/happy.mp3     https://cdn.freesound.org/previews/666/666720_13228046-hq.mp3
ffmpeg -y -i /tmp/uplifting.mp3 -i /tmp/happy.mp3 -filter_complex \
  "[0:a]atrim=0:151[a];[1:a]atrim=0:181[b];[a][b]acrossfade=d=4:c1=tri:c2=tri,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000" \
  -ac 2 -b:a 160k marketing/voice/music/bed-uplifting.mp3
```

Two tracks by Seth_Makes_Sounds on Freesound, both **CC0** (no conditions, no
credit required), found through Openverse — the same licence rule as Video
Studio's music (`worker/src/lib/video/music.ts`):

- "Free Uplifting Music" — freesound.org/people/Seth_Makes_Sounds/sounds/670819
- "Cute Happy Background Music" — freesound.org/people/Seth_Makes_Sounds/sounds/666720

Levelled to -16 LUFS, the voice's own level; `voiceover.mts` (`mixMusic`)
then plays it at -9 dB in the pauses and -24 dB under every spoken line.
