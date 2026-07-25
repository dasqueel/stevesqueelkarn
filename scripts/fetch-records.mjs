#!/usr/bin/env node
// Pulls regular-season W/L for all 132 drafted teams from ESPN and writes
// public/data/records.json.
//
//   node scripts/fetch-records.mjs              # current season
//   node scripts/fetch-records.mjs --season 2025
//
// IMPORTANT: ESPN files conference championship games under seasontype=2
// ("Regular Season"), so a 12-game team shows 13 events. This contest counts
// REGULAR SEASON ONLY, so CCGs are stripped out below. Bowls and playoff games
// live under seasontype=3 and are never requested.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
const CONCURRENCY = 8;
const MAX_RETRIES = 3;

const { picks } = JSON.parse(readFileSync(resolve(ROOT, 'src/data/picks.json'), 'utf8'));

/** Conference title games carry a "… Championship" note. Everything else is a real regular-season game. */
const isConferenceChampionship = (competition) =>
  (competition.notes ?? []).some((n) => /championship/i.test(n.headline ?? ''));

async function getJSON(url, attempt = 1) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return getJSON(url, attempt + 1);
  }
}

async function fetchTeam(pick) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/` +
    `${pick.espnId}/schedule?season=${SEASON}&seasontype=2`;
  const data = await getJSON(url);

  const games = [];
  let excludedCCG = 0;

  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    if (isConferenceChampionship(comp)) {
      excludedCCG++;
      continue;
    }

    const me = comp.competitors.find((c) => c.id === pick.espnId);
    const opp = comp.competitors.find((c) => c.id !== pick.espnId);
    if (!me) continue;

    const completed = comp.status?.type?.completed === true;
    const myScore = Number(me.score?.value ?? me.score?.displayValue ?? NaN);
    const oppScore = Number(opp?.score?.value ?? opp?.score?.displayValue ?? NaN);

    games.push({
      week: event.week?.number ?? null,
      date: event.date ?? null,
      completed,
      // ESPN sets `winner` only once final; fall back to score comparison.
      result: !completed
        ? null
        : me.winner === true || (Number.isFinite(myScore) && myScore > oppScore)
          ? 'W'
          : 'L',
      score:
        completed && Number.isFinite(myScore) && Number.isFinite(oppScore)
          ? `${myScore}-${oppScore}`
          : null,
      homeAway: me.homeAway ?? null,
      oppName: opp?.team?.shortDisplayName ?? opp?.team?.displayName ?? 'TBD',
      oppAbbr: opp?.team?.abbreviation ?? null,
      oppLogo: opp?.team?.logos?.[0]?.href ?? null,
    });
  }

  games.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  const played = games.filter((g) => g.completed);
  const wins = played.filter((g) => g.result === 'W').length;

  return {
    espnId: pick.espnId,
    wins,
    losses: played.length - wins,
    played: played.length,
    scheduled: games.length,
    remaining: games.length - played.length,
    excludedCCG,
    // ESPN sometimes lists a team before its final non-conference opponent is
    // announced. Understated `remaining` could clinch an UNDER too early, so
    // the UI holds such picks as pending rather than calling them.
    scheduleIncomplete: games.length < 12,
    games,
  };
}

console.log(`Fetching ${picks.length} team schedules for ${SEASON} (regular season only)…`);

const teams = {};
const failures = [];
for (let i = 0; i < picks.length; i += CONCURRENCY) {
  const batch = picks.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(fetchTeam));
  results.forEach((r, j) => {
    if (r.status === 'fulfilled') teams[r.value.espnId] = r.value;
    else failures.push(`${batch[j].display}: ${r.reason?.message ?? r.reason}`);
  });
  process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, picks.length)}/${picks.length}`);
}
console.log('');

if (failures.length) {
  console.error(`\n${failures.length} team(s) failed to fetch:`);
  for (const f of failures) console.error('  ✗ ' + f);
  // Refuse to publish a partial file — stale-but-complete beats fresh-but-wrong.
  console.error('\nAborting without writing. Standings would be wrong.');
  process.exit(1);
}

const ccgStripped = Object.values(teams).reduce((n, t) => n + t.excludedCCG, 0);
const anomalies = Object.values(teams).filter((t) => t.scheduleIncomplete);

const OUT = resolve(ROOT, 'public/data/records.json');

// `updatedAt` means "when the results last changed", not "when we last checked".
// Stamping every run would rewrite the file daily and push ~150 empty commits
// and redeploys across the season, so an unchanged fetch is left alone.
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
