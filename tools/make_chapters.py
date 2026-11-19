#!/usr/bin/env python3
"""Make YouTube chapter lists from the card timestamps.

    python3 tools/make_chapters.py

For every tier list with timestamps and a video, this writes
docs/youtube-chapters/<slug>.txt: text to paste into the video description.
YouTube turns it into chapters when:
  - the first time is 0:00,
  - there are at least 3 times, in order,
  - each chapter is at least 10 seconds long.
The script checks these rules and prints any problems.

Extra chapters that are not cards (for example "Mechanics") go in
data/chapters-extra.json: { "<slug>": { "6:39": "Mechanics" } }
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "youtube-chapters"
MIN_GAP = 10


def fmt(t):
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def secs(stamp):
    v = 0
    for p in stamp.split(":"):
        v = v * 60 + int(p)
    return v


def main():
    manifest = json.loads((DATA / "tierlists.json").read_text())
    videos = {v["id"]: v for v in json.loads((DATA / "videos.json").read_text())}
    extra_path = DATA / "chapters-extra.json"
    extras = json.loads(extra_path.read_text()) if extra_path.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    problems = 0
    made = []
    for e in manifest:
        slug = e["file"].removesuffix(".json")
        tfile = DATA / "timestamps" / f"{slug}.json"
        if not e.get("timestamps") or not e.get("youtube") or not tfile.exists():
            continue
        vid = e["youtube"].split("v=")[-1][:11]
        title = json.loads((DATA / "tierlists" / e["file"]).read_text())["title"]
        rows = [(t, name) for name, t in json.loads(tfile.read_text()).items()]
        rows += [(secs(k), v) for k, v in extras.get(slug, {}).items()]
        rows.sort()
        if not rows or rows[0][0] != 0:
            rows.insert(0, (0, "Intro"))
        # A chapter shorter than 10 s breaks YouTube chapters. Report it.
        for (t1, n1), (t2, n2) in zip(rows, rows[1:]):
            if t2 - t1 < MIN_GAP:
                problems += 1
                print(f"  {slug}: '{n1}' at {fmt(t1)} is only {t2 - t1}s before '{n2}' at {fmt(t2)}")
        body = "\n".join(f"{fmt(t)} {name}" for t, name in rows)
        (OUT / f"{slug}.txt").write_text(body + "\n")
        made.append((slug, title, videos.get(vid, {}).get("title", ""), vid, len(rows)))
    print(f"Wrote {len(made)} chapter files to {OUT.relative_to(ROOT)}/")
    for slug, title, vtitle, vid, n in made:
        print(f"  {slug}.txt  {n} chapters  https://youtu.be/{vid}  ({vtitle or title})")
    if problems:
        print(f"{problems} chapter(s) shorter than {MIN_GAP} seconds: fix them before pasting.")
        sys.exit(1)


if __name__ == "__main__":
    main()
