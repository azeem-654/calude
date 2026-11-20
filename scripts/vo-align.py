"""Finds where each narration line begins in one batch of speech.

Used by scripts/voiceover.mts:  vo-align.py <batch.wav> <lines.json>
Prints a JSON array, per line {start, end} in seconds, or null when the line
was not (fully) spoken.

Why a local recogniser: the speech model is asked for many lines in one
request (the free tier allows ten requests a day) and does not pause longer
between lines than inside them, and a Gemini text model's timestamps drift by
seconds. Whisper (faster-whisper, base.en, from Hugging Face) times every word;
the script's own words are then matched to what was heard, so a mis-heard name
("Protron") does not move a cut.

Needs:  python3 -m venv /tmp/vo-venv && /tmp/vo-venv/bin/pip install faster-whisper
"""
import json, re, sys, difflib
from faster_whisper import WhisperModel

wav, lines_file = sys.argv[1], sys.argv[2]
lines = json.load(open(lines_file))
norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())

model = WhisperModel("base.en", device="cpu", compute_type="int8")
segs, _ = model.transcribe(wav, word_timestamps=True, beam_size=5, vad_filter=False)
heard = [(norm(w.word), w.start, w.end) for s in segs for w in s.words if norm(w.word)]

script, first = [], []
for i, t in enumerate(lines):
    ws = [norm(w) for w in t.split() if norm(w)]
    first.append(len(script))
    script += ws

sm = difflib.SequenceMatcher(a=script, b=[h[0] for h in heard], autojunk=False)
amap = {}
for a, b, n in sm.get_matching_blocks():
    for k in range(n):
        amap[a + k] = b + k

out = []
for i, f in enumerate(first):
    end = first[i + 1] if i + 1 < len(first) else len(script)
    # The first word of the line that was heard; step back by the words
    # before it at ~0.3 s each when the very first word was mis-heard.
    head = next(((k, amap[k]) for k in range(f, min(end, f + 6)) if k in amap), None)
    # The last word heard, which must be near the end of the line: a line the
    # model stopped part-way through counts as not spoken.
    tail = next(((k, amap[k]) for k in range(end - 1, max(f - 1, end - 5), -1) if k in amap), None)
    if head is None or tail is None:
        out.append(None)
        continue
    out.append({"start": max(0.0, heard[head[1]][1] - 0.3 * (head[0] - f)),
                "end": heard[tail[1]][2] + 0.3 * (end - 1 - tail[0])})
print(json.dumps(out))
