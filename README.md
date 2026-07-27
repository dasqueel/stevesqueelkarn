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

## Where results come from

Games come from the CollegeFootballData feed mirrored into MongoDB —
database `cfbData26`, collection `games`. `scripts/fetch-records.mjs` reads it,
counts each drafted team's regular-season wins, and writes
`public/data/records.json`. A GitHub Action runs it daily from August through
December; pushing the updated file is what triggers a Cloudflare Pages
redeploy, so nobody has to touch anything.

**The published site connects to nothing.** It loads `records.json` as a static
file, so there is no database access, no credentials, and no API from the
browser. The connection string is used only in CI. The site also keeps working
if the database is down — it just shows the last known results.

The site is a static build and reads `records.json` at runtime, so a data
refresh never requires rebuilding the JavaScript.

### One wrinkle worth knowing

CFBD files conference championship games under `seasonType: "regular"`, so a
12-game team appears to have 13 regular-season games. `fetch-records.mjs`
strips any game whose `notes` mention a championship. Without that, Ohio
State's 2025 Big Ten title-game loss would have counted against its win total —
their real regular season was 12-0, but the raw feed reports 12-1.

This was verified by rebuilding the full 2025 season both ways: all 132 teams
produced identical records, and the same 18 title games were excluded.

## Commands

```bash
npm install
npm run dev            # local dev server
npm run build          # typecheck + production build to dist/
npm test               # scoring engine tests

npm run data:records   # rebuild records.json from MongoDB
npm run data:teams     # re-resolve the draft to team ids
```

`data:records` needs the connection string in `battlesqueelMongoUrl` (or
`MONGO_URL`). Nothing else in the project needs credentials.

### Seeing it mid-season

Before kickoff the site is just a countdown. To see it populated:

```bash
npm run data:demo                       # simulate through week 8
node scripts/demo-records.mjs --week 13  # later in the year
npm run data:records                    # back to real data
```

Results are invented — deterministic, and weighted by each team's drafted line
so good teams win more and the board looks believable. They're written onto the
real schedule. The file is marked and the site shows a banner while it's
loaded, so it can't be mistaken for live standings. Don't commit it.

## Changing the draft

`scripts/draft.mjs` is the source of truth. Edit it, then run
`npm run data:teams` to regenerate `src/data/picks.json`.

The resolver refuses to guess: if a team name is ambiguous (there are two
Charlottes, two Troys, three Delawares in ESPN's directory) it fails with the
candidate IDs and writes nothing. Pin the right one in `ID_OVERRIDES`.

## Layout

```
scripts/draft.mjs           the draft board — source of truth
scripts/resolve-teams.mjs   draft names -> team ids (one-time, uses ESPN)
scripts/fetch-records.mjs   MongoDB -> public/data/records.json
scripts/demo-records.mjs    simulated results for previewing the site
scripts/scoring.test.ts     tests for the clinch math
src/lib/scoring.ts          contest rules: who has won, lost, or is still alive
src/components/             masthead, leaderboard, race chart, pick board
```
