# Dashboard hero footage — where it comes from

`public/media/autopilot/nature-{720,480}.{mp4,webm}` and `nature-poster.jpg` are one 37-second
loop cut from five clips on Mixkit, each published under the **Mixkit Stock
Video Free License** (free for commercial use, no attribution required; the
licence forbids redistributing the clips as stock on their own, which a
background in our app is not). Checked on each clip's page, 2026-11-12 — two
candidates under Mixkit's *Restricted* licence (15919, 27028) were left out.

| Order | Mixkit id | Clip |
|---|---|---|
| 1 | 41545 | Flying over tree-covered mountains (green hills) |
| 2 | 100408 | Aerial view of magnificent green hills |
| 3 | 4132 | Mountainous area in the Alps |
| 4 | 36615 | Aerial panorama of a coast and its reliefs |
| 5 | 44387 | Flying low over a sunny beach above the sea |

Built with ffmpeg: 1.5 s crossfades, 24 fps, no audio, H.264 (CRF 27 at
1280×720, CRF 28 at 854×480), `+faststart`; a VP9 WebM of each (CRF 38/40) for browsers built without H.264. The last crossfade returns to the
first clip's opening frame so the loop has no seam. To swap a clip, keep it
under a free licence and record it here.
