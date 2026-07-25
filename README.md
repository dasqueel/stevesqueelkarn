# STEVE · SQUEEL · KARN

Season win-total pickem. Three players, 132 college football teams, one long season.

**Live:** https://stevesqueelkarn.com

## Rules

- Each player drafted **44 teams**, taking the over or the under on that team's
  season win total. 132 teams total, no team drafted twice.
- **1 point** per pick that cashes. Max 44.
- **Regular season wins only.** Conference championship games, bowls and the
  playoff do not count. Every line is a half-number, so nothing pushes.
- Ties break on ceiling (the player with fewer busted picks is ahead).

## How it stays current

`public/data/records.json` is regenerated from ESPN's public API by a GitHub
Action that runs daily from August through December. Pushing the updated file is
what triggers a Cloudflare Pages redeploy — nobody has to touch anything.

The site is a static build; it reads `records.json` at runtime, so a data refresh
never requires rebuilding the JavaScript.

### One wrinkle worth knowing

ESPN files conference championship games under `seasontype=2` ("Regular
Season"), so a 12-game team appears to have 13 regular-season games.
`scripts/fetch-records.mjs` strips those out. Without that, Ohio State's 2025
Big Ten title-game loss would have counted against its win total.

## Commands

```bash
npm install
npm run dev            # local dev server
npm run build          # typecheck + production build to dist/
npm test               # scoring engine tests

npm run data:records   # refresh records.json from ESPN (current season)
node scripts/fetch-records.mjs --season 2025   # a specific season

npm run data:teams     # re-resolve the draft to ESPN team ids
```

### Seeing it mid-season

Before kickoff the site is just a countdown. To see it with real results:

```bash
npm run data:demo                              # 2025 through week 8
node scripts/demo-records.mjs --week 13        # later in the year
npm run data:records                           # back to live data
```

Demo data is marked in `records.json` and the site shows a banner while it's
loaded, so it can't be mistaken for the live standings. Don't commit it.

## Changing the draft

`scripts/draft.mjs` is the source of truth. Edit it, then run
`npm run data:teams` to regenerate `src/data/picks.json`.

The resolver refuses to guess: if a team name is ambiguous (there are two
Charlottes, two Troys, three Delawares in ESPN's directory) it fails with the
candidate IDs and writes nothing. Pin the right one in `ID_OVERRIDES`.

## Layout

```
scripts/draft.mjs           the draft board — source of truth
scripts/resolve-teams.mjs   draft names -> ESPN team ids
scripts/fetch-records.mjs   ESPN -> public/data/records.json
scripts/scoring.test.ts     tests for the clinch math
src/lib/scoring.ts          contest rules: who has won, lost, or is still alive
src/components/             masthead, leaderboard, race chart, pick board
```
