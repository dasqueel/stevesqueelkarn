#!/usr/bin/env node
// Loads a PAST season's real results into records.json so the site can be seen
// mid-season instead of sitting on a countdown. Useful for eyeballing layout
// and for showing people what the thing will look like in October.
//
//   npm run data:demo                       # 2025, truncated to week 8
//   node scripts/demo-records.mjs --season 2025 --week 11
//
// Restore real data with:  npm run data:records
//
// The file it writes carries a `demo` marker, and the site shows a loud banner
// whenever that marker is present — so demo data can never be mistaken for the
// live standings.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/records.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const season = Number(arg('season', 2025));
const week = Number(arg('week', 8));

if (season >= new Date().getFullYear()) {
  console.error(`--season ${season} has no completed games to show. Pick a past season.`);
  process.exit(1);
}

console.log(`Loading ${season} results, truncated to week ${week}…\n`);
execFileSync('node', [resolve(ROOT, 'scripts/fetch-records.mjs'), '--season', String(season)], {
  stdio: 'inherit',
});

const data = JSON.parse(readFileSync(OUT, 'utf8'));

for (const team of Object.values(data.teams)) {
  for (const g of team.games) {
    if ((g.week ?? 0) > week) {
      g.completed = false;
      g.result = null;
      g.score = null;
    }
  }
  const played = team.games.filter((g) => g.completed);
  team.wins = played.filter((g) => g.result === 'W').length;
  team.losses = played.length - team.wins;
  team.played = played.length;
  team.remaining = team.scheduled - played.length;
}

data.demo = { season, week };
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

const games = Object.values(data.teams).reduce((n, t) => n + t.played, 0);
console.log(`\n✓ DEMO DATA — ${season} season through week ${week} (${games} games)`);
console.log('✓ the site will show a banner while this is loaded');
console.log('→ restore real data with: npm run data:records');
