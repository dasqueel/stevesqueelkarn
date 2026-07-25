import { useEffect, useState } from 'react';
import type { TeamRecord } from '../lib/scoring.ts';

export interface RecordsFile {
  season: number;
  updatedAt: string;
  teams: Record<string, TeamRecord>;
  /** Present only when scripts/demo-records.mjs loaded a past season. */
  demo?: { season: number; week: number };
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; data: RecordsFile }
  | { status: 'error'; message: string };

/**
 * records.json is regenerated weekly by a GitHub Action and served as a static
 * asset, so it is fetched at runtime rather than bundled — a data refresh then
 * needs no rebuild of the JS.
 */
export function useRecords(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}data/records.json`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`records.json returned ${r.status}`);
        return r.json();
      })
      .then((data: RecordsFile) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
