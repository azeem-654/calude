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

What else is read from the same frames (``analysis``, since 2026-11)
--------------------------------------------------------------------
A Short cut from a landscape recording used to be a crop of its middle. To
frame it round what matters, the same pass also notes, from the picture
alone (no operating-system pointer is ever available for an uploaded file):

  - the **mouse pointer**: on a mostly still frame, the one small blob that
    changed between frames, with the contrast of an arrow on a page, followed
    from frame to frame (a blinking caret never moves, so it is never a
    pointer); rows [t, x, y] of the frame, only while it moves;
  - **where things happen**: a 12×7 grid of how much each cell changed, per
    second, reduced to the centre and spread of the activity;
  - **scene cuts**: a frame most of which changed at once;
  - the **content box**: the part of the frame that ever holds edges or
    movement (the slide, the browser window — not the desktop round it);
  - how **flat** and how **still** the picture is — a screen is large flat
    areas that hardly change; camera footage is noise and texture;
  - and from all that plus the faces, the **kind** of recording: ``screen``
    (with a pointer), ``screencam`` (a screen with a small webcam picture),
    ``slides`` (a screen that hardly changes), ``talking`` (one face, large),
    ``two`` (two people), or ``camera`` (anything else), with ``why``.

Every number is a share of the frame (0–1) so the Worker can plan a crop
for any output size; the Worker's reframe.ts does the planning.
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
    try:
        c = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        return ("haar", c)
    except Exception:  # noqa: BLE001 — a build without the cascade still reads the picture (no faces, said so)
        return ("none", None)


def detect(kind, d, img):
    """Faces as dicts: box (x, y, w, h) in pixels, mouth and eyes boxes, score."""
    out = []
    if kind == "none":
        return out
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



GRID_W, GRID_H = 12, 7


class Analyser:
    """What the frames say about the recording besides faces (see the module
    docstring). Fed one grey frame at a time; nothing is kept per frame but
    the previous frame, so an hour costs no more memory than a minute."""

    def __init__(self, w, h, fps):
        self.w, self.h, self.fps = w, h, fps
        self.prev = None
        self.n = 0
        self.cuts = []
        self.sec_motion = {}      # second -> summed motion grid (GRID_H × GRID_W)
        self.sec_frames = {}
        self.edge_sum = np.zeros((GRID_H, GRID_W), np.float64)
        self.edge_n = 0
        self.flat_sum = 0.0
        self.flat_n = 0
        self.still = 0
        self.cursor = []          # [t, x, y] while it moves
        self.cur_prev = None      # (x, y, t) of the last pointer seen
        self.cur_vel = (0.0, 0.0)
        self.cur_secs = set()
        self.cut_cool = 0.0
        self.moving_secs = set()
        # Blob limits at this scale: a pointer is ~8–14 px wide at 480 wide.
        k = w / 480.0
        self.blob_min = max(4, int(6 * k * k))
        self.blob_max = int(420 * k * k)
        self.blob_side = int(34 * k)

    def feed(self, gray, t):
        g = gray
        self.n += 1
        sec = int(t)
        if self.n % 5 == 1:
            # Edges and flatness, every fifth frame (they change slowly).
            edges = cv2.Canny(g, 80, 160)
            cells = cv2.resize((edges > 0).astype(np.float32), (GRID_W, GRID_H), interpolation=cv2.INTER_AREA)
            self.edge_sum += cells
            self.edge_n += 1
            sx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)
            sy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
            mag = np.abs(sx) + np.abs(sy)
            self.flat_sum += float((mag < 8).mean())
            self.flat_n += 1
        if self.prev is None:
            self.prev = g
            return
        d = cv2.absdiff(g, self.prev)
        changed = d > 24
        frac = float(changed.mean())
        mean = float(d.mean())
        if mean > 30 and frac > 0.45:
            # A cut: the pointer is lost with the old picture.
            self.cuts.append(round(t, 2))
            self.cur_prev = None
            self.cut_cool = t
            self.prev = g
            self.sec_frames[sec] = self.sec_frames.get(sec, 0) + 1
            return
        if frac < 0.002:
            self.still += 1
        else:
            self.moving_secs.add(sec)
        cells = cv2.resize(changed.astype(np.float32), (GRID_W, GRID_H), interpolation=cv2.INTER_AREA)
        acc = self.sec_motion.get(sec)
        self.sec_motion[sec] = cells if acc is None else acc + cells
        self.sec_frames[sec] = self.sec_frames.get(sec, 0) + 1
        # The pointer: a small changed blob on an otherwise still picture.
        if 0.0 < frac < 0.03 and t - self.cut_cool > 0.4:
            self._pointer(g, changed.astype(np.uint8), t)
        elif self.cur_prev is not None and t - self.cur_prev[2] > 2.5:
            self.cur_prev = None
        self.prev = g

    def _pointer(self, g, mask, t):
        n, _labels, stats, cents = cv2.connectedComponentsWithStats(mask, connectivity=8)
        cands = []
        for i in range(1, n):
            x, y, bw, bh, area = (int(v) for v in stats[i])
            if area < self.blob_min or area > self.blob_max or bw > self.blob_side or bh > self.blob_side:
                continue
            x0, y0 = max(0, x - 2), max(0, y - 2)
            box = g[y0:min(self.h, y + bh + 2), x0:min(self.w, x + bw + 2)]
            if box.size < 9:
                continue
            contrast = float(box.std())
            # An arrow is light with a dark rim (or the reverse): it stands out from its own surroundings.
            if contrast < 18:
                continue
            cands.append((float(cents[i][0]), float(cents[i][1]), contrast, area))
        if not cands:
            return
        if len(cands) > 6:
            # Many small things changing at once: a page scrolling, a video — not a pointer.
            return
        if self.cur_prev is not None and t - self.cur_prev[2] <= 1.0:
            px, py, pt = self.cur_prev
            dt = max(1e-3, t - pt)
            # The pointer leaves two blobs when it jumps (where it was, where it is): the one ahead of its movement is where it is.
            ax, ay = px + self.cur_vel[0] * dt, py + self.cur_vel[1] * dt
            best = min(cands, key=lambda c: (c[0] - ax) ** 2 + (c[1] - ay) ** 2)
            if len(cands) >= 2:
                far = max(cands, key=lambda c: (c[0] - px) ** 2 + (c[1] - py) ** 2)
                near = min(cands, key=lambda c: (c[0] - px) ** 2 + (c[1] - py) ** 2)
                if (near[0] - px) ** 2 + (near[1] - py) ** 2 < 9 and far is not near:
                    best = far
            self.cur_vel = ((best[0] - px) / dt, (best[1] - py) / dt)
        else:
            best = max(cands, key=lambda c: c[2])
            self.cur_vel = (0.0, 0.0)
        x, y = best[0], best[1]
        if self.cur_prev is not None and abs(x - self.cur_prev[0]) < 1.5 and abs(y - self.cur_prev[1]) < 1.5:
            self.cur_prev = (x, y, t)
            return
        self.cur_prev = (x, y, t)
        self.cur_secs.add(int(t))
        if len(self.cursor) < 40000:
            self.cursor.append([round(t, 2), round(x / self.w, 4), round(y / self.h, 4)])

    def result(self, people, seen, faces_most):
        frames = max(1, self.n)
        secs = max(1, len(self.sec_frames))
        flat = self.flat_sum / max(1, self.flat_n)
        still = self.still / max(1, frames - 1 - len(self.cuts))
        cursor_seen = len(self.cur_secs) / secs
        moving = len(self.moving_secs) / secs
        # Where things happen, per second: the centre and spread of the change.
        ys, xs = np.mgrid[0:GRID_H, 0:GRID_W]
        cxg = (xs + 0.5) / GRID_W
        cyg = (ys + 0.5) / GRID_H
        activity = []
        union = np.zeros((GRID_H, GRID_W), np.float64)
        for sec in sorted(self.sec_motion):
            grid = self.sec_motion[sec] / max(1, self.sec_frames.get(sec, 1))
            total = float(grid.sum())
            union = np.maximum(union, grid)
            if total < 0.02:
                continue
            wgt = grid / total
            cx = float((wgt * cxg).sum())
            cy = float((wgt * cyg).sum())
            spread = float(np.sqrt((wgt * ((cxg - cx) ** 2 + (cyg - cy) ** 2)).sum()))
            activity.append([sec, round(cx, 3), round(cy, 3), round(spread, 3), round(min(1.0, total / (GRID_W * GRID_H)), 3)])
        edges = self.edge_sum / max(1, self.edge_n)
        content = content_box(edges, union)
        kind, why = classify(people, seen, faces_most, flat, still, cursor_seen, moving, len(self.cuts) / max(1.0, secs / 60.0))
        return {
            "v": 2, "kind": kind, "why": why,
            "flat": round(flat, 3), "still": round(still, 3), "cursorSeen": round(cursor_seen, 3), "moving": round(moving, 3),
            "cuts": self.cuts[:2000], "content": content, "cursor": self.cursor, "activity": activity[:7200],
            "grid": [GRID_W, GRID_H], "edges": [round(float(v), 3) for v in edges.flatten()],
        }


def content_box(edges, motion):
    """The part of the frame that ever carries edges or movement, as [x, y, w, h] of the frame.
    A desktop's empty margin or a letterbox has neither. Small boxes are not trusted."""
    score = np.maximum(edges / max(1e-6, float(edges.max())), motion / max(1e-6, float(motion.max())))
    live = score >= 0.12
    ys, xs = np.where(live)
    if len(xs) == 0:
        return [0.0, 0.0, 1.0, 1.0]
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    w, h = (x1 - x0) / GRID_W, (y1 - y0) / GRID_H
    if w * h < 0.3 or (w >= 0.95 and h >= 0.95):
        return [0.0, 0.0, 1.0, 1.0]
    return [round(x0 / GRID_W, 3), round(y0 / GRID_H, 3), round(w, 3), round(h, 3)]


def classify(people, seen, faces_most, flat, still, cursor_seen, moving, cuts_per_min):
    """The kind of recording, and why — read by the Worker's reframe.ts to choose how a Short is framed."""
    ps = sorted([p for p in people if p["share"] >= 0.15], key=lambda p: -p["share"])
    big = [p for p in ps if p["h"] >= 0.14 and p["share"] >= 0.4]
    bubble = None
    if len(ps) == 1:
        p = ps[0]
        edge = max(abs(p["cx"] - 0.5), abs(p["cy"] - 0.5))
        if p["share"] >= 0.4 and p["h"] <= 0.22 and edge >= 0.26:
            bubble = p
    two = len([p for p in ps if p["share"] >= 0.25]) >= 2
    screenish = flat >= 0.5 and still >= 0.45
    pct = lambda v: f"{round(v * 100)}%"
    if two and not screenish:
        return "two", f"two people on screen most of the time ({pct(ps[0]['share'])} and {pct(ps[1]['share'])} of the frames)"
    if big and not screenish:
        return "talking", f"one face, {pct(big[0]['h'])} of the frame tall, in {pct(big[0]['share'])} of the frames"
    if screenish and bubble:
        return "screencam", f"a flat, still picture ({pct(flat)} flat, {pct(still)} still) with a small face in a corner ({pct(bubble['share'])} of the frames)"
    if screenish and cursor_seen >= 0.04:
        return "screen", f"a flat, still picture ({pct(flat)} flat) with a pointer moving in {pct(cursor_seen)} of the seconds"
    if screenish and still >= 0.85 and moving < 0.3:
        return "slides", f"a flat picture that hardly changes ({pct(still)} of the frames still), no pointer found"
    if screenish:
        return "screen", f"a flat, still picture ({pct(flat)} flat, {pct(still)} still), no pointer found; things move in {pct(moving)} of the seconds"
    if big:
        return "talking", f"one face, {pct(big[0]['h'])} of the frame tall, in {pct(big[0]['share'])} of the frames"
    if two:
        return "two", f"two people on screen ({pct(ps[0]['share'])} and {pct(ps[1]['share'])} of the frames)"
    if seen >= 0.3 and ps:
        return "talking", f"a face in {pct(seen)} of the frames"
    return "camera", f"camera footage ({pct(flat)} flat, {pct(still)} still, {cuts_per_min:.1f} cuts a minute), no face most of the time"


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
    an = Analyser(w, h, fps)
    stdin = sys.stdin.buffer
    while True:
        buf = stdin.read(size)
        if len(buf) < size:
            break
        img = np.frombuffer(buf, np.uint8).reshape((h, w, 3))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        t = n / fps
        an.feed(gray, t)
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
            seen.append((best["id"], (x + fw / 2) / w, (y + fh / 2) / h, fh / h, motion, fw / w))
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
                for (tid, cx, cy, fh, mo, _fw) in fr:
                    v = visible.setdefault(tid, {"size": 0.0, "talk": 0.0, "n": 0})
                    v["size"] += fh
                    v["n"] += 1
            for j, fr in enumerate(block):
                talking = (i + j) < len(speech) and speech[i + j]
                for (tid, cx, cy, fh, mo, _fw) in fr:
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
    people = gather_people(frames)
    with_face = sum(1 for fr in frames if fr)
    most = max((len(fr) for fr in frames), default=0)
    seen_share = round(with_face / max(1, len(frames)), 3)
    print(json.dumps({
        "detector": kind, "fps": fps, "frames": len(frames), "seen": seen_share,
        "faces": most, "tracks": next_id, "switches": {"speaker": sp_sw, "face": fa_sw},
        "speaker": path(sp), "face": path(fa), "people": people,
        "analysis": an.result(people, seen_share, most),
    }, separators=(",", ":")))


def gather_people(frames):
    """The people on screen: each face track's median place and size, tracks
    of the same person (lost for a moment, then found again in the same place)
    joined, with the share of frames they are in. What the Shorts layouts read
    to tell a webcam bubble on a screen recording from two people side by side."""
    by = {}
    for fr in frames:
        for (tid, cx, cy, fh, _mo, fw) in fr:
            by.setdefault(tid, []).append((cx, cy, fw, fh))
    total = max(1, len(frames))
    tracks = []
    for tid, rows in by.items():
        a = np.array(rows)
        tracks.append({"cx": float(np.median(a[:, 0])), "cy": float(np.median(a[:, 1])), "w": float(np.median(a[:, 2])), "h": float(np.median(a[:, 3])), "n": len(rows)})
    tracks.sort(key=lambda t: -t["n"])
    people = []
    for t in tracks:
        same = next((p for p in people if abs(p["cx"] - t["cx"]) < 0.08 and abs(p["cy"] - t["cy"]) < 0.1), None)
        if same:
            same["n"] += t["n"]
        else:
            people.append(dict(t))
    people.sort(key=lambda p: -p["n"])
    return [{"cx": round(p["cx"], 3), "cy": round(p["cy"], 3), "w": round(p["w"], 3), "h": round(p["h"], 3), "share": round(min(1.0, p["n"] / total), 3)}
            for p in people[:4] if p["n"] >= 3]


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
