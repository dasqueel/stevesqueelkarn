#!/usr/bin/env node
// Builds public/data/records.json from the CollegeFootballData games mirrored
// into MongoDB (db cfbData26, collection games).
//
//   node scripts/fetch-records.mjs
//   node scripts/fetch-records.mjs --season 2026
//
// Connection string comes from battlesqueelMongoUrl (or MONGO_URL). It is used
// only here — at CI time — so it never reaches the browser. The published site
// reads the resulting static JSON and connects to nothing.
//
// IMPORTANT: CFBD files conference championship games under seasonType
// "regular", so Ohio State's 2025 regular season comes back 12-1 across 13
// games when it was really 12-0. This contest counts REGULAR SEASON ONLY, so
// title games are stripped below by their `notes` headline. Bowls and the
// playoff are seasonType "postseason" and are never read.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/records.json');

const URL_ = process.env.battlesqueelMongoUrl || process.env.MONGO_URL;
const DB = process.env.CFB_DB || 'cfbData26';
const COLLECTION = process.env.CFB_COLLECTION || 'games';

if (!URL_) {
  console.error('No Mongo connection string.');
  console.error('  local: battlesqueelMongoUrl should be exported in your shell');
  console.error('  CI:    set it as the MONGO_URL repo secret');
  process.exit(1);
}

/** A season is named for the calendar year it kicks off in, so Jan/Feb still
 *  belong to the previous year's season. */
function defaultSeason() {
  const now = new Date();
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}

const SEASON = Number(
  process.argv.includes('--season')
    ? process.argv[process.argv.indexOf('--season') + 1]
    : process.env.SEASON || defaultSeason()
);

const { picks } = JSON.parse(readFileSync(resolve(ROOT, 'src/data/picks.json'), 'utf8'));

/** Conference title games carry a "… Championship" note; ordinary games either
 *  have none or a scheduling placeholder. This is the whole reason the raw
 *  regular-season record can't be trusted as-is. */
const isConferenceChampionship = (game) => /championship/i.test(game.notes ?? '');

const client = new MongoClient(URL_, { serverSelectionTimeoutMS: 20000 });
let games;
try {
  console.log(`Reading ${DB}.${COLLECTION} for the ${SEASON} regular season…`);
  await client.connect();
  games = await client
    .db(DB)
    .collection(COLLECTION)
    .find(
      { season: SEASON, seasonType: 'regular' },
      {
        projection: {
          _id: 0,
          week: 1, startDate: 1, completed: 1, notes: 1,
          homeId: 1, homeTeam: 1, homePoints: 1,
          awayId: 1, awayTeam: 1, awayPoints: 1,
        },
      }
    )
    .toArray();
} catch (err) {
  console.error(`\nCould not read from MongoDB: ${err.message}`);
  console.error('If this is running in CI, check the cluster allows connections from');
  console.error('GitHub-hosted runners (their IPs are not fixed).');
  process.exit(1);
} finally {
  await client.close();
}

console.log(`  ${games.length} games returned`);
if (games.length === 0) {
  console.error(`\nNo ${SEASON} regular-season games in ${DB}.${COLLECTION}. Nothing written.`);
  process.exit(1);
}

// CFBD ids share ESPN's id space, so the ids already in picks.json work as-is.
const teams = {};
for (const p of picks) {
  teams[p.espnId] = {
    espnId: p.espnId,
    wins: 0, losses: 0, played: 0, scheduled: 0, remaining: 0,
    excludedCCG: 0,
    scheduleIncomplete: false,
    games: [],
  };
}

let ccgStripped = 0;
for (const g of games) {
  for (const side of ['home', 'away']) {
    const rec = teams[String(side === 'home' ? g.homeId : g.awayId)];
    if (!rec) continue; // not a drafted team

    if (isConferenceChampionship(g)) {
      rec.excludedCCG++;
      ccgStripped++;
      continue;
    }

    const mine = side === 'home' ? g.homePoints : g.awayPoints;
    const theirs = side === 'home' ? g.awayPoints : g.homePoints;
    const completed = g.completed === true && mine != null && theirs != null;

    rec.games.push({
      week: g.week ?? null,
      date: g.startDate ? new Date(g.startDate).toISOString() : null,
      completed,
      result: completed ? (mine > theirs ? 'W' : 'L') : null,
      score: completed ? `${mine}-${theirs}` : null,
      homeAway: side,
      oppName: (side === 'home' ? g.awayTeam : g.homeTeam) ?? 'TBD',
      oppAbbr: null,
      oppLogo: null,
    });
  }
}

const missing = [];
for (const rec of Object.values(teams)) {
  rec.games.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const played = rec.games.filter((g) => g.completed);
  rec.wins = played.filter((g) => g.result === 'W').length;
  rec.losses = played.length - rec.wins;
  rec.played = played.length;
  rec.scheduled = rec.games.length;
  rec.remaining = rec.games.length - played.length;
  // A team can be listed before its final non-conference opponent is announced.
  // Understated `remaining` could clinch an UNDER too early, so the UI holds
  // such picks pending until the schedule fills in.
  rec.scheduleIncomplete = rec.games.length < 12;
  if (rec.games.length === 0) missing.push(rec.espnId);
}

if (missing.length) {
  console.error(`\n${missing.length} drafted team(s) had no games in the collection:`);
  for (const id of missing) {
    const p = picks.find((x) => x.espnId === id);
    console.error('  ✗ ' + (p ? p.display : id));
  }
  console.error('\nAborting without writing. Standings would be wrong.');
  process.exit(1);
}

// `updatedAt` means "when the results last changed", not "when we last checked".
// Stamping every run would rewrite the file daily and push ~150 empty commits
// and redeploys across the season, so an unchanged read is left alone.
let previous = null;
try {
  previous = JSON.parse(readFileSync(OUT, 'utf8'));
} catch {
  /* first run */
}

const unchanged =
  previous?.season === SEASON && JSON.stringify(previous.teams) === JSON.stringify(teams);

if (unchanged) {
  console.log(`\n✓ ${Object.keys(teams).length} teams — no change since ${previous.updatedAt}`);
  console.log('· records.json left untouched');
  process.exit(0);
}

mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ season: SEASON, updatedAt: new Date().toISOString(), teams }, null, 2) + '\n'
);

const totalPlayed = Object.values(teams).reduce((n, t) => n + t.played, 0);
const anomalies = Object.values(teams).filter((t) => t.scheduleIncomplete);
console.log(`\n✓ ${Object.keys(teams).length} teams`);
console.log(`✓ ${totalPlayed} completed games counted`);
console.log(`✓ ${ccgStripped} conference championship game(s) excluded`);
if (anomalies.length) {
  console.log(
    `! ${anomalies.length} team(s) with an incomplete schedule (<12 games): ` +
      anomalies.map((t) => `${t.espnId}=${t.scheduled}`).join(', ')
  );
}
console.log('✓ wrote public/data/records.json');
