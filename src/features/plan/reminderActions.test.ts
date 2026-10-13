import { describe, expect, it } from 'vitest';
import { openDexieStore } from '@/data/dexieStore';
import type { Entity, Routine } from '@/data/types';
import { buildEntries } from '@/features/log/logic';
import { applyReminderAction, doneId, isReminderActionData, SNOOZE_MS, type ReminderActionData } from './reminderActions';

let n = 0;
async function setup(routine: Partial<Routine> = {}) {
  const store = await openDexieStore({ name: `reminder-actions-${++n}` });
  const vitD = await store.routines.create({
    title: 'Vitamin D',
    babies: 'both',
    active: true,
    rule: { kind: 'everyDays', days: 1, times: ['09:00'], startDate: '2026-10-01' },
    med: { name: 'Vitamin D', dose: '1 drop', minIntervalHours: null },
    ...routine,
  });
  return { store, routine: vitD };
}

const occurrence = '2026-10-11T07:00:00.000Z';
const now = new Date('2026-10-11T07:05:00.000Z');
const action = (r: Routine, over: Partial<ReminderActionData> = {}): ReminderActionData => ({
  kind: r.med ? 'medicines' : 'routines',
  routineId: r.id,
  occurrence,
  babies: r.babies,
  med: Boolean(r.med),
  key: `routine:${r.id}:${r.babies}:${occurrence}`,
  title: r.title,
  ...over,
});
/** What a record says, without the bookkeeping the store adds. */
const content = <T extends Entity>({ id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, deviceId: _v, updatedBy: _b, ...rest }: T) =>
  rest;

describe('Done on a push reminder', () => {
  // Daily care logs one tap per twin; the button logs both at once, linked by one groupId (like a "both" entry).
  it('writes what Today does: the occurrence marked done, and each twin’s dose (linked as one for both)', async () => {
    const { store, routine } = await setup();
    await applyReminderAction(store, 'done', action(routine), now, 'p2');

    const done = await store.routineDone.list();
    // "Coming up" → Done creates exactly this.
    expect(done.map(content)).toEqual([{ routineId: routine.id, occurrence }]);
    expect(done[0].id).toBe(doneId(routine.id, occurrence));

    // Daily care's one tap logs { type: 'med', data: { name, dose }, start: now } through buildEntries.
    const today = buildEntries(
      'both',
      { type: 'med', data: { name: 'Vitamin D', dose: '1 drop' }, start: now.toISOString(), end: null },
      'p2',
      () => 'g',
    );
    const logs = (await store.logs.list()).sort((a, b) => a.babyId.localeCompare(b.babyId));
    expect(logs.map((l) => ({ ...content(l), groupId: 'g' }))).toEqual(today);
    expect(new Set(logs.map((l) => l.groupId)).size).toBe(1);
    expect(logs[0].groupId).not.toBeNull();
  });

  it('is idempotent: pressing it twice (or on both phones) adds nothing', async () => {
    const { store, routine } = await setup();
    await applyReminderAction(store, 'done', action(routine), now, 'p1');
    await applyReminderAction(store, 'done', action(routine), new Date(now.getTime() + 60_000), 'p1');
    expect(await store.routineDone.listAll()).toHaveLength(1);
    expect(await store.logs.listAll()).toHaveLength(2);
  });

  it('adds nothing for what the app already logged: a "Coming up" mark, or a dose from Daily care', async () => {
    const { store, routine } = await setup();
    // In the app: Coming up → Done (random id) and Twin A's dose from Daily care, a few minutes after 09:00.
    await store.routineDone.create({ routineId: routine.id, occurrence });
    const given = new Date(Date.parse(occurrence) + 3 * 60_000).toISOString();
    await store.logs.create({
      type: 'med',
      babyId: 'baby-A',
      data: { name: 'vitamin d', dose: '' },
      start: given,
      end: null,
      groupId: null,
      loggedBy: 'p1',
    });

    await applyReminderAction(store, 'done', action(routine), now, 'p2');
    expect(await store.routineDone.listAll()).toHaveLength(1);
    // Only Twin B still needed it.
    expect((await store.logs.list()).map((l) => [l.babyId, l.loggedBy]).sort()).toEqual([
      ['baby-A', 'p1'],
      ['baby-B', 'p2'],
    ]);
  });

  it('logs the dose only for the twin the reminder was for (a twin in hospital left out)', async () => {
    const { store, routine } = await setup();
    await applyReminderAction(store, 'done', action(routine, { babies: 'B' }), now, 'p1');
    const logs = await store.logs.list();
    expect(logs.map((l) => [l.babyId, l.groupId])).toEqual([['baby-B', null]]);
  });

  it('logs the mother’s dose for a medicine "for the mother"', async () => {
    const { store, routine } = await setup({
      babies: 'none',
      title: 'Ibuprofen',
      med: { name: 'Ibuprofen', dose: '400 mg', minIntervalHours: 6 },
    });
    await applyReminderAction(store, 'done', action(routine), now, 'p1');
    await applyReminderAction(store, 'done', action(routine), now, 'p1');
    expect((await store.motherLogs.list()).map(content)).toEqual([
      { type: 'med', start: now.toISOString(), data: { name: 'Ibuprofen', dose: '400 mg' }, loggedBy: 'p1' },
    ]);
    expect(await store.logs.list()).toEqual([]);
  });

  it('only marks a routine that is not a medicine', async () => {
    const { store, routine } = await setup({ med: null, title: 'Bath' });
    await applyReminderAction(store, 'done', action(routine), now, 'p1');
    expect(await store.routineDone.list()).toHaveLength(1);
    expect(await store.logs.list()).toEqual([]);
  });

  it('brings back a done mark that was undone', async () => {
    const { store, routine } = await setup({ med: null });
    await applyReminderAction(store, 'done', action(routine), now, 'p1');
    await store.routineDone.remove(doneId(routine.id, occurrence));
    await applyReminderAction(store, 'done', action(routine), now, 'p1');
    expect(await store.routineDone.list()).toHaveLength(1);
  });
});

describe('Snooze on a push reminder', () => {
  it('writes one snooze per reminder, 15 minutes from now, moved on a second snooze', async () => {
    const { store, routine } = await setup();
    const data = action(routine);
    await applyReminderAction(store, 'snooze', data, now, 'p1');
    await applyReminderAction(store, 'snooze', data, new Date(now.getTime() + 16 * 60_000), 'p1');
    const snoozes = await store.reminderSnoozes.list();
    expect(snoozes.map(content)).toEqual([
      { reminderKey: data.key, until: new Date(now.getTime() + 16 * 60_000 + SNOOZE_MS).toISOString() },
    ]);
    expect(await store.routineDone.list()).toEqual([]);
  });

  it('travels to the other phone in a backup like any synced record', async () => {
    const { exportBackup, importBackup, parseBackup } = await import('@/data/backup');
    const { store, routine } = await setup();
    await applyReminderAction(store, 'snooze', action(routine), now, 'p1');
    const other = await openDexieStore({ name: `reminder-actions-other-${n}` });
    await importBackup(other, parseBackup(JSON.stringify(await exportBackup(store))));
    expect(await other.reminderSnoozes.list()).toEqual(await store.reminderSnoozes.list());
  });
});

describe('reminder data from a notification', () => {
  it('accepts only complete data', () => {
    expect(isReminderActionData({ routineId: 'r', occurrence, key: 'k', babies: 'A' })).toBe(true);
    expect(isReminderActionData({ routineId: 'r', occurrence: 'soon', key: 'k', babies: 'A' })).toBe(false);
    expect(isReminderActionData(undefined)).toBe(false);
  });
});
