#!/usr/bin/env python3
"""Make card timestamps for a tier list from a video transcript.

    python3 tools/timestamps_from_transcript.py star-trek-set-review transcript.srt

The transcript can be an .srt or .vtt caption file (YouTube Studio > Subtitles > Download),
or text copied from "Show transcript" (lines like "12:34" followed by text).

The script walks through the cards in episode order. For each card it finds the first
transcript line, after the previous card's time, that says the card's name (or a
distinctive part of it, such as the part before a comma). Automatic captions often
spell card names wrong, so CHECK THE RESULT: the script lists every card it could not
place. Fix or add times by hand in data/timestamps/<slug>.json (values are seconds).

It writes data/timestamps/<slug>.json and sets "timestamps": true for the list in
data/tierlists.json.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STOP = {"the", "of", "a", "an", "and", "to", "in", "on", "for", "with", "by", "from", "at", "is"}


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower().replace("’", "'")
    return re.sub(r"[^a-z0-9' ]+", " ", s).strip()


def to_seconds(stamp):
    parts = [float(p.replace(",", ".")) for p in stamp.split(":")]
    secs = 0
    for p in parts:
        secs = secs * 60 + p
    return int(secs)


def parse(path):
    """Return a list of (seconds, text) lines."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    lines = []
    cue = re.compile(r"(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})\s*-->")
    if cue.search(text):  # SRT or VTT
        for block in re.split(r"\n\s*\n", text):
            m = cue.search(block)
            if not m:
                continue
            body = block[m.end():].split("\n", 1)[1] if "\n" in block[m.end():] else ""
            body = re.sub(r"<[^>]+>", "", body).replace("\n", " ").strip()
            if body:
                lines.append((to_seconds(m.group(1)), body))
    else:  # "Show transcript" copy: a time line, then text lines
        t = 0  # Text before the first time mark starts at 0:00.
        for raw in text.splitlines():
            raw = raw.strip()
            if re.fullmatch(r"\d{1,2}(:\d{2}){1,2}", raw):
                t = to_seconds(raw)
            elif raw and t is not None:
                lines.append((t, raw))
    return lines


def variants(name):
    """Names a host might say for a card, most specific first."""
    front = name.split(" // ")[0]
    out = [front, front.split(",")[0]]
    words = [w for w in norm(front.split(",")[0]).split() if w not in STOP]
    if len(words) >= 2:
        out.append(" ".join(words[:2]))
    if words and len(words[0]) >= 5:
        out.append(words[0])
    seen, res = set(), []
    for v in out:
        v = norm(v)
        if v and v not in seen:
            seen.add(v)
            res.append(v)
    return res


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    slug, transcript = sys.argv[1], sys.argv[2]
    lst = json.loads((DATA / "tierlists" / f"{slug}.json").read_text())
    lines = parse(transcript)
    if not lines:
        sys.exit("No timed lines found in the transcript.")
    own = [(t, norm(txt)) for t, txt in lines]

    def find(pat, start):
        """Time of the first line at or after start that says pat. A name can break
        across two caption lines, so also try each line joined with the next one,
        but only when the name is in neither line alone."""
        for i, (t, txt) in enumerate(own):
            if t < start:
                continue
            if pat.search(txt):
                return t
            nxt = own[i + 1][1] if i + 1 < len(own) else ""
            if nxt and not pat.search(nxt) and pat.search(txt + " " + nxt):
                return t
        return None

    cards = sorted({c["name"]: c for c in lst["cards"]}.values(), key=lambda c: c["order"])
    times, missing, start = {}, [], 0
    for c in cards:
        hit = None
        for v in variants(c["name"]):
            pat = re.compile(r"\b" + re.escape(v) + r"\b")
            hit = find(pat, start)
            if hit is not None:
                break
        if hit is None:
            missing.append(c["name"])
            continue
        times[c["name"]] = max(0, hit - 3)  # Start a few seconds early.
        start = hit

    out = DATA / "timestamps" / f"{slug}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(times, indent=1, ensure_ascii=False) + "\n")
    manifest = json.loads((DATA / "tierlists.json").read_text())
    for e in manifest:
        if e["file"] == f"{slug}.json":
            e["timestamps"] = True
    (DATA / "tierlists.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Placed {len(times)} of {len(cards)} cards. Wrote {out.relative_to(ROOT)}.")
    for name, t in times.items():
        print(f"  {t // 60:>3}:{t % 60:02d}  {name}")
    if missing:
        print("Not found (add by hand):")
        for n in missing:
            print("  -", n)


if __name__ == "__main__":
    main()
