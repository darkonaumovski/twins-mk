import type { DataStore } from '@/data/repository';
import type { CaregiverId, MilkStashItem, Pump, PumpSide, StashLocation } from '@/data/types';
import { pumpMinutes, runningPump, stashIdForPump } from './logic';

/**
 * Starts the family's pumping timer. Only one runs at a time: if one is already running
 * (on this phone or synced from the other), that one is returned instead of a second.
 */
export async function startPump(
  store: DataStore,
  side: PumpSide,
  loggedBy: CaregiverId,
  now: Date,
): Promise<{ pump: Pump; started: boolean }> {
  // One transaction, so a double tap cannot start two.
  return store.transaction(async () => {
    const running = runningPump(await store.pumps.list());
    if (running) return { pump: running, started: false };
    const pump = await store.pumps.create({
      start: now.toISOString(),
      end: null,
      side,
      minutes: null,
      leftMl: null,
      rightMl: null,
      totalMl: 0,
      loggedBy,
    });
    return { pump, started: true };
  });
}

/**
 * Stops a running timer: the end time and the minutes (rounded up) are saved at once, so the
 * session is right even if the amounts are entered later. Stopping one that the other phone
 * already stopped changes nothing.
 */
export async function stopPump(store: DataStore, pumpId: string, now: Date): Promise<Pump | undefined> {
  // One transaction, so a double tap writes once.
  return store.transaction(async () => {
    const current = await store.pumps.get(pumpId);
    if (!current || current.end !== null) return current;
    const end = now.toISOString();
    return store.pumps.update(pumpId, { end, minutes: pumpMinutes(current.start, end) });
  });
}

export type PumpFields = Pick<Pump, 'start' | 'minutes' | 'leftMl' | 'rightMl' | 'totalMl'>;

/**
 * Saves a pumping session: a new one, an edit, or the amounts after the timer stopped, and puts the
 * milk in the stash if asked. Returns null when the session was deleted on the other phone meanwhile
 * (nothing is written then, so no milk lands in the stash for a session nobody can see).
 */
export async function saveSession(
  store: DataStore,
  input: { pump: Pump | null; fields: PumpFields; loggedBy: CaregiverId; stash: StashLocation | null },
): Promise<{ pump: Pump; stash: MilkStashItem | null } | null> {
  return store.transaction(async () => {
    let pump: Pump;
    if (input.pump) {
      if (!(await store.pumps.get(input.pump.id))) return null;
      pump = await store.pumps.update(input.pump.id, input.fields);
    } else {
      pump = await store.pumps.create({ ...input.fields, loggedBy: input.loggedBy });
    }
    const stash = input.stash ? await putInStash(store, pump, input.fields.totalMl, input.stash) : null;
    return { pump, stash };
  });
}

/** The stash container a session already has (e.g. the other phone saved it first), if it is live. */
export async function stashOfSession(store: DataStore, pumpId: string): Promise<MilkStashItem | undefined> {
  return store.milkStash.get(stashIdForPump(pumpId));
}

/**
 * Adds the session's milk to the stash under the session's fixed container id, or updates that
 * container if it is already there (the other phone saved the same session, or it was undone).
 * A container that bottles have already used up is left alone, so used milk never comes back.
 */
export async function putInStash(store: DataStore, pump: Pump, ml: number, location: StashLocation): Promise<MilkStashItem> {
  const id = stashIdForPump(pump.id);
  const existing = (await store.milkStash.listAll()).find((s) => s.id === id);
  const data = { pumpedAt: pump.start, ml, location, usedAt: null, pumpId: pump.id };
  if (!existing) return store.milkStash.create({ id, ...data });
  if (existing.deletedAt === null && existing.usedAt !== null) return existing;
  if (existing.deletedAt !== null) await store.milkStash.restore(id);
  return store.milkStash.update(id, data);
}
