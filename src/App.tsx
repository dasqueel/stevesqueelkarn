import { useMemo } from 'react';
import picksFile from './data/picks.json';
import { useRecords } from './hooks/useRecords.ts';
import { buildStandings, currentWeek, scorePick } from './lib/scoring.ts';
import type { Pick, Player } from './lib/scoring.ts';
import Masthead from './components/Masthead.tsx';
import Leaderboard from './components/Leaderboard.tsx';
import RaceChart from './components/RaceChart.tsx';
import Board, { onBrink } from './components/Board.tsx';
import Kickoff from './components/Kickoff.tsx';

const players = picksFile.players as Player[];
const picks = picksFile.picks as Pick[];

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="section__head">
      <h2 className="section__title">{title}</h2>
      <span className="section__rule" />
      {note && <span className="section__note">{note}</span>}
    </div>
  );
}

export default function App() {
  const state = useRecords();

  const view = useMemo(() => {
    if (state.status !== 'ready') return null;
    const records = state.data.teams;
    const week = currentWeek(records);
    const standings = buildStandings(players, picks, records);
    const scored = picks.map((p) => scorePick(p, records[p.espnId]));

    const kickoff = Object.values(records)
      .flatMap((t) => t.games.map((g) => g.date))
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null;

    return { records, week, standings, scored, kickoff, seasonStarted: week > 0 };
  }, [state]);

  if (state.status === 'loading') {
    return (
      <div className="shell">
        <p className="empty" style={{ marginTop: '6rem' }}>
          Loading the board…
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="shell">
        <p className="empty" style={{ marginTop: '6rem' }}>
          Could not load standings — {state.message}
        </p>
      </div>
    );
  }

  const { records, week, standings, scored, kickoff, seasonStarted } = view!;
  const brinkCount = scored.filter(onBrink).length;

  return (
    <div className="shell">
      <Masthead
        season={state.data.season}
        updatedAt={state.data.updatedAt}
        week={week}
        seasonStarted={seasonStarted}
        totalPicks={picks.length}
      />

      {!seasonStarted && (
        <section className="section">
          <SectionHead title="Kickoff" note="Season not yet underway" />
          <Kickoff kickoff={kickoff} />
        </section>
      )}

      <section className="section">
        <SectionHead
          title={seasonStarted ? 'Standings' : 'The Field'}
          note={seasonStarted ? '1 point per pick that cashes' : '44 picks each'}
        />
        <Leaderboard standings={standings} seasonStarted={seasonStarted} />
      </section>

      <section className="section">
        <SectionHead title="The Race" note="Points banked by week" />
        <RaceChart players={players} picks={picks} records={records} currentWeek={week} />
      </section>

      <section className="section">
        <SectionHead
          title="The Board"
          note={
            seasonStarted && brinkCount > 0
              ? `${brinkCount} pick${brinkCount === 1 ? '' : 's'} on the brink`
              : `${picks.length} picks`
          }
        />
        <Board players={players} picks={scored} seasonStarted={seasonStarted} />
      </section>

      <footer className="foot">
        <span>Steve · Squeel · Karn — {state.data.season} season win totals</span>
        <span>Records via ESPN · regular season only</span>
      </footer>
    </div>
  );
}
