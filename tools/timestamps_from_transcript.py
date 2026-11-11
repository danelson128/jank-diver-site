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
import bisect
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


INLINE = re.compile(
    r"(?P<time>\d{1,2}:\d{2}(?::\d{2})?)"
    r"(?:\d+ hours?,? ?)?(?:\d+ minutes?,? ?)?(?:\d+ seconds?)?"
    r"(?P<text>.*)$"
)
# Only treat a file as this format if the label is really there.
INLINE_CHECK = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?\d+ (?:hours?|minutes?|seconds?)", re.M)


COLD_OPEN = 45  # Seconds. The cold open often mentions cards before the review starts.
# How the host introduces a card, in compact text: "fiveinablackfora", "twoandaredfor", "bluefora".
INTRO = re.compile(r"(?:one|two|three|four|five|six|seven|eight|nine|ten|\d)(?:in|and)an?"
                   r"(?:white|blue|black|red|green|colorless|generic)"
                   r"|(?:white|blue|black|red|green)fora")


def compact(s):
    return re.sub(r"[^a-z0-9]", "", norm(s))


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
    elif INLINE_CHECK.search(text):
        # "Show transcript" copy with screen-reader labels, one line per caption:
        # "1:31:511 hour, 31 minutes, 51 secondsText..."
        for raw in text.splitlines():
            m = INLINE.match(raw.strip())
            if m and m.group("text").strip():
                lines.append((to_seconds(m.group("time")), m.group("text").strip()))
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
    # Search a "compact" copy of the transcript with no spaces or punctuation, so that
    # captions like "shriek maw" or "Blasto Neuron" still match the card name.
    starts, parts, pos = [], [], 0
    for t, txt in lines:
        c = compact(txt)
        starts.append((pos, t))
        parts.append(c)
        pos += len(c)
    stream = "".join(parts)
    offsets = [p for p, _ in starts]

    def time_at(p):
        return starts[bisect.bisect_right(offsets, p) - 1][1]

    cards = sorted({c["name"]: c for c in reversed(lst["cards"])}.values(), key=lambda c: c["order"])
    first_words = [compact(norm(c["name"].split(" // ")[0]).split()[0]) for c in cards]
    times, how, missing = {}, {}, []
    for c in cards:
        hits = []
        for v in variants(c["name"]):
            v = compact(v)
            # A single word is only safe when no other card in the list starts with it.
            if v == compact(norm(c["name"].split(" // ")[0]).split()[0]) and first_words.count(v) > 1:
                continue
            hits = [m.start() for m in re.finditer(re.escape(v), stream)]
            if hits:
                break
        if not hits:
            missing.append(c["name"])
            continue
        # Prefer the mention where the host introduces the card ("…is five in a black
        # for a…"), and skip the cold open at the start of the video.
        intro = [p for p in hits if time_at(p) >= COLD_OPEN and INTRO.search(stream, p, p + 220)]
        later = [p for p in hits if time_at(p) >= COLD_OPEN]
        best, kind = (intro[0], "intro") if intro else (later[0], "mention") if later else (hits[0], "cold open")
        times[c["name"]] = max(0, time_at(best) - 3)  # Start a few seconds early.
        how[c["name"]] = kind
    times = dict(sorted(times.items(), key=lambda kv: kv[1]))

    out = DATA / "timestamps" / f"{slug}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(times, indent=1, ensure_ascii=False) + "\n")
    manifest = json.loads((DATA / "tierlists.json").read_text())
    for e in manifest:
        if e["file"] == f"{slug}.json":
            e["timestamps"] = True
    (DATA / "tierlists.json").write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Placed {len(times)} of {len(cards)} cards. Wrote {out.relative_to(ROOT)}.")
    print("Check the ones marked 'mention': the script found the name, but not the usual introduction.")
    order = {c["name"]: c["order"] for c in cards}
    for name, t in times.items():
        print(f"  {t // 60:>3}:{t % 60:02d}  {how[name]:<9} #{order[name]:<3} {name}")
    if missing:
        print("Not found (add by hand):")
        for n in missing:
            print("  -", n)


if __name__ == "__main__":
    main()
