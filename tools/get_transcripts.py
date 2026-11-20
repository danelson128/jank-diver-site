#!/usr/bin/env python3
"""Download the YouTube transcripts for the tier list videos in one go.

Run this on your own computer (YouTube blocks cloud servers):

    pip install youtube-transcript-api
    python3 get_transcripts.py

It makes a folder "transcripts" with one .txt file per video, and a
transcripts.zip with all of them. Upload the zip to Claude.

To download other videos, add them to VIDEOS below: "file-name": "VIDEO_ID".
The video ID is the part after "youtu.be/" or "watch?v=" in the link.
"""
import sys
import time
import zipfile
from pathlib import Path

VIDEOS = {
    # Guilds
    "azorius-guild-cards": "_G-5WlNSySw",
    "dimir-guild-cards": "yBBzZj8_pVw",
    "rakdos-guild-cards": "CtdQg8a0EsQ",
    "golgari-guild-cards": "SN1xbsWXXrA",
    "selesnya-guild-cards": "c9X7BveYYp0",
    "gruul-guild-cards": "TAOkvxklXVQ",
    "simic-guild-cards": "KNkUTNFnYPM",
    # Colorless
    "colorless": "eTOQSOLd2DM",
    # 2-drops
    "white-2-drops": "8PqY9BJFOzw",
    "blue-2-drops": "-JDEvCo2RUY",
    "black-2-drops": "f44qbGNo9wM",
    "red-2-drops": "J3GSoz-EzaI",
    "green-2-drops": "Tu_YbmPov3k",
    # 3-drops
    "white-3-drops": "MdQv5uLU1YE",
    "blue-3-drops": "Qbu_bl4L2DA",
    "black-3-drops": "JkRZU2kQRvs",
    "red-3-drops": "ZpSRmqn1Eu4",
    "green-3-drops": "imR1R6FAjY4",
    # Other tier lists
    "white-4-drops": "UqPPTdFnV24",
    "secrets-of-strixhaven-set-review": "Ch0Ny_IeTIw",
    "tmnt-set-review": "erP-Kph-Vx4",
    "mdfc": "wpplCIZ4LWA",
    "kor-skyfisher": "-Yvo3_Z_DOg",
}


def fmt(seconds):
    t = int(seconds)
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def fetch(video_id):
    """Return a list of (start_seconds, text). Works with old and new versions of the library."""
    from youtube_transcript_api import YouTubeTranscriptApi
    if hasattr(YouTubeTranscriptApi, "get_transcript"):  # version 0.x
        return [(x["start"], x["text"]) for x in YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])]
    data = YouTubeTranscriptApi().fetch(video_id, languages=["en"])  # version 1.x
    return [(x.start, x.text) for x in data]


def main():
    try:
        import youtube_transcript_api  # noqa: F401
    except ImportError:
        sys.exit("First run:  pip install youtube-transcript-api")
    out = Path("transcripts")
    out.mkdir(exist_ok=True)
    ok, failed = [], []
    for name, vid in VIDEOS.items():
        try:
            rows = fetch(vid)
        except Exception as e:  # no captions, private video, network problem...
            failed.append((name, vid, type(e).__name__))
            print(f"  FAILED  {name}  ({type(e).__name__})")
            continue
        # Same layout as YouTube's "Show transcript": a time line, then the text.
        text = "\n".join(f"{fmt(t)}\n{line.replace(chr(10), ' ')}" for t, line in rows)
        (out / f"{name}.txt").write_text(f"https://youtu.be/{vid}\n{text}\n", encoding="utf-8")
        ok.append(name)
        print(f"  ok      {name}  ({len(rows)} lines)")
        time.sleep(1)  # be polite to YouTube
    with zipfile.ZipFile("transcripts.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.glob("*.txt")):
            z.write(f, f.name)
    print(f"\nDownloaded {len(ok)} of {len(VIDEOS)}. Upload transcripts.zip to Claude.")
    if failed:
        print("These failed (try again later, or copy them from YouTube by hand):")
        for name, vid, err in failed:
            print(f"  {name}: https://youtu.be/{vid}  ({err})")


if __name__ == "__main__":
    main()
