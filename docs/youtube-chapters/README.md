# YouTube chapters for the tier list videos

Each `.txt` file in this folder is a list of chapters for one video: one line per card, with the time the card comes up. Paste it into the video description, and YouTube turns it into chapters. Viewers can then jump to any card.

| Video | File |
| --- | --- |
| [Live Long And Review Star Trek (Jank Tank Ep. 74)](https://youtu.be/AaD1K6_QWJg) | `star-trek-set-review.txt` |
| [Big Green Beefers (Green Top-End)](https://youtu.be/QZau4pdFJcE) | `green-5-drops.txt` |
| [Fantastic Red Finishers (Red Top-End)](https://youtu.be/XUCjwyhTINg) | `red-5-drops.txt` |
| [Big Black Battlecruisers (Black Top-End)](https://youtu.be/noRm5lM7FCs) | `black-5-drops.txt` |
| [The Endgame of Marvel Super Heroes Reviews (Jank Tank Ep. 68)](https://youtu.be/nniACJvJSs0) | `marvel-super-heroes-set-review.txt` |
| [O-Rings & Aura-Farming (White Artifacts/Enchantments)](https://youtu.be/AujFwgO0oRw) | `white-noncreature-permanents.txt` |
| [Reality Fracture Review (Jank Tank Ep. 72)](https://youtu.be/DwuLZHtjvYQ) | `reality-fracture-set-review.txt` |
| [White's Best Curve-Toppers (White Top-End)](https://youtu.be/05gsm7N5V4c) | `white-5-drops.txt` |
| [Big Blue Bangers (Blue Top-End)](https://youtu.be/2Ooo8g14u_A) | `blue-5-drops.txt` |
| [Mox Emerald Wannabes (Green 1-Drops)](https://youtu.be/B8Az6PzDg9I) | `green-1-drops.txt` |
| [It's Not All Black & White With Orzhov](https://youtu.be/RZ-vRLa6Pwc) | `orzhov-guild-cards.txt` |
| [Red Hot Ones (Red 1-Drops)](https://youtu.be/yMQnSn4wtyI) | `red-1-drops.txt` |
| [An Unexpected Journey with The Hobbit (Jank Tank Ep. 70)](https://youtu.be/YDKc9o2VjNQ) | `the-hobbit-set-review.txt` |
| [White Creatures Don't Look At Explosions (White 1-Drops)](https://youtu.be/doHYjdl64RY) | `white-1-drops.txt` |
| [A New S-Tier 1-Drop Has Appeared! (Black 1-Drops)](https://youtu.be/jtuIA7t7hi8) | `black-1-drops.txt` |
| [No Thinking, Just Attacking (Boros)](https://youtu.be/17cpXLwPexw) | `boros-guild-cards.txt` |
| [The One With All The Flying Men (Blue 1-Drops)](https://youtu.be/Tgix8E4bQP8) | `blue-1-drops.txt` |
| [Spellslinger's Best Friends (Izzet)](https://youtu.be/VFr1DmGyugE) | `izzet-guild-cards.txt` |

**Some videos already have chapters on YouTube** (for example Reality Fracture, The Hobbit and Orzhov). They seem to be YouTube's automatic chapters: the card names are spelled loosely, and in long videos the times drift several minutes away from where each card is actually introduced. The files here replace them with exact times.

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
