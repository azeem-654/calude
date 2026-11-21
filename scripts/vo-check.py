"""Hears each cut narration line again and scores it against its script.
Used by scripts/voiceover.mts:  vo-check.py <check.json>   ([[text, wav], …])
Prints a JSON array, 1 for a clean piece and 0 for one with a cut fault: its
first word missing with nothing heard in its place, words heard after its
last word (the next line's start), or under 80 % of its words heard. A word
merely mis-heard ("Logic lines" for "Subject lines") is not a fault — it
is the recogniser, not the cut, and re-voicing it would spend the day's quota.
Spellings the recogniser writes its own way (enquiry/inquiry, numbers as
digits) are folded first so they do not count as faults.
"""
import json, re, sys, difflib
from faster_whisper import WhisperModel
pairs = json.load(open(sys.argv[1]))
FOLD = {"inquiry": "enquiry", "inquiries": "enquiries", "optimize": "optimise", "optimized": "optimised", "12": "twelve", "7": "seven"}
def norm(t):
    t = t.lower().replace("’", "'").replace("-", " ")
    return [FOLD.get(w, w) for w in (re.sub(r"[^a-z0-9']", "", x) for x in t.split()) if w]
model = WhisperModel("base.en", device="cpu", compute_type="int8")
out = []
for text, wav in pairs:
    segs, _ = model.transcribe(wav, beam_size=5, language="en", vad_filter=False)
    a, b = norm(text), norm(" ".join(s.text for s in segs))
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    blocks = [m for m in sm.get_matching_blocks() if m.size]
    if not blocks or sm.ratio() < 0.8:
        out.append(0); continue
    first, last = blocks[0], blocks[-1]
    lost_head = first.a > 0 and first.b == 0                 # its first word(s) gone, nothing in their place
    tail_extra = len(b) - (last.b + last.size)               # heard after the last matched word
    ends_matched = last.a + last.size == len(a)
    bleed = tail_extra >= 2 or (tail_extra >= 1 and ends_matched)
    out.append(0 if lost_head or bleed else 1)
print(json.dumps(out))
