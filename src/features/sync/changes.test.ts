import { createInstance } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en';
import mk from '@/i18n/locales/mk';
import type { AppliedChange } from '@/data/sync/types';
import type { Contraction, Entity, LogEntry, MilkStashItem, ParentTask, PrepItem, Pump, Supply, Vaccine } from '@/data/types';
import { changeAction, changeLine, fromOtherPhone, summarizeChanges, withoutRoutineContractions, type ChangeTextHelpers } from './changes';

const i18n = createInstance();
let h: ChangeTextHelpers;

beforeAll(async () => {
  await i18n.init({ resources: { en: { translation: en }, mk: { translation: mk } }, lng: 'en', interpolation: { escapeValue: false } });
  h = {
    t: (key, options) => (i18n.t as unknown as (k: string, o?: object) => string)(key, options),
    entry: (e) =>
      e.type === 'feed' && e.data.method === 'bottle' ? { title: 'Bottle', detail: `${e.data.ml} ml` } : { title: e.type, detail: '' },
    twin: (id) => (id === 'baby-A' ? 'Ema' : 'Ana'),
    label: (r) => r.name,
    routineTitle: (id) => (id === 'r1' ? 'Vitamin D' : undefined),
    when: () => '14 Oct 10:30',
    day: () => '14 Oct',
    parentName: (p) => (p === 'p1' ? 'Darko' : p === 'p2' ? 'Marija' : 'Baba'),
    caregiverIds: ['p1', 'p2'],
  };
});

const meta = (over: Partial<Entity> = {}): Entity => ({
  id: 'x',
  createdAt: '2026-10-11T08:00:00.000Z',
  updatedAt: '2026-10-11T08:00:00.000Z',
  deletedAt: null,
  deviceId: 'other-phone',
  ...over,
});

const bottle = (babyId: string, over: Partial<LogEntry> = {}): LogEntry =>
  ({
    ...meta({ id: `log-${babyId}` }),
    type: 'feed',
    data: { method: 'bottle', ml: 120, milk: 'formula' },
    babyId,
    start: '2026-10-11T08:00:00.000Z',
    end: null,
    groupId: 'g',
    loggedBy: 'p2',
    ...over,
  }) as LogEntry;

const task = (over: Partial<ParentTask> = {}): ParentTask => ({
  ...meta({ id: 't1' }),
  title: 'Buy wipes',
  assignee: null,
  due: null,
  done: false,
  notes: '',
  ...over,
});

const bottleFor = (): LogEntry =>
  ({
    ...meta({ id: 'log-x' }),
    type: 'feed',
    babyId: 'baby-A',
    start: '2026-10-11T08:00:00.000Z',
    end: null,
    groupId: null,
    loggedBy: 'p2',
    data: { method: 'bottle', ml: 90, milk: 'formula' },
  }) as LogEntry;

describe('change notifications', () => {
  it('tells added, edited, deleted and undone records apart', () => {
    expect(changeAction({ collection: 'tasks', record: task(), previous: undefined })).toBe('added');
    expect(changeAction({ collection: 'tasks', record: task({ title: 'B' }), previous: task() })).toBe('changed');
    expect(changeAction({ collection: 'tasks', record: task({ deletedAt: 'x' }), previous: task() })).toBe('deleted');
    expect(changeAction({ collection: 'tasks', record: task(), previous: task({ deletedAt: 'x' }) })).toBe('added');
    // Deleting something this phone never showed is not news.
    expect(changeAction({ collection: 'tasks', record: task({ deletedAt: 'x' }), previous: undefined })).toBeNull();
  });

  it('ignores this phone’s own records and the starter list', () => {
    const changes: AppliedChange[] = [
      { collection: 'tasks', record: task(), previous: undefined },
      { collection: 'tasks', record: task({ deviceId: 'me' }), previous: undefined },
      { collection: 'tasks', record: task({ deviceId: 'seed' }), previous: undefined },
    ];
    expect(fromOtherPhone(changes, 'me')).toHaveLength(1);
  });

  it('does not announce log entries of a type from a newer version', () => {
    const future = { ...bottle('baby-A'), type: 'hiccups' } as unknown as LogEntry;
    expect(fromOtherPhone([{ collection: 'logs', record: future, previous: undefined }], 'me')).toEqual([]);
  });

  it('describes changes in words', () => {
    expect(changeLine({ collection: 'logs', record: bottle('baby-A'), previous: undefined }, h)).toBe('Bottle · Ema · 120 ml');
    expect(changeLine({ collection: 'tasks', record: task({ done: true }), previous: task() }, h)).toBe('Task done: Buy wipes');
    const item = { ...meta({ id: 'p' }), name: 'Pram', seedKey: null, kind: 'item', status: 'needed' } as unknown as PrepItem;
    expect(changeLine({ collection: 'prepItems', record: { ...item, status: 'bought' } as PrepItem, previous: item }, h)).toBe(
      'Pram: Bought',
    );
    expect(
      changeLine({ collection: 'routineDone', record: { ...meta(), routineId: 'r1', occurrence: 'x' } as Entity, previous: undefined }, h),
    ).toBe('Done: Vitamin D');
  });

  it('describes pumping, the milk stash and supplies', () => {
    const pump = { ...meta({ id: 'p' }), start: 's', minutes: 15, leftMl: 60, rightMl: 50, totalMl: 110, loggedBy: 'p2' } as Pump;
    expect(changeLine({ collection: 'pumps', record: pump, previous: undefined }, h)).toBe('Pumped 110 ml');
    const stash = { ...meta({ id: 's' }), pumpedAt: 's', ml: 110, location: 'freezer', usedAt: null, pumpId: 'p' } as MilkStashItem;
    expect(changeLine({ collection: 'milkStash', record: stash, previous: undefined }, h)).toBe('Milk stash: 110 ml in the freezer');
    expect(changeLine({ collection: 'milkStash', record: { ...stash, ml: 30 } as MilkStashItem, previous: stash }, h)).toBe(
      'Milk stash: 80 ml used, 30 ml left',
    );
    expect(changeLine({ collection: 'milkStash', record: { ...stash, usedAt: 'x' } as MilkStashItem, previous: stash }, h)).toBe(
      'Milk stash: 110 ml used',
    );
    const supply = { ...meta({ id: 'supply-diapers' }), source: 'diapers' } as Supply;
    expect(changeLine({ collection: 'supplies', record: supply, previous: undefined }, h)).toBe('Supplies updated: Diapers');
    // A pumping session names the parent who logged it.
    expect(summarizeChanges([{ collection: 'pumps', record: pump, previous: undefined }], 'p2', h)?.title).toBe('Update from Marija');
  });

  it('describes vaccinations, one line per twin like log entries', () => {
    const vac = (babyId: string) =>
      ({
        ...meta({ id: `v-${babyId}`, updatedBy: 'p2' }),
        babyId,
        name: 'Hexa',
        dose: 1,
        date: '2026-10-14',
        place: '',
        lot: '',
        notes: '',
        groupId: 'g',
      }) as Vaccine;
    const added = (v: Vaccine): AppliedChange => ({ collection: 'vaccines', record: v, previous: undefined });
    expect(changeLine(added(vac('baby-A')), h)).toBe('Vaccination: Hexa · Ema · 14 Oct');
    expect(summarizeChanges([added(vac('baby-A')), added(vac('baby-B'))], 'p1', h)?.body).toBe(
      ['Vaccination: Hexa · Ema · 14 Oct', 'Vaccination: Hexa · Ana · 14 Oct'].join('\n'),
    );
    const edited = { ...vac('baby-B'), notes: 'slept' };
    expect(changeLine({ collection: 'vaccines', record: edited, previous: vac('baby-B') }, h)).toBe('Vaccination edited: Hexa · Ana');
    const deleted = { ...vac('baby-B'), deletedAt: 'x' };
    expect(changeLine({ collection: 'vaccines', record: deleted, previous: vac('baby-B') }, h)).toBe('Vaccination deleted: Hexa · Ana');
  });

  it('announces only the first contraction after a pause of more than 2 hours', () => {
    const ct = (id: string, start: string, end: string | null = null) => ({ ...meta({ id, updatedBy: 'p2' }), start, end }) as Contraction;
    const first = ct('c1', '2026-10-11T08:00:00.000Z');
    const added = (c: Contraction): AppliedChange => ({ collection: 'contractions', record: c, previous: undefined });
    expect(changeLine(added(first), h)).toBe('Contraction started (14 Oct 10:30)');
    expect(changeLine(added(first), { ...h, announcing: true })).toBe('Started timing contractions (from 14 Oct 10:30)');
    expect(withoutRoutineContractions([added(first)], [first])).toHaveLength(1);

    // The next one ten minutes later, and the stop of the first: not news.
    const second = ct('c2', '2026-10-11T08:10:00.000Z');
    const stopped = ct('c1', '2026-10-11T08:00:00.000Z', '2026-10-11T08:01:05.000Z');
    const all = [stopped, second];
    const batch: AppliedChange[] = [
      added(second),
      { collection: 'contractions', record: stopped, previous: first },
      { collection: 'logs', record: bottleFor(), previous: undefined },
    ];
    expect(withoutRoutineContractions(batch, all).map((c) => c.collection)).toEqual(['logs']);
    expect(changeLine({ collection: 'contractions', record: stopped, previous: first }, h)).toBe('Contraction: 1:05');

    // After more than two hours, the next one is news again.
    const later = ct('c3', '2026-10-11T10:30:00.000Z');
    expect(withoutRoutineContractions([added(later)], [...all, later])).toHaveLength(1);
    // Two in one batch after a gap: only the first.
    const soon = ct('c4', '2026-10-11T10:35:00.000Z');
    expect(withoutRoutineContractions([added(soon), added(later)], [...all, later, soon]).map((c) => c.record.id)).toEqual(['c3']);
    expect(summarizeChanges([added(later)], 'p1', { ...h, announcing: true })?.toast).toBe(
      'Marija: Started timing contractions (from 14 Oct 10:30)',
    );
    // Undo after "Clear all" brings records back: not announced again.
    const restored: AppliedChange = {
      collection: 'contractions',
      record: later,
      previous: { ...later, deletedAt: '2026-10-11T10:40:00.000Z' },
    };
    expect(withoutRoutineContractions([restored], [later])).toEqual([]);
  });

  it('announces the pumping timer when it starts and stops, not as 0 ml', () => {
    const running = {
      ...meta({ id: 't' }),
      start: 's',
      end: null,
      side: 'both',
      minutes: null,
      leftMl: null,
      rightMl: null,
      totalMl: 0,
    } as Pump;
    expect(changeLine({ collection: 'pumps', record: running, previous: undefined }, h)).toBe('Started pumping');
    const stopped = { ...running, end: 'e', minutes: 14 } as Pump;
    expect(changeLine({ collection: 'pumps', record: stopped, previous: running }, h)).toBe('Finished pumping (14 min)');
    const amounts = { ...stopped, leftMl: 60, rightMl: 50, totalMl: 110 } as Pump;
    expect(changeLine({ collection: 'pumps', record: amounts, previous: stopped }, h)).toBe('Pumping edited: 110 ml');
    // Stop and amounts arriving in one sync.
    expect(changeLine({ collection: 'pumps', record: amounts, previous: running }, h)).toBe('Finished pumping: 110 ml in 14 min');
    // An older session without `end` reads as before.
    const old = { ...meta({ id: 'o' }), start: 's', minutes: 10, leftMl: null, rightMl: null, totalMl: 80 } as Pump;
    expect(changeLine({ collection: 'pumps', record: old, previous: undefined }, h)).toBe('Pumped 80 ml');
  });

  it('credits other changes to the other parent, or to "the other phone" when there are helpers', () => {
    const change = { collection: 'tasks' as const, record: task(), previous: undefined };
    expect(summarizeChanges([change], 'p1', h)?.title).toBe('Update from Marija');
    const withHelper = { ...h, caregiverIds: ['p1', 'p2', 'h1'] };
    expect(summarizeChanges([change], 'p1', withHelper)).toMatchObject({
      title: 'Update from the other phone',
      toast: 'Other phone: New task: Buy wipes',
    });
    // Log entries still name whoever logged them, helpers included.
    expect(
      summarizeChanges([{ collection: 'logs', record: bottle('baby-A', { loggedBy: 'h1' }), previous: undefined }], 'p1', withHelper)
        ?.title,
    ).toBe('Update from Baba');
  });

  it('summarises a "both twins" feed as one update from the parent who logged it', () => {
    const summary = summarizeChanges(
      [
        { collection: 'logs', record: bottle('baby-A'), previous: undefined },
        { collection: 'logs', record: bottle('baby-B'), previous: undefined },
      ],
      'p1',
      h,
    );
    expect(summary).toEqual({
      title: 'Update from Marija',
      body: 'Bottle · Ema · 120 ml\nBottle · Ana · 120 ml',
      toast: 'Marija: Bottle · Ema · 120 ml and 1 more change',
    });
  });

  it('credits other changes to the other parent and shortens long lists', () => {
    const changes: AppliedChange[] = ['A', 'B', 'C', 'D', 'E'].map((title, i) => ({
      collection: 'tasks',
      record: task({ id: title, title, updatedAt: `2026-10-11T08:0${i}:00.000Z` }),
      previous: undefined,
    }));
    const summary = summarizeChanges(changes, 'p2', h)!;
    expect(summary.title).toBe('Update from Darko');
    expect(summary.body).toBe('New task: E\nNew task: D\nNew task: C\nand 2 more changes');
  });

  it('works in Macedonian', async () => {
    await i18n.changeLanguage('mk');
    expect(changeLine({ collection: 'tasks', record: task(), previous: undefined }, h)).toBe('Нова задача: Buy wipes');
    expect(summarizeChanges([{ collection: 'tasks', record: task(), previous: undefined }], 'p1', h)?.title).toBe('Ново од Marija');
    await i18n.changeLanguage('en');
  });
});
