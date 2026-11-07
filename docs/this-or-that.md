# "This or That" ranking game (archived)

This branch keeps the first version of the ranking game. It is not on the live site.

## What it does
- Shows two random cards from all tier-listed cards. The visitor picks one (click, or press 1 / 2; S skips).
- Each pick updates an Elo rating (start 1500, K = 32).
- "Your rankings" sorts cards by Elo and splits them into tiers by position:
  top 10% S, next 20% A, next 30% B, next 25% C, last 15% D. It shows the Jank Diver grade next to each.

## Why it is off the site
Votes are stored only in the visitor's browser (`localStorage`). Community tiers need a backend.

## To bring it back
- Code: `viewRank()` and the `rankKeys` handler in `app.js`, the `#/rank` route, the nav link in `index.html`,
  and the `/* Rank game */` styles in `styles.css`, all on this branch.
- Add a vote store, for example Supabase (a `votes` table: winner, loser, created_at), Firebase, or a
  Cloudflare Worker with D1. Compute community Elo from all votes on the server or in a scheduled job.
- Add basic abuse limits (rate limit per visitor, ignore very fast repeat votes).
