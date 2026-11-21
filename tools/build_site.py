#!/usr/bin/env python3
"""Build the full website into a folder, including a page for every card and tier list.

    python3 tools/build_site.py            # builds into _site/
    python3 tools/build_site.py --out DIR

GitHub runs this on every push to main (.github/workflows/pages.yml) and publishes
the result, so the card pages always match the data. To preview locally:

    python3 tools/build_site.py && python3 -m http.server 8000 --directory _site

What it makes, next to a copy of the normal site:
  cards/<slug>/index.html      one page per graded card
  cards/index.html             all cards, A to Z
  tierlists/<slug>/index.html  one page per tier list
  tierlists/index.html         all tier lists
  data/card-pages.json         card name -> page slug (the app links to the pages with it)
  sitemap.xml, robots.txt, 404.html

Nothing here needs to be edited when tier lists, cards, timestamps or videos are
added: everything comes from the files in data/.
"""
import argparse
import html
import json
import re
import shutil
import sys
import unicodedata
from urllib.parse import quote
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATIC = ["index.html", "app.js", "buy.js", "styles.css", "CNAME"]

TIERS = ["S", "A", "B", "C", "D", "F"]
SIGN = {1: "+", 0: "", -1: "−"}
RARITY = ["common", "uncommon", "rare", "mythic"]


# ---------- Rules shared with app.js (keep them the same) ----------

def norm(s):
    """Same as norm() in app.js: the key used for card names everywhere."""
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if not ("̀" <= c <= "ͯ"))
    return s.replace("’", "'").strip().lower()


def raw_mod(c):
    try:
        return int(c.get("mod") or 0)
    except (TypeError, ValueError):
        return 0


def mod_of(c):
    """Shown grades are +, plain or −. A ★ (2) counts as +, a ⊘ (−2) as −."""
    return max(-1, min(1, raw_mod(c)))


def grade_label(c):
    return c["tier"] + SIGN[mod_of(c)]


def grade_index(c):
    """S+ = 0 ... D− = 14. Lower is better."""
    return TIERS.index(c["tier"]) * 3 + [1, 0, -1].index(mod_of(c))


def grade_color(i):
    return f"hsl({round(140 * (1 - min(i, 14) / 14))} 72% 50%)"


def best_first(cards):
    return sorted(cards, key=lambda c: (grade_index(c), -raw_mod(c), c.get("rank", 0), c["order"]))


def youtube_id(v):
    if not v:
        return ""
    m = re.search(r"(?:youtu\.be/|v=|embed/|shorts/|live/)([\w-]{11})", v)
    return m.group(1) if m else (v if re.fullmatch(r"[\w-]{11}", v) else "")


def fmt_time(t):
    h, m, s = t // 3600, t % 3600 // 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def fmt_date(d, approx=False):
    if not d:
        return ""
    dt = date.fromisoformat(d[:10])
    return dt.strftime("~%b %Y") if approx else f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def slugify(name):
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ---------- Data ----------

def load():
    site = json.loads((DATA / "site.json").read_text())
    manifest = json.loads((DATA / "tierlists.json").read_text())
    cards = json.loads((DATA / "cards.json").read_text())
    videos = {youtube_id(v["id"]): v for v in json.loads((DATA / "videos.json").read_text())}
    lists = []
    for m in manifest:
        slug = m["file"].removesuffix(".json")
        data = json.loads((DATA / "tierlists" / m["file"]).read_text())
        seen, kept = set(), []
        for c in data["cards"]:
            if c.get("tier") not in TIERS or norm(c["name"]) in seen:
                continue  # skip cards with no grade, and repeats
            seen.add(norm(c["name"]))
            kept.append(c)
        times = {}
        tfile = DATA / "timestamps" / f"{slug}.json"
        if m.get("timestamps") and tfile.exists():
            times = {norm(k): int(round(v)) for k, v in json.loads(tfile.read_text()).items()}
        yt = youtube_id(m.get("youtube", ""))
        video = videos.get(yt, {})
        lists.append({
            "slug": slug, "title": data["title"], "cards": kept, "times": times, "youtube": yt,
            "video_title": video.get("title", ""),
            "date": m.get("date") or video.get("date") or data.get("exported", "")[:10],
            "approx": not m.get("date") and bool(video.get("date_approx")),
        })
    lists.sort(key=lambda l: l["date"], reverse=True)
    index = {}
    for l in lists:
        for c in l["cards"]:
            index.setdefault(norm(c["name"]), {"name": c["name"], "entries": []})["entries"].append((l, c))
    return site, lists, cards, index


# ---------- Page pieces ----------

E = html.escape


def watch_url(yt, t=None):
    return f"https://www.youtube.com/watch?v={yt}" + (f"&t={t}s" if t is not None else "")


def page(site, *, title, description, path, image="", sub="", body, scripts=""):
    base = site.get("url", "").rstrip("/")
    url = base + path
    links = site.get("links", {})
    og_image = f'<meta property="og:image" content="{E(image)}">\n  ' if image else ""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{E(title)}</title>
  <meta name="description" content="{E(description)}">
  <link rel="canonical" href="{E(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{E(site.get('name', 'Jank Diver Gaming'))}">
  <meta property="og:title" content="{E(title)}">
  <meta property="og:description" content="{E(description)}">
  <meta property="og:url" content="{E(url)}">
  {og_image}<meta name="twitter:card" content="summary">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">JDG</span>
        <span class="brand-text">
          <span class="brand-name">Jank Diver Gaming</span>
          <span class="brand-sub">{E(sub)}</span>
        </span>
      </a>
      <nav class="nav" aria-label="Main">
        <a href="/#/videos">Videos</a>
        <a href="/#/tierlists"{' class="active"' if sub == 'Tier Lists' else ''}>Tier Lists</a>
        <a href="/#/search"{' class="active"' if sub == 'Cards' else ''}>Card Search</a>
      </nav>
      {f'<a class="btn-outline discord-btn" href="{E(links["Discord"])}" target="_blank" rel="noopener">Discord</a>' if links.get("Discord") else ""}
    </div>
  </header>
  <main class="static-page">
{body}
  </main>
  <footer class="site-footer">
    <div class="footer-inner">
      <p class="mono">Jank Diver Gaming is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast LLC. Card images from <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.</p>
      <nav class="footer-links" aria-label="Social">
        {"".join(f'<a href="{E(u)}" target="_blank" rel="noopener">{E(k)}</a>' for k, u in links.items() if u)}
      </nav>
    </div>
  </footer>
{scripts}</body>
</html>
"""


def pill(c):
    return f'<span class="gpill" style="background:{grade_color(grade_index(c))}">{E(grade_label(c))}</span>'


def img(cards, name, size="normal", cls=""):
    info = cards.get(norm(name)) or {}
    src = (info.get("image") or {}).get(size) or (info.get("image") or {}).get("normal")
    if not src:
        return f'<span class="noimg">{E(name)}</span>'
    cls_attr = f' class="{cls}"' if cls else ""
    return f'<img src="{E(src)}" alt="{E(name)}" loading="lazy"{cls_attr}>'


# ---------- Pages ----------

def card_page(site, cards, slugs, entry):
    name = entry["name"]
    info = cards.get(norm(name)) or {}
    entries = entry["entries"]
    main_list, main_card = entries[0]

    # "S− in White 1-Drops" / "S− (White 1-Drops) and C (Boros)"
    graded = [f"{grade_label(c)} ({l['title']})" for l, c in entries]
    first_time = next((l["times"].get(norm(name)) for l, _ in entries if l["times"].get(norm(name)) is not None and l["youtube"]), None)
    description = (f"{name} is graded {grade_label(main_card)} in Jank Diver Gaming's {main_list['title']} Peasant Cube tier list"
                   if len(entries) == 1 else
                   f"{name} in Jank Diver Gaming's Peasant Cube tier lists: graded " + ", ".join(graded[:-1]) + f" and {graded[-1]}")
    description += (f". Watch our review at {fmt_time(first_time)}" if first_time is not None else "") + ", and see printings and prices."
    title = f"{name}: {grade_label(main_card)} in {main_list['title']} | Peasant Cube | Jank Diver Gaming"

    grades = []
    for l, c in entries:
        t = l["times"].get(norm(name))
        watch = ""
        if l["youtube"]:
            watch = (f'<a class="btn-cta watch-btn" href="{E(watch_url(l["youtube"], t))}" target="_blank" rel="noopener">▶ Watch the review at {fmt_time(t)}</a>'
                     if t is not None else
                     f'<a class="btn-tile watch-btn" href="{E(watch_url(l["youtube"]))}" target="_blank" rel="noopener">▶ Watch the review</a>')
        else:
            watch = '<span class="muted mono">Video coming soon</span>'
        grades.append(f"""      <div class="cp-grade">
        <span class="cp-pill" style="background:{grade_color(grade_index(c))}">{E(grade_label(c))}</span>
        <div class="cp-grade-text">
          <a class="cp-list" href="/tierlists/{l['slug']}/">{E(l['title'])}</a>
          <span class="mono muted">{E(fmt_date(l['date'], l['approx']))}{(" · " + E(l['video_title'])) if l['video_title'] else ""}</span>
          <div class="cp-actions">{watch}<a class="btn-tile" href="/#/tierlist/{l['slug']}?card={E(quote(name, safe=''))}">See it in the tier list</a></div>
        </div>
      </div>""")

    # Other cards in the same tier of each list: helps visitors (and search engines) move around.
    related = []
    for l, c in entries:
        same = [x for x in best_first(l["cards"]) if x["tier"] == c["tier"] and norm(x["name"]) != norm(name)][:8]
        if not same:
            continue
        tiles = "".join(f"""<a class="rel-card" href="/cards/{slugs[norm(x['name'])]}/" title="{E(x['name'])}">
            <span class="img">{img(cards, x['name'])}</span><span class="g" style="background:{grade_color(grade_index(x))}">{E(grade_label(x))}</span>
            <span class="rel-name">{E(x['name'])}</span></a>""" for x in same)
        related.append(f"""    <section class="cp-related">
      <h2>Other {E(c['tier'])}-tier cards in {E(l['title'])}</h2>
      <div class="rel-grid">{tiles}</div>
    </section>""")

    flip = '<button class="btn-outline" id="flip" type="button">Flip card</button>' if info.get("back_image") else ""
    type_line = " · ".join(x for x in [info.get("mana_cost", ""), info.get("type_line", "")] if x)
    body = f"""    <nav class="crumbs mono" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/cards/">Cards</a> › <span>{E(name)}</span></nav>
    <article class="card-page" id="card-page">
      <div class="cp-art">
        <div class="big">{img(cards, name, "large", "cp-img")}</div>
        {flip}
      </div>
      <div class="cp-info">
        <h1>{E(name)}</h1>
        {f'<div class="type mono">{E(type_line)}</div>' if type_line else ""}
        <span class="label">Our grade{"s" if len(entries) > 1 else ""}</span>
        <div class="cp-grades">
{chr(10).join(grades)}
        </div>
        <div id="buy-slot"></div>
      </div>
    </article>
{chr(10).join(related)}"""
    scripts = f"""  <script src="/buy.js"></script>
  <script>
    (function () {{
      var data = {json.dumps({"name": name, "info": info or None, "shops": site.get("shops", {})}, ensure_ascii=False).replace("</", "<\\/")};
      var slot = document.getElementById("buy-slot");
      slot.innerHTML = JDGBuy.html(data.shops, data.name, data.info);
      JDGBuy.wire(slot, {{ shops: data.shops, name: data.name, info: data.info,
        img: document.querySelector(".cp-img"), flip: document.getElementById("flip") }});
    }})();
  </script>
"""
    image = (info.get("image") or {}).get("large") or ""
    return page(site, title=title, description=description, path=f"/cards/{slugs[norm(name)]}/",
                image=image, sub="Cards", body=body, scripts=scripts)


def tierlist_page(site, cards, slugs, l):
    rows = []
    for t in TIERS:
        cs = best_first([c for c in l["cards"] if c["tier"] == t])
        if not cs and t == "F":
            continue
        tiles = "".join(f"""<a class="art-card" href="/cards/{slugs[norm(c['name'])]}/" title="{E(c['name'])}: {E(grade_label(c))}">
            <span class="img">{img(cards, c['name'])}</span><span class="g" style="background:{grade_color(grade_index(c))}">{E(grade_label(c))}</span></a>""" for c in cs)
        rows.append(f"""      <div class="grade-row">
        <div class="grade-label" style="border-color:{grade_color(TIERS.index(t) * 3 + 1)}">{t}</div>
        {f'<div class="art-chips">{tiles}</div>' if cs else '<div class="chips"><span class="empty">No cards</span></div>'}
      </div>""")
    top = best_first(l["cards"])
    counts = ", ".join(f"{sum(c['tier'] == t for c in l['cards'])} {t}" for t in TIERS if any(c["tier"] == t for c in l["cards"]))
    best = ", ".join(c["name"] for c in top[:3])
    description = (f"Jank Diver Gaming's {l['title']} Peasant Cube tier list: {len(l['cards'])} cards graded S to D ({counts}). "
                   f"Top picks: {best}.")
    video = (f'<a class="yt" href="{E(watch_url(l["youtube"]))}" target="_blank" rel="noopener">▶ Watch</a> <span>{E(l["video_title"] or l["title"])}</span>'
             if l["youtube"] else '<span class="muted">Video coming soon.</span>')
    body = f"""    <nav class="crumbs mono" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/tierlists/">Tier lists</a> › <span>{E(l['title'])}</span></nav>
    <div class="page-head"><div><h1>{E(l['title'])}</h1>
      <p>{len(l['cards'])} cards · {E(fmt_date(l['date'], l['approx']))} · Peasant Cube tier list</p></div>
      <a class="btn-outline" href="/#/tierlist/{l['slug']}">Interactive view</a>
    </div>
    <div class="watch-bar">{video}</div>
    <div class="board">
{chr(10).join(rows)}
    </div>"""
    image = ((cards.get(norm(top[0]["name"])) or {}).get("image") or {}).get("large", "") if top else ""
    return page(site, title=f"{l['title']} Peasant Cube Tier List | Jank Diver Gaming", description=description,
                path=f"/tierlists/{l['slug']}/", image=image, sub="Tier Lists", body=body)


def cards_index(site, slugs, index):
    groups = {}
    for key, e in sorted(index.items(), key=lambda kv: slugify(kv[1]["name"])):
        first = slugify(e["name"])[:1].upper()
        groups.setdefault(first if first.isalpha() else "#", []).append(e)
    nav = " ".join(f'<a href="#letter-{k}">{k}</a>' for k in groups)
    parts = []
    for k, es in groups.items():
        items = "".join(f'<li><a href="/cards/{slugs[norm(e["name"])]}/">{E(e["name"])}</a> {" ".join(pill(c) for _, c in e["entries"])}</li>' for e in es)
        parts.append(f'    <section class="az" id="letter-{k}"><h2>{k}</h2><ul class="az-list">{items}</ul></section>')
    body = f"""    <div class="page-head"><div><h1>All cards</h1><p>{len(index)} cards graded for Peasant Cube by Jank Diver Gaming.</p></div>
      <a class="btn-outline" href="/#/search">Card search</a></div>
    <nav class="az-nav mono">{nav}</nav>
{chr(10).join(parts)}"""
    return page(site, title="All graded cards | Peasant Cube | Jank Diver Gaming",
                description=f"Every card Jank Diver Gaming has graded for Peasant Cube: {len(index)} cards with grades, review timestamps and prices.",
                path="/cards/", sub="Cards", body=body)


def lists_index(site, cards, lists):
    tiles = []
    for l in lists:
        top = best_first(l["cards"])[:5]
        fan = "".join(img(cards, c["name"]) for c in top)
        tiles.append(f"""      <a class="list-card" href="/tierlists/{l['slug']}/">
        <div class="fan">{fan}</div>
        <div class="body"><h2>{E(l['title'])}</h2><span class="info">{len(l['cards'])} cards · {E(fmt_date(l['date'], l['approx']))}</span></div>
      </a>""")
    body = f"""    <div class="page-head"><div><h1>Tier lists</h1><p>{len(lists)} Peasant Cube tier lists by Jank Diver Gaming.</p></div></div>
    <div class="list-grid">
{chr(10).join(tiles)}
    </div>"""
    return page(site, title="Peasant Cube Tier Lists | Jank Diver Gaming",
                description=f"All {len(lists)} of Jank Diver Gaming's Peasant Cube tier lists, with every card graded S to D and linked to the video review.",
                path="/tierlists/", sub="Tier Lists", body=body)


def not_found(site):
    body = """    <div class="page-head"><div><h1>Page not found</h1>
      <p>That page does not exist. Try the <a href="/#/search">card search</a>, the <a href="/cards/">list of all cards</a> or the <a href="/">home page</a>.</p></div></div>"""
    return page(site, title="Page not found | Jank Diver Gaming", description="Page not found.", path="/404.html", sub="", body=body)


# ---------- Build ----------

def build(out):
    site, lists, cards, index = load()
    base = site.get("url", "").rstrip("/")
    if not base:
        sys.exit('Set "url" in data/site.json (for example "https://jankdivergaming.com").')

    slugs, owner = {}, {}
    for key, e in index.items():
        s = slugify(e["name"])
        if not s or s in owner:
            sys.exit(f"Two cards get the same page address '{s}': {owner.get(s)!r} and {e['name']!r}")
        slugs[key], owner[s] = s, e["name"]
    for l in lists:
        if not re.fullmatch(r"[a-z0-9-]+", l["slug"]):
            sys.exit(f"Tier list file name must be lower-case letters, digits and dashes: {l['slug']}")

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for f in STATIC:
        if (ROOT / f).exists():
            shutil.copy2(ROOT / f, out / f)
    shutil.copytree(DATA, out / "data")
    (out / "data" / "card-pages.json").write_text(json.dumps(slugs, ensure_ascii=False, sort_keys=True) + "\n")

    def write(rel, text):
        p = out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")

    for key, e in index.items():
        write(f"cards/{slugs[key]}/index.html", card_page(site, cards, slugs, e))
    write("cards/index.html", cards_index(site, slugs, index))
    for l in lists:
        write(f"tierlists/{l['slug']}/index.html", tierlist_page(site, cards, slugs, l))
    write("tierlists/index.html", lists_index(site, cards, lists))
    write("404.html", not_found(site))

    urls = ["/", "/cards/", "/tierlists/"] + [f"/tierlists/{l['slug']}/" for l in lists] + [f"/cards/{s}/" for s in sorted(owner)]
    write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          + "".join(f"  <url><loc>{E(base + u)}</loc></url>\n" for u in urls) + "</urlset>\n")
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {base}/sitemap.xml\n")
    write(".nojekyll", "")
    print(f"Built {out}: {len(index)} card pages, {len(lists)} tier list pages, {len(urls)} URLs in the sitemap.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "_site"))
    build(Path(ap.parse_args().out))
