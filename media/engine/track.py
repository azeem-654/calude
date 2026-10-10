#!/usr/bin/env python3
"""
Faces, and who is speaking, from a video's frames — for Video Studio's
"follow the speaker" framing and for thumbnails that close in on a face.

Frames arrive on stdin as raw BGR (the engine pipes FFmpeg into this
process at a few frames a second, already small), so this script never
opens a file or a URL itself. It prints one JSON document on stdout.

    track.py --w 480 --h 270 --fps 5 --speech speech.json [--model yunet.onnx]
    track.py --image frame.png [--model yunet.onnx]

How a speaker is chosen, and what it cannot do
----------------------------------------------
Faces come from OpenCV's YuNet detector (or its Haar cascade when the model
file is missing). Faces are joined into tracks from frame to frame by
overlap. The *speaker* is the face whose mouth moves while the sound says
somebody is talking: for each face, the change in the mouth region between
frames, less the change in the eye region (so a nodding head does not count
as talking), summed over each second of speech. A new speaker must win two
seconds running before the frame cuts to them — one loud laugh does not
move the camera. This reads lips, not voices: two people talking over each
other, or a speaker with their back to the camera, are not told apart, and
the result says how sure it was (`switches`, `seen`).

The camera follows the chosen face like an operator: it holds still inside
a dead zone and eases towards the face when it leaves it, and it *cuts*
(rather than pans) when the speaker changes.
"""
import argparse
import json
import sys

import numpy as np
import cv2


def detector(model, w, h):
    if model:
        try:
            d = cv2.FaceDetectorYN.create(model, "", (w, h), 0.72, 0.3, 50)
            return ("yunet", d)
        except Exception:  # noqa: BLE001 — a broken model file falls back, it does not stop the job
            pass
    c = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    return ("haar", c)


def detect(kind, d, img):
    """Faces as dicts: box (x, y, w, h) in pixels, mouth and eyes boxes, score."""
    out = []
    if kind == "yunet":
        h, w = img.shape[:2]
        d.setInputSize((w, h))
        _, faces = d.detect(img)
        for f in faces if faces is not None else []:
            x, y, fw, fh = (float(v) for v in f[:4])
            (rex, rey, lex, ley, _nx, _ny, rmx, rmy, lmx, lmy) = (float(v) for v in f[4:14])
            mw = max(4.0, abs(lmx - rmx))
            mcx, mcy = (lmx + rmx) / 2, (lmy + rmy) / 2
            ecx, ecy = (lex + rex) / 2, (ley + rey) / 2
            ew = max(6.0, abs(lex - rex) * 1.6)
            out.append({"box": (x, y, fw, fh), "score": float(f[14]),
                        "mouth": (mcx - mw * 0.8, mcy - mw * 0.45, mw * 1.6, mw * 0.9),
                        "eyes": (ecx - ew / 2, ecy - ew * 0.25, ew, ew * 0.5)})
    else:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        for (x, y, fw, fh) in d.detectMultiScale(gray, 1.1, 5, minSize=(24, 24)):
            x, y, fw, fh = float(x), float(y), float(fw), float(fh)
            out.append({"box": (x, y, fw, fh), "score": 0.8,
                        "mouth": (x + fw * 0.25, y + fh * 0.66, fw * 0.5, fh * 0.26),
                        "eyes": (x + fw * 0.18, y + fh * 0.28, fw * 0.64, fh * 0.2)})
    return out


def iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0.0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0.0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    return inter / max(1e-6, aw * ah + bw * bh - inter)


def patch(gray, box, size):
    x, y, w, h = box
    H, W = gray.shape[:2]
    x0, y0 = int(max(0, x)), int(max(0, y))
    x1, y1 = int(min(W, x + w)), int(min(H, y + h))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return None
    p = cv2.resize(gray[y0:y1, x0:x1], size, interpolation=cv2.INTER_AREA).astype(np.float32)
    return (p - p.mean()) / (p.std() + 6.0)


def run_image(args):
    img = cv2.imread(args.image)
    if img is None:
        print(json.dumps({"faces": []}))
        return
    h, w = img.shape[:2]
    kind, d = detector(args.model, w, h)
    faces = sorted(detect(kind, d, img), key=lambda f: -f["box"][2] * f["box"][3])
    print(json.dumps({"detector": kind, "faces": [
        {"x": round(f["box"][0] / w, 4), "y": round(f["box"][1] / h, 4), "w": round(f["box"][2] / w, 4), "h": round(f["box"][3] / h, 4), "score": round(f["score"], 3)}
        for f in faces[:6]]}))


def run_video(args):
    w, h, fps = args.w, args.h, args.fps
    speech = []
    if args.speech:
        with open(args.speech) as fh:
            speech = json.load(fh)
    kind, d = detector(args.model, w, h)
    size = w * h * 3
    tracks = []          # {id, box, last, prev_m, prev_e}
    frames = []          # per frame: list of (track id, cx, cy, fh, motion)
    next_id = 0
    n = 0
    stdin = sys.stdin.buffer
    while True:
        buf = stdin.read(size)
        if len(buf) < size:
            break
        img = np.frombuffer(buf, np.uint8).reshape((h, w, 3))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        t = n / fps
        seen = []
        for f in detect(kind, d, img):
            best, bi = None, 0.25
            for tr in tracks:
                v = iou(tr["box"], f["box"])
                if v > bi:
                    best, bi = tr, v
            if best is None:
                best = {"id": next_id, "box": f["box"], "last": t, "prev_m": None, "prev_e": None}
                next_id += 1
                tracks.append(best)
            m = patch(gray, f["mouth"], (32, 16))
            e = patch(gray, f["eyes"], (32, 12))
            motion = 0.0
            if m is not None and best["prev_m"] is not None:
                mm = float(np.abs(m - best["prev_m"]).mean())
                em = float(np.abs(e - best["prev_e"]).mean()) if (e is not None and best["prev_e"] is not None) else 0.0
                motion = max(0.0, mm - 0.7 * em)
            best.update(box=f["box"], last=t, prev_m=m, prev_e=e)
            x, y, fw, fh = f["box"]
            seen.append((best["id"], (x + fw / 2) / w, (y + fh / 2) / h, fh / h, motion))
        tracks = [tr for tr in tracks if t - tr["last"] <= 2.0]
        frames.append(seen)
        n += 1
        if n % 50 == 0:
            print(f"progress {n}", file=sys.stderr, flush=True)

    win = max(1, int(round(fps)))   # one second

    def choose(mode):
        cur, streak, cand, switches = None, 0, None, 0
        pick = []
        for i in range(0, len(frames), win):
            block = frames[i:i + win]
            visible = {}
            for fr in block:
                for (tid, cx, cy, fh, mo) in fr:
                    v = visible.setdefault(tid, {"size": 0.0, "talk": 0.0, "n": 0})
                    v["size"] += fh
                    v["n"] += 1
            for j, fr in enumerate(block):
                talking = (i + j) < len(speech) and speech[i + j]
                for (tid, cx, cy, fh, mo) in fr:
                    if talking:
                        visible[tid]["talk"] += mo
            if not visible:
                pick.append(cur)
                continue
            if mode == "speaker":
                best = max(visible, key=lambda k: visible[k]["talk"])
                strong = visible[best]["talk"] > 0.08 and (cur not in visible or visible[best]["talk"] > 1.3 * visible[cur]["talk"])
            else:
                best = max(visible, key=lambda k: visible[k]["size"] / max(1, visible[k]["n"]))
                strong = cur not in visible or visible[best]["size"] / max(1, visible[best]["n"]) > 1.25 * visible[cur]["size"] / max(1, visible[cur]["n"])
            if cur is None or cur not in visible:
                if cur is not None and cur != best:
                    switches += 1
                cur, streak, cand = best, 0, None
            elif best != cur and strong:
                streak = streak + 1 if cand == best else 1
                cand = best
                if streak >= 2:
                    cur, streak, cand = best, 0, None
                    switches += 1
            else:
                streak, cand = 0, None
            pick.append(cur)
        return pick, switches

    def path(pick):
        out = []
        cam = None
        last_target = None
        for i, fr in enumerate(frames):
            target = pick[i // win] if i // win < len(pick) else None
            hit = next((f for f in fr if f[0] == target), None)
            t = round(i / fps, 2)
            if hit is None:
                if cam is not None:
                    continue
                cam = [0.5, 0.45, 0.0]
                out.append([t, 0.5, 0.45, 0.0, 1])
                continue
            cx, cy, fh = hit[1], hit[2], hit[3]
            cut = cam is None or target != last_target
            if cut:
                cam = [cx, cy, fh]
            else:
                dx, dy = cx - cam[0], cy - cam[1]
                if abs(dx) > 0.04 or abs(dy) > 0.06:
                    cam[0] += dx * 0.25
                    cam[1] += dy * 0.25
                cam[2] += (fh - cam[2]) * 0.25
            last_target = target
            row = [t, round(cam[0], 3), round(cam[1], 3), round(cam[2], 3), 1 if cut else 0]
            if not out or cut or abs(row[1] - out[-1][1]) > 0.002 or abs(row[2] - out[-1][2]) > 0.002:
                out.append(row)
        return out

    sp, sp_sw = choose("speaker")
    fa, fa_sw = choose("face")
    with_face = sum(1 for fr in frames if fr)
    most = max((len(fr) for fr in frames), default=0)
    print(json.dumps({
        "detector": kind, "fps": fps, "frames": len(frames), "seen": round(with_face / max(1, len(frames)), 3),
        "faces": most, "tracks": next_id, "switches": {"speaker": sp_sw, "face": fa_sw},
        "speaker": path(sp), "face": path(fa),
    }, separators=(",", ":")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", type=int, default=480)
    ap.add_argument("--h", type=int, default=270)
    ap.add_argument("--fps", type=float, default=5.0)
    ap.add_argument("--speech", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--image", default="")
    args = ap.parse_args()
    if args.image:
        run_image(args)
    else:
        run_video(args)


if __name__ == "__main__":
    main()
