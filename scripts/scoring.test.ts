// node --test scripts/scoring.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePick, buildStandings, standingsThroughWeek } from '../src/lib/scoring.ts';
import type { Pick, TeamRecord, Game } from '../src/lib/scoring.ts';

const pick = (side: 'over' | 'under', line: number): Pick => ({
  player: 'p',
  draftName: 'Test',
  side,
  line,
  espnId: '1',
  team: 'Test',
  mascot: 'Testers',
  display: 'Test Testers',
  abbr: 'TST',
  short: 'Test',
  color: '#000',
  alt: '#fff',
  logo: null,
});

const game = (week: number, result: 'W' | 'L' | null): Game => ({
  week,
  date: `2026-09-${String(week).padStart(2, '0')}T00:00Z`,
  completed: result !== null,
  result,
  score: null,
  homeAway: 'home',
  oppName: 'Opp',
  oppAbbr: 'OPP',
  oppLogo: null,
});

const rec = (wins: number, losses: number, scheduled = 12, incomplete = false): TeamRecord => {
  const games: Game[] = [];
  for (let i = 0; i < wins; i++) games.push(game(games.length + 1, 'W'));
  for (let i = 0; i < losses; i++) games.push(game(games.length + 1, 'L'));
  while (games.length < scheduled) games.push(game(games.length + 1, null));
  return {
    espnId: '1',
    wins,
    losses,
    played: wins + losses,
    scheduled,
    remaining: scheduled - wins - losses,
    scheduleIncomplete: incomplete,
    games,
  };
};

test('over clinches the moment wins clear the line', () => {
  assert.equal(scorePick(pick('over', 5.5), rec(6, 0)).status, 'won');
  assert.equal(scorePick(pick('over', 5.5), rec(5, 0)).status, 'live');
});

test('over dies once running the table falls short', () => {
  // 5 wins max against a 5.5 line is dead even if every remaining game is won.
  assert.equal(scorePick(pick('over', 5.5), rec(0, 7, 12)).status, 'lost');
  assert.equal(scorePick(pick('over', 5.5), rec(0, 6, 12)).status, 'live');
});

test('under clinches once the team can no longer reach the line', () => {
  // 2 wins + 3 remaining = 5 max, under 5.5 is safe.
  assert.equal(scorePick(pick('under', 5.5), rec(2, 7, 12)).status, 'won');
  assert.equal(scorePick(pick('under', 5.5), rec(2, 6, 12)).status, 'live');
});

test('under dies the moment the team clears the line', () => {
  assert.equal(scorePick(pick('under', 5.5), rec(6, 0)).status, 'lost');
  assert.equal(scorePick(pick('under', 5.5), rec(5, 0)).status, 'live');
});

test('every pick resolves at season end — nothing can push', () => {
  for (const line of [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5]) {
    for (let w = 0; w <= 12; w++) {
      for (const side of ['over', 'under'] as const) {
        const s = scorePick(pick(side, line), rec(w, 12 - w));
        assert.notEqual(s.status, 'live', `${side} ${line} at ${w} wins should be decided`);
        const correct = side === 'over' ? w > line : w < line;
        assert.equal(s.status, correct ? 'won' : 'lost', `${side} ${line} @ ${w}W`);
      }
    }
  }
});

test('an under is held live while the schedule is still missing a game', () => {
  // 2 wins, 7 losses, only 11 games listed -> looks safe, but a 12th game may appear.
  assert.equal(scorePick(pick('under', 5.5), rec(2, 7, 11, true)).status, 'live');
  // Same record with a confirmed full schedule is genuinely safe.
  assert.equal(scorePick(pick('under', 5.5), rec(2, 7, 11, false)).status, 'won');
});

test('an over is never held back by an incomplete schedule', () => {
  assert.equal(scorePick(pick('over', 5.5), rec(6, 0, 11, true)).status, 'won');
});

test('need counts what is still required', () => {
  assert.equal(scorePick(pick('over', 7.5), rec(3, 2)).need, 5); // needs 8 wins, has 3 -> 5 more
  assert.equal(scorePick(pick('under', 7.5), rec(3, 2)).need, 3); // needs 5 losses, has 2 -> 3 more
  assert.equal(scorePick(pick('over', 7.5), rec(8, 2)).need, 0);
  assert.equal(scorePick(pick('under', 7.5), rec(0, 5)).need, 0); // 5 losses already banked
});

test('standings rank by points and break ties on ceiling', () => {
  const players = [
    { id: 'a', tag: 'A', name: 'A' },
    { id: 'b', tag: 'B', name: 'B' },
  ];
  const picks: Pick[] = [
    { ...pick('over', 5.5), player: 'a', espnId: '1' },
    { ...pick('over', 5.5), player: 'b', espnId: '2' },
  ];
  const records = {
    '1': { ...rec(6, 0), espnId: '1' }, // a: won
    '2': { ...rec(0, 12), espnId: '2' }, // b: lost
  };
  const table = buildStandings(players, picks, records);
  assert.equal(table[0].player.id, 'a');
  assert.equal(table[0].points, 1);
  assert.equal(table[0].rank, 1);
  assert.equal(table[1].points, 0);
  assert.equal(table[1].ceiling, 0);
  assert.equal(table[1].rank, 2);
});

test('identical records share a rank', () => {
  const players = [
    { id: 'a', tag: 'A', name: 'A' },
    { id: 'b', tag: 'B', name: 'B' },
  ];
  const picks: Pick[] = [
    { ...pick('over', 5.5), player: 'a', espnId: '1' },
    { ...pick('over', 5.5), player: 'b', espnId: '2' },
  ];
  const records = { '1': { ...rec(6, 0), espnId: '1' }, '2': { ...rec(6, 0), espnId: '2' } };
  const table = buildStandings(players, picks, records);
  assert.equal(table[0].rank, 1);
  assert.equal(table[1].rank, 1);
});

test('week replay reconstructs an earlier snapshot', () => {
  const players = [{ id: 'a', tag: 'A', name: 'A' }];
  const picks: Pick[] = [{ ...pick('over', 2.5), player: 'a', espnId: '1' }];
  // Wins in weeks 1-3, so the over cashes in week 3 but not week 2.
  const records = { '1': { ...rec(3, 0), espnId: '1' } };

  assert.equal(standingsThroughWeek(players, picks, records, 2)[0].points, 0);
  assert.equal(standingsThroughWeek(players, picks, records, 3)[0].points, 1);
});

test('a missing team record does not crash scoring', () => {
  const s = scorePick(pick('over', 5.5), undefined);
  assert.equal(s.status, 'lost'); // 0 wins, 0 remaining
  assert.equal(s.games.length, 0);
});
