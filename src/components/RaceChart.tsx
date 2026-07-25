import { useMemo, useState } from 'react';
import type { Pick, Player, TeamRecord } from '../lib/scoring.ts';
import { standingsThroughWeek } from '../lib/scoring.ts';

interface Props {
  players: Player[];
  picks: Pick[];
  records: Record<string, TeamRecord>;
  currentWeek: number;
}

const W = 900;
const H = 320;
const PAD = { top: 16, right: 62, bottom: 30, left: 34 };
const LABEL_GAP = 13;

/**
 * Push overlapping end-labels apart so tied players stay readable. Walks the
 * labels top-down, enforcing a minimum gap, then shifts the whole run back up
 * if it has spilled past the bottom of the plot.
 */
function declutter<T extends { y: number }>(labels: T[]): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < LABEL_GAP) sorted[i] = { ...sorted[i], y: sorted[i - 1].y + LABEL_GAP };
  }
  const overflow = sorted[sorted.length - 1].y - (H - PAD.bottom);
  if (overflow > 0) return sorted.map((l) => ({ ...l, y: l.y - overflow }));
  return sorted;
}

export default function RaceChart({ players, picks, records, currentWeek }: Props) {
  const [hoverWeek, setHoverWeek] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const weeks = useMemo(
    () => Array.from({ length: currentWeek }, (_, i) => i + 1),
    [currentWeek]
  );

  // series[playerId][weekIndex] = points banked through that week
  const series = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const p of players) out[p.id] = [];
    for (const w of weeks) {
      const table = standingsThroughWeek(players, picks, records, w);
      for (const row of table) out[row.player.id].push(row.points);
    }
    return out;
  }, [players, picks, records, weeks]);

  if (currentWeek === 0) {
    return (
      <div className="chart">
        <div className="chart__empty">
          <span>The race begins Week 1</span>
          <span style={{ color: 'var(--chalk-faint)', opacity: 0.7 }}>
            Points banked each week will plot here
          </span>
        </div>
      </div>
    );
  }

  const maxY = Math.max(4, ...Object.values(series).flat()) ;
  const yTicks = 4;
  const x = (w: number) =>
    PAD.left + ((w - 1) / Math.max(1, currentWeek - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom);

  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const hovered = hoverWeek ?? null;

  return (
    <div className="chart">
      <div className="chart__legend">
        {players.map((p) => (
          <span className="chart__key" key={p.id}>
            <span className="chart__swatch" style={{ background: `var(--${p.id})` }} />
            {p.name}
            <span className="num" style={{ color: 'var(--chalk)' }}>
              {series[p.id]?.[currentWeek - 1] ?? 0}
            </span>
          </span>
        ))}
        <button
          className="chip"
          style={{ marginLeft: 'auto' }}
          aria-pressed={showTable}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Hide table' : 'Table view'}
        </button>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Points banked by week through week ${currentWeek}`}
        onMouseLeave={() => setHoverWeek(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const ratio = (px - PAD.left) / (W - PAD.left - PAD.right);
          const w = Math.round(ratio * Math.max(1, currentWeek - 1)) + 1;
          setHoverWeek(Math.min(currentWeek, Math.max(1, w)));
        }}
      >
        {/* recessive gridlines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = (maxY / yTicks) * i;
          return (
            <g key={i}>
              <line className="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
              <text className="chart__axis" x={PAD.left - 8} y={y(v) + 3} textAnchor="end">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {weeks.map((w) =>
          w === 1 || w === currentWeek || w % Math.ceil(currentWeek / 8) === 0 ? (
            <text key={w} className="chart__axis" x={x(w)} y={H - PAD.bottom + 16} textAnchor="middle">
              W{w}
            </text>
          ) : null
        )}

        {hovered !== null && (
          <line
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--chalk-faint)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {players.map((p) => (
          <path key={p.id} className="chart__line" d={path(series[p.id])} stroke={`var(--${p.id})`} />
        ))}

        {/* hover markers, ringed in the surface colour so overlaps stay legible */}
        {hovered !== null &&
          players.map((p) => (
            <circle
              key={p.id}
              cx={x(hovered)}
              cy={y(series[p.id][hovered - 1] ?? 0)}
              r={5}
              fill={`var(--${p.id})`}
              stroke="var(--felt)"
              strokeWidth={2}
            />
          ))}

        {/* Direct labels at the line ends — identity never rests on colour alone.
            Tied players land on identical y values, so nudge them apart first. */}
        {declutter(
          players.map((p) => ({ id: p.id, tag: p.tag, y: y(series[p.id][currentWeek - 1] ?? 0) }))
        ).map((l) => (
          <text
            key={l.id}
            x={W - PAD.right + 10}
            y={l.y + 3}
            fill={`var(--${l.id})`}
            fontFamily="var(--mono)"
            fontSize={11}
            fontWeight={700}
          >
            {l.tag}
          </text>
        ))}
      </svg>

      {hovered !== null && (
        <div
          className="num"
          style={{
            marginTop: '0.75rem',
            fontSize: '0.63rem',
            letterSpacing: '0.1em',
            color: 'var(--chalk-dim)',
            textTransform: 'uppercase',
          }}
        >
          Week {hovered} ·{' '}
          {players.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ' · '}
              <span style={{ color: `var(--${p.id})` }}>{p.tag}</span> {series[p.id][hovered - 1] ?? 0}
            </span>
          ))}
        </div>
      )}

      {showTable && (
        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table className="num" style={{ borderCollapse: 'collapse', fontSize: '0.65rem', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.35rem 0.6rem', color: 'var(--chalk-faint)' }}>
                  Week
                </th>
                {players.map((p) => (
                  <th key={p.id} style={{ textAlign: 'right', padding: '0.35rem 0.6rem', color: `var(--${p.id})` }}>
                    {p.tag}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={w} style={{ borderTop: '1px solid var(--rule-soft)' }}>
                  <td style={{ padding: '0.35rem 0.6rem', color: 'var(--chalk-dim)' }}>W{w}</td>
                  {players.map((p) => (
                    <td key={p.id} style={{ textAlign: 'right', padding: '0.35rem 0.6rem' }}>
                      {series[p.id][i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
