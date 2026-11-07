#!/usr/bin/env python3
"""Add new Jank Diver Gaming videos to data/videos.json from the channel's public RSS feed.

The feed lists the 15 newest videos with exact upload dates. Run this after each upload:

    python3 tools/fetch_videos.py

The script keeps videos that are already in the file. It corrects their dates if the feed
has the exact date. To link a video to a tier list, put its link in data/tierlists.json.
"""
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

CHANNEL_ID = "UCot_0XDKU-H7ZQ1f8B25Cgg"
FEED = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
OUT = Path(__file__).resolve().parent.parent / "data" / "videos.json"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def kind_of(title):
    t = title.lower()
    if "tier list" in t:
        return "Tier List"
    if "cube draft" in t:
        return "Cube Draft"
    if "swaps" in t or "update" in t:
        return "Cube Update"
    if "jank tank" in t:
        return "The Jank Tank"
    return "Video"


def main():
    req = urllib.request.Request(FEED, headers={"User-Agent": "JankDiverGamingSite/1.0"})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=30).read())
    videos = json.loads(OUT.read_text()) if OUT.exists() else []
    by_id = {v["id"]: v for v in videos}
    added = 0
    for e in root.findall("a:entry", NS):
        vid = e.find("yt:videoId", NS).text
        title = e.find("a:title", NS).text
        date = e.find("a:published", NS).text[:10]
        if vid in by_id:
            v = by_id[vid]
            v["title"], v["date"] = title, date
            v.pop("date_approx", None)
        else:
            by_id[vid] = {"id": vid, "title": title, "date": date, "kind": kind_of(title)}
            added += 1
    videos = sorted(by_id.values(), key=lambda v: v["date"], reverse=True)
    OUT.write_text(json.dumps(videos, indent=1, ensure_ascii=False) + "\n")
    print(f"{added} new video(s). {len(videos)} videos in {OUT.name}.")


if __name__ == "__main__":
    main()
