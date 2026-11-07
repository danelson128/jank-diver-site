# Jank Diver Gaming website

A static website for Jank Diver Gaming: videos, Peasant Cube tier lists, card search and a "This or That" ranking game.
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
| `data/site.json` | Channel name, tagline, social links and extra videos (videos that are not tier lists). |
| `data/tierlists.json` | The list of tier lists, each with an optional YouTube link. |
| `data/tierlists/*.json` | Tier list exports from the tier list tool, unchanged. |
| `data/cards.json` | Card images and details from Scryfall. The lookup script makes this file. Do not edit it by hand. |
| `data/card-overrides.json` | Printings you choose yourself, if the script picks the wrong one. |
| `tools/fetch_cards.py` | The Scryfall lookup script. |

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

## Add a video link

Put the YouTube link in the `youtube` field of the tier list in `data/tierlists.json`. The tier list page then shows the video, and card search shows a "Watch review" link.

For a video that is not a tier list (a podcast episode, for example), add it to `videos` in `data/site.json`:

```json
{ "title": "Episode 12: Cube design", "date": "2026-11-10", "youtube": "https://youtu.be/XXXXXXXXXXX", "kind": "Podcast" }
```

Put your channel links in `links` in `data/site.json`. The home page shows a button for each link that is not empty.

## Card images

`tools/fetch_cards.py` looks up each card on Scryfall one time. It picks the **first paper printing** of each card. It skips digital-only, promo and oversized printings when it can. Visitors' browsers load the images from Scryfall's image CDN and make no API calls.

If the script picks the wrong printing, add the card to `data/card-overrides.json` and run the script again:

```json
{ "Mother of Runes": { "set": "ulg", "collector_number": "14" } }
```

## The "This or That" game

The game is a beta. Votes use an Elo rating and stay in each visitor's browser (`localStorage`). For community tiers from all players, the site needs a small backend to store votes, for example Supabase, Firebase or a Cloudflare Worker.

## Put the site online (GitHub Pages)

1. Push this folder to a GitHub repository.
2. In the repository, open **Settings → Pages**. Set the source to the `main` branch, root folder.
3. The site is live at `https://<your-account>.github.io/<repo>/` in a few minutes.
