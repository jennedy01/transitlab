import { useEffect, useState } from 'react';
import { getRollingStock, type RollingStock } from './api';

// Module-level cache so the reference list is fetched once per session.
let cache: RollingStock[] | null = null;
let inflight: Promise<RollingStock[]> | null = null;

export function useRollingStock(): RollingStock[] {
  const [list, setList] = useState<RollingStock[]>(cache ?? []);
  useEffect(() => {
    if (cache) {
      setList(cache);
      return;
    }
    inflight =
      inflight ??
      getRollingStock().then((r) => {
        cache = r.rollingStock;
        return cache;
      });
    let active = true;
    void inflight.then((rs) => active && setList(rs));
    return () => {
      active = false;
    };
  }, []);
  return list;
}
