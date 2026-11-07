#!/usr/bin/env python3
"""Look up every tier-listed card on Scryfall once and save the result to data/cards.json.

For each card, the script uses the FIRST paper printing (oldest release date).
It skips digital-only, promo and oversized printings when it can.

Run it after you add or change a tier list:

    python3 tools/fetch_cards.py            # look up new cards only
    python3 tools/fetch_cards.py --refresh  # look up all cards again

To force a specific printing, add it to data/card-overrides.json:

    { "Mother of Runes": { "set": "ulg", "collector_number": "14" } }
"""
import json
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "cards.json"
OVERRIDES = DATA / "card-overrides.json"
API = "https://api.scryfall.com"
HEADERS = {"User-Agent": "JankDiverGamingSite/1.0", "Accept": "application/json"}
DELAY = 0.12  # Scryfall asks for 50-100 ms between requests.


def norm(name):
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("’", "'").strip().lower()


def get(url):
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 429:
            time.sleep(2)
            return get(url)
        raise


def search(query):
    q = urllib.parse.urlencode({"q": query, "unique": "prints", "order": "released", "dir": "asc"})
    res = get(f"{API}/cards/search?{q}")
    return res["data"] if res and res.get("data") else []


def first_printing(name):
    front = name.split(" // ")[0].strip()
    base = f'!"{front}"'
    for filters in (" game:paper -is:digital -is:promo -is:oversized -set_type:memorabilia",
                    " -is:digital", ""):
        prints = search(base + filters)
        if prints:
            # Oldest release first; on ties keep Scryfall order.
            return sorted(prints, key=lambda c: c.get("released_at", "9999"))[0]
    # Last try: fuzzy name match (handles small spelling differences).
    return get(f"{API}/cards/named?" + urllib.parse.urlencode({"fuzzy": front}))


def images(card):
    def pick(uris):
        return {"normal": uris.get("normal"), "large": uris.get("large"), "small": uris.get("small")}
    if card.get("image_uris"):
        return pick(card["image_uris"]), None
    faces = card.get("card_faces") or []
    front = pick(faces[0]["image_uris"]) if faces and faces[0].get("image_uris") else None
    back = pick(faces[1]["image_uris"]) if len(faces) > 1 and faces[1].get("image_uris") else None
    return front, back


def summarize(card, wanted):
    front, back = images(card)
    faces = card.get("card_faces") or [card]
    return {
        "name": card["name"],
        "wanted": wanted,
        "set": card["set"],
        "set_name": card["set_name"],
        "collector_number": card["collector_number"],
        "released": card.get("released_at"),
        "rarity": card.get("rarity"),
        "mana_cost": card.get("mana_cost") or faces[0].get("mana_cost", ""),
        "cmc": card.get("cmc"),
        "type_line": card.get("type_line") or faces[0].get("type_line", ""),
        "color_identity": card.get("color_identity", []),
        "image": front,
        "back_image": back,
        "scryfall_uri": card.get("scryfall_uri"),
    }


def main():
    refresh = "--refresh" in sys.argv
    manifest = json.loads((DATA / "tierlists.json").read_text())
    names = []
    for entry in manifest:
        lst = json.loads((DATA / "tierlists" / entry["file"]).read_text())
        names += [c["name"] for c in lst["cards"]]
    unique = {}
    for n in names:
        unique.setdefault(norm(n), n)

    cards = {} if refresh or not OUT.exists() else json.loads(OUT.read_text())
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    overrides = {norm(k): v for k, v in overrides.items()}

    missing = []
    todo = [k for k in unique if k not in cards or k in overrides]
    print(f"{len(unique)} unique cards, {len(todo)} to look up.")
    for i, key in enumerate(todo, 1):
        name = unique[key]
        if key in overrides:
            o = overrides[key]
            card = get(f"{API}/cards/{o['set'].lower()}/{urllib.parse.quote(str(o['collector_number']))}")
        else:
            card = first_printing(name)
        if not card:
            missing.append(name)
            print(f"  [{i}/{len(todo)}] NOT FOUND: {name}")
            continue
        cards[key] = summarize(card, name)
        print(f"  [{i}/{len(todo)}] {name} -> {card['set'].upper()} #{card['collector_number']} ({card.get('released_at')})")

    # Drop cards that are no longer in any tier list.
    cards = {k: v for k, v in sorted(cards.items()) if k in unique}
    OUT.write_text(json.dumps(cards, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {len(cards)} cards to {OUT.relative_to(ROOT)}.")
    if missing:
        print("Not found (add these to data/card-overrides.json):")
        for n in missing:
            print("  -", n)


if __name__ == "__main__":
    main()
