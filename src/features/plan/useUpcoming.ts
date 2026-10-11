import { useLive } from '@/data/StoreContext';
import type { TwinSlot } from '@/data/types';
import { BABY_IDS } from '@/features/log/logic';
import { slotsFor, upcomingItems, type UpcomingInput, type UpcomingItem } from './logic';

type Raw = Omit<UpcomingInput, 'now' | 'pastMs' | 'aheadMs' | 'appointmentAheadMs'>;

/** Everything upcomingItems() needs, kept live. */
export function useUpcomingData(): Raw | undefined {
  return useLive(async (s) => {
    const [routines, done, appointments, tasks] = await Promise.all([
      s.routines.list(),
      s.routineDone.list(),
      s.appointments.list(),
      s.tasks.list(),
    ]);
    // Latest entry per twin, only for the log types that "after the last" routines watch.
    const latest: Raw['latest'] = {};
    for (const r of routines) {
      if (r.rule.kind !== 'afterLast' || !r.active) continue;
      for (const slot of slotsFor(r.babies) as TwinSlot[]) {
        const found = await s.logs.latest(BABY_IDS[slot], r.rule.logType);
        if (found) latest[slot] = { ...latest[slot], [r.rule.logType]: found.start };
      }
    }
    return { routines, done, appointments, tasks, latest };
  }, []);
}

export function useUpcoming(
  now: Date,
  windows: Pick<UpcomingInput, 'pastMs' | 'aheadMs' | 'appointmentAheadMs'>,
): UpcomingItem[] | undefined {
  const raw = useUpcomingData();
  return raw && upcomingItems({ ...raw, now, ...windows });
}
