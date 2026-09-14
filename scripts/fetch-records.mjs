#!/usr/bin/env node
// Builds public/data/records.json from ESPN's public college-football API.
//
//   node scripts/fetch-records.mjs
//   node scripts/fetch-records.mjs --season 2026
//
// No credentials. No database. ESPN's team-schedule endpoint is public, so this
// runs identically on a laptop and on a GitHub runner, and the published site
// keeps reading the resulting static JSON exactly as before.
//
// IMPORTANT: ESPN files conference championship games under seasonType 2
// alongside the regular season, so Ohio State's 2025 season comes back 12-1
// across 13 games when the real regular season was 12-0. This contest counts
// REGULAR SEASON ONLY, so title games are stripped below by their `notes`
// headline. Bowls and the playoff are seasonType 3 and are never requested.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/records.json');

const SCHEDULE = (id, season) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${id}/schedule?season=${season}&seasontype=2`;

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

/** Conference title games carry a "… Championship" note; ordinary games have
 *  none. This is the whole reason ESPN's seasonType-2 list can't be trusted
 *  as-is. */
const isConferenceChampionship = (comp) =>
  (comp.notes ?? []).some((n) => /championship/i.test(n.headline ?? ''));

/** One team's regular season, reduced to the fields the site scores against. */
function readTeam(espnId, payload) {
  const rec = {
    espnId,
    wins: 0, losses: 0, played: 0, scheduled: 0, remaining: 0,
    excludedCCG: 0,
    scheduleIncomplete: false,
    games: [],
  };

  for (const event of payload.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    if (event.seasonType?.type !== undefined && event.seasonType.type !== 2) continue;

    if (isConferenceChampionship(comp)) {
      rec.excludedCCG++;
      continue;
    }

    const mine = comp.competitors?.find((c) => c.team?.id === espnId);
    const theirs = comp.competitors?.find((c) => c.team?.id !== espnId);
    if (!mine) continue;

    const myScore = mine.score?.value ?? null;
    const oppScore = theirs?.score?.value ?? null;
    const completed = comp.status?.type?.completed === true && myScore !== null && oppScore !== null;

    rec.games.push({
      week: event.week?.number ?? null,
      date: event.date ? new Date(event.date).toISOString() : null,
      completed,
      // `winner` is ESPN's own call; fall back to the scoreline if it's absent.
      // (`false` is a real answer here, so `??` — not `||` — is what's wanted.)
      result: completed ? ((mine.winner ?? myScore > oppScore) ? 'W' : 'L') : null,
      score: completed ? `${myScore}-${oppScore}` : null,
      homeAway: mine.homeAway ?? null,
      oppName: theirs?.team?.displayName ?? 'TBD',
      oppAbbr: theirs?.team?.abbreviation ?? null,
      oppLogo: theirs?.team?.logos?.[0]?.href ?? null,
    });
  }

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
  return rec;
}

/** Small pool so 130-odd requests don't arrive as one burst. */
async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

const ids = [...new Set(picks.map((p) => p.espnId))];
console.log(`Reading ${ids.length} team schedules from ESPN for the ${SEASON} regular season…`);

const failures = [];
const results = await mapPool(ids, 8, async (id) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SCHEDULE(id, SEASON));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return readTeam(id, await res.json());
    } catch (err) {
      if (attempt === 3) {
        failures.push(`${id}: ${err.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
});

if (failures.length) {
  console.error(`\n${failures.length} team schedule(s) could not be read:`);
  for (const f of failures) console.error('  ✗ ' + f);
  console.error('\nAborting without writing. Standings would be wrong.');
  process.exit(1);
}

const teams = {};
for (const rec of results) teams[rec.espnId] = rec;

// A drafted team with an empty schedule means ESPN has nothing for that season
// yet — writing it would score every one of its picks off a 0-0 record.
const missing = results.filter((r) => r.games.length === 0);
if (missing.length) {
  console.error(`\n${missing.length} drafted team(s) had no ${SEASON} games:`);
  for (const rec of missing) {
    const p = picks.find((x) => x.espnId === rec.espnId);
    console.error('  ✗ ' + (p ? p.display : rec.espnId));
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
  console.log(`\n✓ ${ids.length} teams — no change since ${previous.updatedAt}`);
  console.log('· records.json left untouched');
  process.exit(0);
}

mkdirSync(resolve(ROOT, 'public/data'), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ season: SEASON, updatedAt: new Date().toISOString(), teams }, null, 2) + '\n'
);

const totalPlayed = results.reduce((n, t) => n + t.played, 0);
const ccgStripped = results.reduce((n, t) => n + t.excludedCCG, 0);
const anomalies = results.filter((t) => t.scheduleIncomplete);
console.log(`\n✓ ${ids.length} teams`);
console.log(`✓ ${totalPlayed} completed games counted`);
console.log(`✓ ${ccgStripped} conference championship game(s) excluded`);
if (anomalies.length) {
  console.log(
    `! ${anomalies.length} team(s) with an incomplete schedule (<12 games): ` +
      anomalies.map((t) => `${t.espnId}=${t.scheduled}`).join(', ')
  );
}
console.log('✓ wrote public/data/records.json');
