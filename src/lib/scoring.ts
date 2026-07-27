// Contest rules
// -------------
//  * 1 point per correct pick. 44 picks each, max 44 points.
//  * Regular season wins only — conference championships, bowls and the
//    playoff do not count (stripped upstream in scripts/fetch-records.mjs).
//  * Lines are all half-numbers, so nothing can push.

export type Side = 'over' | 'under';
export type Status = 'won' | 'lost' | 'live';

export interface Pick {
  player: string;
  draftName: string;
  side: Side;
  line: number;
  espnId: string;
  team: string;
  mascot: string;
  display: string;
  abbr: string;
  short: string;
  color: string;
  alt: string;
  logo: string | null;
}

export interface Game {
  week: number | null;
  date: string | null;
  completed: boolean;
  result: 'W' | 'L' | null;
  score: string | null;
  homeAway: string | null;
  oppName: string;
  oppAbbr: string | null;
  oppLogo: string | null;
}

export interface TeamRecord {
  espnId: string;
  wins: number;
  losses: number;
  played: number;
  scheduled: number;
  remaining: number;
  scheduleIncomplete: boolean;
  games: Game[];
}

export interface Player {
  id: string;
  name: string;
  /** High school car, self-hosted under public/cars/. */
  car?: string;
  carName?: string;
}

export interface ScoredPick extends Pick {
  wins: number;
  losses: number;
  played: number;
  remaining: number;
  status: Status;
  /** Wins still needed to cash an over; for an under, losses still needed. */
  need: number;
  /** How much room is left before the pick busts. 0 means the next result decides it. */
  cushion: number;
  maxWins: number;
  games: Game[];
  scheduleIncomplete: boolean;
}

export interface Standing {
  player: Player;
  picks: ScoredPick[];
  points: number;
  lost: number;
  live: number;
  /** Points if every undecided pick eventually cashes. */
  ceiling: number;
  rank: number;
  overs: number;
  unders: number;
}

/**
 * Resolve a single pick against a team's record.
 *
 * An over needs wins to exceed the line; it is mathematically dead once even
 * running the table falls short. An under is the mirror image: it is safe once
 * the team can no longer reach the line, and dead the moment it clears it.
 */
export function scorePick(pick: Pick, rec: TeamRecord | undefined): ScoredPick {
  const wins = rec?.wins ?? 0;
  const losses = rec?.losses ?? 0;
  const played = rec?.played ?? 0;
  const remaining = rec?.remaining ?? 0;
  const scheduleIncomplete = rec?.scheduleIncomplete ?? false;
  const maxWins = wins + remaining;

  let status: Status;
  if (pick.side === 'over') {
    status = wins > pick.line ? 'won' : maxWins < pick.line ? 'lost' : 'live';
  } else {
    status = wins > pick.line ? 'lost' : maxWins < pick.line ? 'won' : 'live';
  }

  // A team whose schedule is still missing a game has an understated
  // `remaining`, which can make an under look mathematically safe before it is.
  // Hold it live until the schedule fills in.
  if (status === 'won' && pick.side === 'under' && scheduleIncomplete && remaining > 0) {
    status = 'live';
  }

  const winsToClinch = Math.ceil(pick.line) - wins; // over: wins still needed
  const lossesToClinch = played + remaining - Math.floor(pick.line) - losses; // under: losses still needed

  return {
    ...pick,
    wins,
    losses,
    played,
    remaining,
    status,
    need: Math.max(0, pick.side === 'over' ? winsToClinch : lossesToClinch),
    cushion: pick.side === 'over' ? maxWins - Math.ceil(pick.line) : Math.floor(pick.line) - wins,
    maxWins,
    games: rec?.games ?? [],
    scheduleIncomplete,
  };
}

export function buildStandings(
  players: Player[],
  picks: Pick[],
  records: Record<string, TeamRecord>
): Standing[] {
  const rows = players.map((player) => {
    const scored = picks
      .filter((p) => p.player === player.id)
      .map((p) => scorePick(p, records[p.espnId]));

    const points = scored.filter((p) => p.status === 'won').length;
    const live = scored.filter((p) => p.status === 'live').length;

    return {
      player,
      picks: scored,
      points,
      lost: scored.filter((p) => p.status === 'lost').length,
      live,
      ceiling: points + live,
      rank: 0,
      overs: scored.filter((p) => p.side === 'over').length,
      unders: scored.filter((p) => p.side === 'under').length,
    };
  });

  // Sort by points, then by ceiling as a tiebreak (fewer busted picks is better).
  rows.sort((a, b) => b.points - a.points || b.ceiling - a.ceiling);

  // Standard competition ranking — ties share a rank.
  rows.forEach((row, i) => {
    row.rank =
      i > 0 && row.points === rows[i - 1].points && row.ceiling === rows[i - 1].ceiling
        ? rows[i - 1].rank
        : i + 1;
  });

  return rows;
}

/** Highest week with at least one completed game. 0 before the season starts. */
export function currentWeek(records: Record<string, TeamRecord>): number {
  let max = 0;
  for (const rec of Object.values(records)) {
    for (const g of rec.games) {
      if (g.completed && (g.week ?? 0) > max) max = g.week ?? 0;
    }
  }
  return max;
}
