import type { Standing } from '../lib/scoring.ts';

interface Props {
  standings: Standing[];
  seasonStarted: boolean;
}

export default function Leaderboard({ standings, seasonStarted }: Props) {
  const leadPoints = standings[0]?.points ?? 0;

  return (
    <div className="board-stack">
      {standings.map((s) => {
        const total = s.picks.length;
        const isLeader = seasonStarted && s.points === leadPoints && leadPoints > 0;
        const back = leadPoints - s.points;

        return (
          <article
            key={s.player.id}
            className={`lb${isLeader ? ' lb--leader' : ''}`}
            style={{ ['--accent' as string]: `var(--${s.player.id})` }}
          >
            <div className="lb__rank num" aria-label={`Rank ${s.rank}`}>
              {seasonStarted ? s.rank : '—'}
            </div>

            {s.player.car && (
              <figure className="lb__car">
                <img
                  src={s.player.car}
                  alt={`${s.player.name}'s high school car, a ${s.player.carName ?? 'car'}`}
                  loading="lazy"
                  width={474}
                  height={316}
                />
                {s.player.carName && <figcaption className="num">{s.player.carName}</figcaption>}
              </figure>
            )}

            <div className="lb__id">
              <div className="lb__tag num">{s.player.tag}</div>
              <h2 className="lb__name">{s.player.name}</h2>

              <div className="lb__meta">
                {seasonStarted ? (
                  <>
                    <span>
                      <b>{s.points}</b> hit
                    </span>
                    <span>
                      <b>{s.lost}</b> bust
                    </span>
                    <span>
                      <b>{s.live}</b> alive
                    </span>
                    <span>
                      ceiling <b>{s.ceiling}</b>
                    </span>
                    {back > 0 && (
                      <span>
                        <b>−{back}</b> back
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>
                      <b>{total}</b> picks
                    </span>
                    <span>
                      <b>{s.overs}</b> over
                    </span>
                    <span>
                      <b>{s.unders}</b> under
                    </span>
                  </>
                )}
              </div>

              {seasonStarted && (
                <div
                  className="bar"
                  role="img"
                  aria-label={`${s.points} hit, ${s.lost} bust, ${s.live} still alive of ${total}`}
                >
                  {s.points > 0 && <div className="bar__seg bar__seg--won" style={{ flexGrow: s.points }} />}
                  {s.lost > 0 && <div className="bar__seg bar__seg--lost" style={{ flexGrow: s.lost }} />}
                  {s.live > 0 && <div className="bar__seg bar__seg--live" style={{ flexGrow: s.live }} />}
                </div>
              )}
            </div>

            <div className="lb__score">
              <span className="lb__pts">{seasonStarted ? s.points : total}</span>
              <span className="lb__ptslabel">{seasonStarted ? `of ${total} pts` : 'on the board'}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
