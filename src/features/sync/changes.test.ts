import { createInstance } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en';
import mk from '@/i18n/locales/mk';
import type { AppliedChange } from '@/data/sync/types';
import type { Entity, LogEntry, ParentTask, PrepItem } from '@/data/types';
import { changeAction, changeLine, fromOtherPhone, summarizeChanges, type ChangeTextHelpers } from './changes';

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
    parentName: (p) => (p === 'p1' ? 'Darko' : 'Marija'),
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
