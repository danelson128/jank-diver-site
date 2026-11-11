# Jank Diver Gaming website

A static website for Jank Diver Gaming: videos, Peasant Cube tier lists and card search.
It has no build step and no server code. Any static host can serve it (GitHub Pages, Netlify, Cloudflare Pages).

## Run it on your computer

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. You must use a web server. If you open `index.html` directly as a file, it can't load the data.

## Folder layout

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The site. |
| `data/site.json` | Channel name, tagline and social links. |
| `data/videos.json` | All channel videos. `tools/fetch_videos.py` adds new ones from the RSS feed. |
| `data/tierlists.json` | The list of tier lists, each with an optional YouTube link. |
| `data/tierlists/*.json` | Tier list exports from the tier list tool, unchanged. |
| `data/cards.json` | Card images and details from Scryfall. The lookup script makes this file. Do not edit it by hand. |
| `data/card-overrides.json` | Printings you choose yourself, if the script picks the wrong one. |
| `tools/fetch_cards.py` | The Scryfall lookup script. |
| `tools/fetch_videos.py` | The YouTube RSS script. |

## Add a new tier list

1. Put the export in `data/tierlists/`, for example `data/tierlists/blue-2-drops.json`.
2. Add it to `data/tierlists.json`:
   ```json
   { "file": "blue-2-drops.json", "youtube": "https://www.youtube.com/watch?v=XXXXXXXXXXX" }
   ```
   You can leave `youtube` empty and add the link later. The site shows "Video link coming soon" until you do.
3. Look up the new cards:
   ```bash
   python3 tools/fetch_cards.py
   ```
   The script looks up only the cards it does not have yet. Use `--refresh` to look up all of them again.

The site uses the export's `exported` date as the episode date. To use a different date, add `"date": "2026-11-09"` to the entry in `data/tierlists.json`. You can also add `"description": "..."`.

## Add a video

After you upload, run:

```bash
python3 tools/fetch_videos.py
```

This adds the new video to `data/videos.json` from the channel RSS feed. If the video is a tier list, also put its link in the `youtube` field of that tier list in `data/tierlists.json`. The tier list page then links to the video, and card search shows a "Watch review" link.

The RSS feed has only the newest 15 videos. To add an older video, add it to `data/videos.json` by hand:

```json
{ "id": "XXXXXXXXXXX", "title": "Video title", "date": "2026-06-01", "kind": "Tier List" }
```

`kind` is one of `Tier List`, `The Jank Tank`, `Cube Draft`, `Cube Update` or any new name you want as a filter. Add `"date_approx": true` if you do not know the exact date; the site then shows only the month.

Channel links are in `links` in `data/site.json`. The site shows a button for each link.

## Card timestamps

Each card can link to the moment in the video where you talk about it. Times are in `data/timestamps/<slug>.json`, in seconds:

```json
{ "Command Subadjunct": 95, "The Duras Sisters": 3725 }
```

The list's entry in `data/tierlists.json` also needs `"timestamps": true`.

To make the file from a transcript (an .srt from YouTube Studio, or text copied from "Show transcript"):

```bash
python3 tools/timestamps_from_transcript.py star-trek-set-review transcript.srt
```

Automatic captions often spell card names wrong, so check the result and add the cards it lists as "not found" by hand.

## Card images

`tools/fetch_cards.py` looks up each card on Scryfall one time. It picks the **first paper printing** of each card. It skips digital-only, promo and oversized printings when it can. Visitors' browsers load the images from Scryfall's image CDN and make no API calls.

If the script picks the wrong printing, add the card to `data/card-overrides.json` and run the script again:

```json
{ "Mother of Runes": { "set": "ulg", "collector_number": "14" } }
```

## Printings and shop links

The card popup lists every paper printing of the card, with Scryfall prices. The visitor's browser gets this list from Scryfall when they open a card. Each printing links to its TCGplayer and Cardmarket product page.

To earn affiliate commission, put your affiliate link template in `shops` in `data/site.json`. Use `{url}` where the product URL goes. The site fills it in, URL-encoded:

```json
"shops": {
  "tcgplayer": { "affiliate": "https://partner.tcgplayer.com/c/YOUR_ID/YOUR_AD_ID/21018?u={url}" },
  "cardmarket": { "affiliate": "" }
}
```

Use the exact link format your affiliate program gives you. With an empty `affiliate`, the links go straight to the shop with no affiliate code.

Do not use the "purchase" links from the Scryfall API: they contain Scryfall's own affiliate code.

## Look and feel

All colors and fonts are CSS variables at the top of `styles.css`. To change the accent color, edit `--accent` (and `--accent-soft`, the same color at low opacity).

## The "This or That" game (not on the site)

The first version of the ranking game is saved on the `archive/this-or-that` branch, with notes in `docs/this-or-that.md`. It needs a backend to store votes before it can come back.

## Put the site online (GitHub Pages)

1. Push this folder to a GitHub repository.
2. In the repository, open **Settings → Pages**. Set the source to the `main` branch, root folder.
3. The site is live at `https://<your-account>.github.io/<repo>/` in a few minutes.
