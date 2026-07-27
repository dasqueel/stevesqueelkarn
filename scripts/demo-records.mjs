#!/usr/bin/env node
// Simulates results onto the REAL 2026 schedule so the site can be viewed
// mid-season instead of sitting on a countdown. Useful for checking layout and
// scoring, and for showing people what it'll look like in October.
//
//   npm run data:demo                     # through week 8
//   node scripts/demo-records.mjs --week 13
//
// Restore real data with:  npm run data:records
//
// Results are invented, not real. They're deterministic (same week always
// yields the same standings) and weighted by each team's drafted line, so good
// teams win more and the board looks plausible. The file carries a `demo`
// marker and the site shows a banner while it's loaded, so simulated data can
// never be mistaken for live standings.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/data/records.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const week = Number(arg('week', 8));

let data;
try {
  data = JSON.parse(readFileSync(OUT, 'utf8'));
} catch {
  console.error('No records.json yet. Run `npm run data:records` first to pull the schedule.');
  process.exit(1);
}
if (data.demo) {
  console.error('records.json already holds demo data. Run `npm run data:records` first.');
  process.exit(1);
}

const { picks } = JSON.parse(readFileSync(resolve(ROOT, 'src/data/picks.json'), 'utf8'));
const lineOf = new Map(picks.map((p) => [p.espnId, p.line]));

/** Deterministic hash -> [0,1). Same inputs always give the same game. */
function rand(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

for (const [id, team] of Object.entries(data.teams)) {
  // A team drafted at over/under 8.5 is roughly an 8.5-win team, so use the
  // line as a stand-in for strength. Keeps the simulated board believable.
  const strength = Math.min(0.85, Math.max(0.15, (lineOf.get(id) ?? 6) / 12));

  for (const g of team.games) {
    if ((g.week ?? 0) > week) {
      g.completed = false;
      g.result = null;
      g.score = null;
      continue;
    }
    const won = rand(`${id}:${g.week}:${g.oppName}`) < strength;
    const mine = won ? 21 + Math.floor(rand(`s${id}${g.week}`) * 21) : 10 + Math.floor(rand(`s${id}${g.week}`) * 11);
    const theirs = won ? mine - (3 + Math.floor(rand(`m${id}${g.week}`) * 18)) : mine + (3 + Math.floor(rand(`m${id}${g.week}`) * 18));
    g.completed = true;
    g.result = won ? 'W' : 'L';
    g.score = `${mine}-${Math.max(0, theirs)}`;
  }

  const played = team.games.filter((g) => g.completed);
  team.wins = played.filter((g) => g.result === 'W').length;
  team.losses = played.length - team.wins;
  team.played = played.length;
  team.remaining = team.scheduled - played.length;
}

data.demo = { simulated: true, week };
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');

const games = Object.values(data.teams).reduce((n, t) => n + t.played, 0);
console.log(`✓ SIMULATED results through week ${week} (${games} games) — not real`);
console.log('✓ the site will show a banner while this is loaded');
console.log('→ restore real data with: npm run data:records');
