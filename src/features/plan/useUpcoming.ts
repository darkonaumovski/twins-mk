import { useLive } from '@/data/StoreContext';
import type { TwinSlot } from '@/data/types';
import { BABY_IDS } from '@/features/log/logic';
import { slotsFor, toMedLogs, upcomingItems, type UpcomingInput, type UpcomingItem } from './logic';

type Raw = Omit<UpcomingInput, 'now' | 'pastMs' | 'aheadMs' | 'appointmentAheadMs'>;

/** Everything upcomingItems() needs, kept live. */
export function useUpcomingData(): Raw | undefined {
  return useLive(async (s) => {
    const [routines, done, appointments, tasks, babyA, babyB] = await Promise.all([
      s.routines.list(),
      s.routineDone.list(),
      s.appointments.list(),
      s.tasks.list(),
      s.babies.get(BABY_IDS.A),
      s.babies.get(BABY_IDS.B),
    ]);
    // Twins in hospital drop out of routines marked "only when home".
    const awaySlots: TwinSlot[] = [];
    if (babyA?.location === 'hospital') awaySlots.push('A');
    if (babyB?.location === 'hospital') awaySlots.push('B');
    // Latest entry per twin, only for the log types that "after the last" routines watch.
    const latest: Raw['latest'] = {};
    for (const r of routines) {
      if (r.rule.kind !== 'afterLast' || !r.active) continue;
      for (const slot of slotsFor(r.babies) as TwinSlot[]) {
        const found = await s.logs.latest(BABY_IDS[slot], r.rule.logType);
        if (found) latest[slot] = { ...latest[slot], [r.rule.logType]: found.start };
      }
    }
    // Recent medicine doses, so a medicine routine counts as done once it was given.
    let medLogs: Raw['medLogs'] = [];
    if (routines.some((r) => r.med && r.active)) {
      const now = Date.now();
      const since = new Date(now - 2 * 24 * 3600_000).toISOString();
      const entries = await s.logs.listBetween(since, new Date(now + 60_000).toISOString());
      // The mother's doses, for medicine routines "for the mother".
      const mother = routines.some((r) => r.med && r.active && r.babies === 'none') ? await s.motherLogs.list() : [];
      medLogs = toMedLogs(
        entries,
        mother.filter((m) => m.start >= since),
      );
    }
    return { routines, done, appointments, tasks, latest, medLogs, awaySlots };
  }, []);
}

export function useUpcoming(
  now: Date,
  windows: Pick<UpcomingInput, 'pastMs' | 'aheadMs' | 'appointmentAheadMs'>,
): UpcomingItem[] | undefined {
  const raw = useUpcomingData();
  return raw && upcomingItems({ ...raw, now, ...windows });
}
