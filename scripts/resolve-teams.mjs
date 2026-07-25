#!/usr/bin/env node
// Resolves every drafted team name to a canonical ESPN team id, then writes
// src/data/picks.json. Run once at setup, or again if the draft board changes.
//
//   node scripts/resolve-teams.mjs
//
// Exits non-zero on ANY ambiguity — a silently mis-resolved team would corrupt
// the standings all season, so this refuses to guess.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYERS, DRAFT, ALIASES, ID_OVERRIDES } from './draft.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEAMS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

console.log('Fetching ESPN team directory…');
const res = await fetch(TEAMS_URL);
if (!res.ok) throw new Error(`ESPN teams request failed: ${res.status}`);
const body = await res.json();
const teams = body.sports[0].leagues[0].teams.map((t) => t.team);
console.log(`  ${teams.length} teams in directory\n`);

const byId = new Map(teams.map((t) => [t.id, t]));
const byLocation = new Map();
for (const t of teams) {
  const k = norm(t.location);
  if (!byLocation.has(k)) byLocation.set(k, []);
  byLocation.get(k).push(t);
}

const errors = [];
const picks = [];
const claimed = new Map(); // espn id -> "player:draftName", catches double-drafts

for (const player of PLAYERS) {
  const entries = DRAFT[player.id];
  if (entries.length !== 44) {
    errors.push(`${player.name} has ${entries.length} picks, expected 44`);
  }

  for (const [draftName, side, line] of entries) {
    let team;

    if (ID_OVERRIDES[draftName]) {
      team = byId.get(ID_OVERRIDES[draftName]);
      if (!team) {
        errors.push(`${draftName}: override id ${ID_OVERRIDES[draftName]} not in directory`);
        continue;
      }
    } else {
      const lookup = ALIASES[draftName] ?? draftName;
      const matches = byLocation.get(norm(lookup)) ?? [];
      if (matches.length === 0) {
        errors.push(`${player.name} / "${draftName}" -> no ESPN team named "${lookup}"`);
        continue;
      }
      if (matches.length > 1) {
        const ids = matches.map((m) => `${m.id} (${m.displayName})`).join(', ');
        errors.push(`${player.name} / "${draftName}" -> ambiguous: ${ids}. Add an ID_OVERRIDE.`);
        continue;
      }
      team = matches[0];
    }

    const owner = `${player.name}:${draftName}`;
    if (claimed.has(team.id)) {
      errors.push(`${team.displayName} drafted twice: ${claimed.get(team.id)} and ${owner}`);
    }
    claimed.set(team.id, owner);

    picks.push({
      player: player.id,
      draftName,
      side,
      line,
      espnId: team.id,
      team: team.location,
      mascot: team.name,
      display: team.displayName,
      abbr: team.abbreviation,
      short: team.shortDisplayName,
      color: team.color ? `#${team.color}` : '#444444',
      alt: team.alternateColor ? `#${team.alternateColor}` : '#111111',
      logo: team.logos?.[0]?.href ?? null,
    });
  }
}

if (errors.length) {
  console.error('RESOLUTION FAILED:\n');
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(`\n${errors.length} problem(s). Nothing written.`);
  process.exit(1);
}

mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });
writeFileSync(
  resolve(ROOT, 'src/data/picks.json'),
  JSON.stringify({ players: PLAYERS, picks }, null, 2) + '\n'
);

for (const p of PLAYERS) {
  const mine = picks.filter((x) => x.player === p.id);
  const o = mine.filter((x) => x.side === 'over').length;
  console.log(`${p.tag.padEnd(6)} ${p.name.padEnd(8)} ${mine.length} picks  (${o} over / ${mine.length - o} under)`);
}
console.log(`\n✓ ${picks.length} picks resolved, ${claimed.size} unique teams`);
console.log('✓ wrote src/data/picks.json');
