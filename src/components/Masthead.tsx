interface Props {
  season: number;
  updatedAt: string;
  week: number;
  seasonStarted: boolean;
  totalPicks: number;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function Masthead({ season, updatedAt, week, seasonStarted, totalPicks }: Props) {
  return (
    <header className="mast">
      <div className="mast__kicker">
        <span>{season} College Football · Season Win Totals</span>
      </div>

      <h1 className="mast__title">
        <span className="mast__name">Steve</span>
        <span className="mast__dot">◆</span>
        <span className="mast__name">Squeel</span>
        <span className="mast__dot">◆</span>
        <span className="mast__name">Karn</span>
      </h1>

      <div className="mast__sub">
        <span>
          {seasonStarted ? (
            <>
              <span className="live-dot" aria-hidden="true" />
              Through Week <b>{week}</b>
            </>
          ) : (
            <>Draft locked · <b>{totalPicks}</b> picks on the board</>
          )}
        </span>
        <span>
          Regular season only <b>·</b> no bowls, no playoff, no title games
        </span>
        <span>
          Updated <b>{fmt(updatedAt)}</b>
        </span>
      </div>
    </header>
  );
}
