# YouTube chapters for the tier list videos

Each `.txt` file in this folder is a list of chapters for one video: one line per card, with the time the card comes up. Paste it into the video description, and YouTube turns it into chapters. Viewers can then jump to any card.

| Video | File |
| --- | --- |
| [Live Long And Review Star Trek (Jank Tank Ep. 74)](https://youtu.be/AaD1K6_QWJg) | `star-trek-set-review.txt` |
| [Big Green Beefers (Green Top-End)](https://youtu.be/QZau4pdFJcE) | `green-5-drops.txt` |
| [Fantastic Red Finishers (Red Top-End)](https://youtu.be/XUCjwyhTINg) | `red-5-drops.txt` |
| [Big Black Battlecruisers (Black Top-End)](https://youtu.be/noRm5lM7FCs) | `black-5-drops.txt` |
| [The Endgame of Marvel Super Heroes Reviews (Jank Tank Ep. 68)](https://youtu.be/nniACJvJSs0) | `marvel-super-heroes-set-review.txt` |

## How to add the chapters (about 1 minute per video)

1. Open the file for the video and copy all of its text.
2. Go to [YouTube Studio](https://studio.youtube.com), click **Content**, and open the video.
3. In **Description**, click at the very end of the existing text. Press Enter twice to leave an empty line.
4. Paste the text.
5. Click **Save** (top right).

Open the video on YouTube to check: the progress bar now has chapter breaks, and each card name appears when you move the mouse over the bar.

## Good to know

- **Do not change the first line** (`0:00 Intro`). YouTube only makes chapters if the first time is 0:00.
- **Paste the whole list at once, at the end of the description.** Keep the times in order, one per line, with nothing else on those lines.
- **These chapters replace YouTube's automatic chapters,** if the video has any.
- Each time starts about 3 seconds before the card is named, so viewers land just before the card is introduced.
- If YouTube shows no chapters after you save, check that there is an empty line before `0:00 Intro`. Then wait a few minutes and reload the page: YouTube can take a short time to update.

These files are made by `tools/make_chapters.py` from the same timestamps the website uses. Run it again after new timestamps are added.
