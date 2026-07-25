import { useEffect, useState } from 'react';

interface Props {
  /** ISO date of the first scheduled game across all drafted teams. */
  kickoff: string | null;
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

export default function Kickoff({ kickoff }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!kickoff) return null;
  const { days, hours, mins, secs } = parts(new Date(kickoff).getTime() - now);

  const cells = [
    { n: days, l: 'Days' },
    { n: hours, l: 'Hours' },
    { n: mins, l: 'Minutes' },
    { n: secs, l: 'Seconds' },
  ];

  return (
    <div className="kick">
      {cells.map((c) => (
        <div className="kick__cell" key={c.l}>
          <div className="kick__n">{String(c.n).padStart(2, '0')}</div>
          <div className="kick__l">{c.l}</div>
        </div>
      ))}
      <div className="kick__cell kick__cell--wide">
        <div className="kick__n">
          {new Date(kickoff).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </div>
        <div className="kick__l">First Kickoff</div>
      </div>
    </div>
  );
}
