import { useMemo, useState } from 'react';
import type { Player, ScoredPick } from '../lib/scoring.ts';

interface Props {
  players: Player[];
  picks: ScoredPick[];
  seasonStarted: boolean;
}

type StatusFilter = 'all' | 'won' | 'lost' | 'live' | 'brink';
type SideFilter = 'all' | 'over' | 'under';
type Sort = 'draft' | 'team' | 'status' | 'wins';

/** A pick is "on the brink" when the very next result can settle it. */
export const onBrink = (p: ScoredPick) =>
  p.status === 'live' && (p.need === 1 || p.cushion === 0);

/** Long locations get clipped in the card, so fall back to ESPN's short form. */
const cardName = (p: ScoredPick) => (p.team.length > 15 ? p.short : p.team);

function statusLabel(p: ScoredPick, seasonStarted: boolean) {
  if (!seasonStarted) return `${p.remaining} games`;
  if (p.status === 'won') return 'Cashed';
  if (p.status === 'lost') return 'Bust';
  if (p.side === 'over') return `Needs ${p.need} more`;
  return `${p.need} loss${p.need === 1 ? '' : 'es'} to clinch`;
}

export default function Board({ players, picks, seasonStarted }: Props) {
  const tagOf = (id: string) => players.find((p) => p.id === id)?.tag ?? id;

  const [player, setPlayer] = useState<string>('all');
  // PARKED — the State filter block below is commented out, so nothing sets
  // this yet. Add `, setStatus` back here to un-park it. Stays 'all' meanwhile,
  // which lets every pick through the status check.
  const [status] = useState<StatusFilter>('all');
  const [side, setSide] = useState<SideFilter>('all');
  // PARKED — the Sort block below is commented out, so nothing sets this yet.
  // Add `, setSort` back here to un-park it. Stays 'draft' meanwhile, which
  // keeps the board in draft order, grouped by player.
  const [sort] = useState<Sort>('draft');

  const visible = useMemo(() => {
    let out = picks.filter((p) => {
      if (player !== 'all' && p.player !== player) return false;
      if (side !== 'all' && p.side !== side) return false;
      if (status === 'brink' && !onBrink(p)) return false;
      if (status !== 'all' && status !== 'brink' && p.status !== status) return false;
      return true;
    });

    const rank = { won: 0, live: 1, lost: 2 } as const;
    out = [...out];
    if (sort === 'team') out.sort((a, b) => a.team.localeCompare(b.team));
    else if (sort === 'wins') out.sort((a, b) => b.wins - a.wins || a.team.localeCompare(b.team));
    else if (sort === 'status')
      out.sort((a, b) => rank[a.status] - rank[b.status] || a.team.localeCompare(b.team));
    return out;
  }, [picks, player, status, side, sort]);

  const chip = (
    active: boolean,
    label: string,
    onClick: () => void,
    color?: string,
    key?: string
  ) => (
    <button
      key={key ?? label}
      className="chip"
      aria-pressed={active}
      onClick={onClick}
      style={color ? ({ ['--chip-on' as string]: color }) : undefined}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="filters">
        <div className="fgroup">
          <span className="fgroup__label">Who</span>
          {chip(player === 'all', 'All', () => setPlayer('all'))}
          {players.map((p) =>
            chip(player === p.id, p.name, () => setPlayer(p.id), `var(--${p.id})`, p.id)
          )}
        </div>

        {/* PARKED — State filter. To bring it back, uncomment this block and
            restore the useState line marked above.
        {seasonStarted && (
          <div className="fgroup">
            <span className="fgroup__label">State</span>
            {chip(status === 'all', 'All', () => setStatus('all'))}
            {chip(status === 'won', 'Cashed', () => setStatus('won'), 'var(--won)')}
            {chip(status === 'live', 'Alive', () => setStatus('live'))}
            {chip(status === 'brink', 'On the brink', () => setStatus('brink'), 'var(--brink)')}
            {chip(status === 'lost', 'Bust', () => setStatus('lost'), 'var(--chalk-dim)')}
          </div>
        )}
        */}

        <div className="fgroup">
          <span className="fgroup__label">Side</span>
          {chip(side === 'all', 'Both', () => setSide('all'))}
          {chip(side === 'over', 'Over', () => setSide('over'))}
          {chip(side === 'under', 'Under', () => setSide('under'))}
        </div>

        {/* PARKED — Sort controls. To bring them back, uncomment this block and
            restore the useState line marked above.
        <div className="fgroup">
          {chip(sort === 'draft', 'Draft', () => setSort('draft'))}
          {chip(sort === 'team', 'A–Z', () => setSort('team'))}
          {seasonStarted && chip(sort === 'wins', 'Wins', () => setSort('wins'))}
          {seasonStarted && chip(sort === 'status', 'State', () => setSort('status'))}
        </div>
        */}

      </div>

      {visible.length === 0 ? (
        <p className="empty">No picks match those filters</p>
      ) : (
        <div className="grid">
          {visible.map((p) => {
            const brink = onBrink(p);
            const cls = !seasonStarted
              ? 'pick'
              : `pick pick--${brink ? 'brink' : p.status}`;

            return (
              <article className={cls} key={`${p.player}-${p.espnId}`}>
                {p.logo ? (
                  <img className="pick__logo" src={p.logo} alt="" loading="lazy" width={30} height={30} />
                ) : (
                  <span className="pick__logo" />
                )}

                <div className="pick__body">
                  <h3 className="pick__team" title={p.display}>
                    {cardName(p)}
                  </h3>
                  <div className="pick__line num">
                    <span
                      className="pick__owner"
                      style={{ background: `var(--${p.player})` }}
                      aria-hidden="true"
                    />
                    <span className={`pick__side pick__side--${p.side}`}>
                      {p.side === 'over' ? '▲ OVER' : '▼ UNDER'} {p.line}
                    </span>
                  </div>
                </div>

                <div className="pick__right">
                  <div
                    className="pick__rec"
                    style={seasonStarted ? undefined : { color: `var(--${p.player})`, fontSize: '0.72rem' }}
                  >
                    {seasonStarted ? `${p.wins}-${p.losses}` : tagOf(p.player)}
                  </div>
                  <div className="pick__status">{statusLabel(p, seasonStarted)}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p
        className="num"
        style={{
          marginTop: '1rem',
          fontSize: '0.58rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--chalk-faint)',
        }}
      >
        Showing {visible.length} of {picks.length}
      </p>
    </>
  );
}
