import Dexie, { liveQuery, type Table } from 'dexie';
import { planMerge, type MergeStats } from './merge';
import { isKnownLog, isTimed } from './logTypes';
import {
  COLLECTIONS,
  type ActivityRepository,
  type CollectionName,
  type DataStore,
  type DevicePrefsRepository,
  type LogRepository,
  type PhotoBlobRepository,
  type Repository,
  type SettingsRepository,
} from './repository';
import type { AppliedChange, OutboxEntry, PhotoUpload, SyncLocal } from './sync/types';
import type {
  ActivityEntry,
  Appointment,
  CaregiverId,
  Baby,
  Caregiver,
  Category,
  Contraction,
  DevicePrefs,
  DoctorNote,
  Entity,
  ISODateTime,
  LogEntry,
  LogType,
  Milestone,
  MilkStashItem,
  NewRecord,
  ParentTask,
  PrepItem,
  Pump,
  RecordPatch,
  Routine,
  RoutineDone,
  SharedSettings,
  Supply,
  Vaccine,
  MotherLog,
  ReminderSnooze,
  Photo,
  PhotoBlob,
  PhotoMime,
} from './types';
import { DEFAULT_DEVICE_PREFS, DEFAULT_SETTINGS } from './defaults';
import { newId } from '@/lib/ids';

type OutboxTable = Table<OutboxEntry, [string, string]>;
type ActivityTable = Table<ActivityEntry, number>;

class TwinsDb extends Dexie {
  settings!: Table<SharedSettings, string>;
  device!: Table<DevicePrefs, string>;
  categories!: Table<Category, string>;
  prepItems!: Table<PrepItem, string>;
  babies!: Table<Baby, string>;
  logs!: Table<LogEntry, string>;
  appointments!: Table<Appointment, string>;
  routines!: Table<Routine, string>;
  routineDone!: Table<RoutineDone, string>;
  tasks!: Table<ParentTask, string>;
  doctorNotes!: Table<DoctorNote, string>;
  pumps!: Table<Pump, string>;
  milkStash!: Table<MilkStashItem, string>;
  supplies!: Table<Supply, string>;
  caregivers!: Table<Caregiver, string>;
  milestones!: Table<Milestone, string>;
  contractions!: Table<Contraction, string>;
  vaccines!: Table<Vaccine, string>;
  motherLogs!: Table<MotherLog, string>;
  reminderSnoozes!: Table<ReminderSnooze, string>;
  photos!: Table<Photo, string>;
  /** The photos' images, on this phone only. */
  photoBlobs!: Table<PhotoBlob, string>;
  /** Deleted photos whose Storage objects this phone removed, with the deletion it handled. */
  photoPurged!: Table<{ id: string; deletedAt: string }, string>;
  /** Records changed on this phone that the sync server has not confirmed yet. */
  outbox!: OutboxTable;
  /** Sync bookkeeping, such as the last server change this phone has seen. */
  syncMeta!: Table<{ key: string; value: number }, string>;
  /** This phone's notification history: own changes and changes sync brought in. Never synced. */
  activity!: ActivityTable;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      settings: 'id',
      device: 'id',
      categories: 'id, order',
      prepItems: 'id, categoryId, order',
      babies: 'id, slot',
      logs: 'id, babyId, type, start, groupId, [babyId+start]',
      appointments: 'id, start',
      routines: 'id',
      routineDone: 'id, routineId, occurrence',
      tasks: 'id, due',
      doctorNotes: 'id, createdAt',
    });
    this.version(2).stores({
      outbox: '[collection+id]',
      syncMeta: 'key',
    });
    // Pumping, milk stash and supplies. New, empty tables: nothing to convert.
    this.version(3)
      .stores({
        pumps: 'id, start',
        milkStash: 'id, pumpedAt',
        supplies: 'id',
      })
      .upgrade(() => {});
    // Helpers (grandparents, nannies). The parents stay p1/p2, so existing entries need no change.
    this.version(4)
      .stores({ caregivers: 'id, order' })
      .upgrade(() => {});
    // Milestones per twin. A new, empty table.
    this.version(5)
      .stores({ milestones: 'id, babyId' })
      .upgrade(() => {});
    // Notification history (local only). A new, empty table.
    this.version(6)
      .stores({ activity: '++key, at, seen' })
      .upgrade(() => {});
    // Contraction timer (before the birth). A new, empty table.
    this.version(7)
      .stores({ contractions: 'id, start' })
      .upgrade(() => {});
    // Vaccination record. A new, empty table.
    this.version(8)
      .stores({ vaccines: 'id, babyId, date' })
      .upgrade(() => {});
    // The mother's medicines, check-ins and notes. A new, empty table.
    this.version(9)
      .stores({ motherLogs: 'id, start, type' })
      .upgrade(() => {});
    // "Snooze 15 min" on push reminders. A new, empty table.
    this.version(10)
      .stores({ reminderSnoozes: 'id, until' })
      .upgrade(() => {});
    // Photos: synced details, plus the images and purge marks on this phone only. New, empty tables.
    this.version(11)
      .stores({ photos: 'id, takenAt', photoBlobs: 'id', photoPurged: 'id' })
      .upgrade(() => {});
  }
}

interface Context {
  deviceId: string;
  /** Who uses this phone now; stamped on every change as `updatedBy`. */
  caregiver: CaregiverId;
  now: () => Date;
  activity: ActivityTable;
}

/** A timestamp that is strictly later than `previous`, so edits always win a merge against older versions. */
function nextTimestamp(ctx: Context, previous?: string): string {
  const now = ctx.now().toISOString();
  if (!previous || now > previous) return now;
  return new Date(new Date(previous).getTime() + 1).toISOString();
}

class DexieRepository<T extends Entity> implements Repository<T> {
  constructor(
    private readonly table: Table<T, string>,
    private readonly ctx: Context,
    private readonly outbox: OutboxTable,
  ) {}

  /** Runs `fn` in one transaction over this table, the outbox and the history. */
  private tx<R>(fn: () => Promise<R>) {
    return this.table.db.transaction('rw', this.table, this.outbox, this.ctx.activity, fn);
  }

  /** Adds this phone's own changes to the notification history; call inside `tx`. */
  private remember(changes: readonly { record: T; previous?: T }[]) {
    const collection = this.table.name;
    const entries: ActivityEntry[] = changes
      // Creating the shared settings record the first time is not a change anyone made.
      .filter((c) => !(collection === 'settings' && !c.previous))
      .map(({ record, previous }) => ({
        at: record.updatedAt,
        collection,
        recordId: record.id,
        by: this.ctx.caregiver,
        mine: true,
        seen: 1,
        record,
        previous,
      }));
    return this.ctx.activity.bulkAdd(entries);
  }

  /** Marks records for upload to the sync server; call inside `tx`. */
  private enqueue(records: readonly T[]) {
    const collection = this.table.name as CollectionName;
    return this.outbox.bulkPut(records.map((r) => ({ collection, id: r.id, updatedAt: r.updatedAt })));
  }

  async get(id: string) {
    const record = await this.table.get(id);
    return record && record.deletedAt === null ? record : undefined;
  }

  getAny(id: string) {
    return this.table.get(id);
  }

  list() {
    return this.table.filter((r) => r.deletedAt === null).toArray();
  }

  listAll() {
    return this.table.toArray();
  }

  private stamp(data: NewRecord<T>): T {
    const ts = this.ctx.now().toISOString();
    return {
      ...data,
      id: data.id ?? newId(),
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      deviceId: this.ctx.deviceId,
      updatedBy: this.ctx.caregiver,
    } as unknown as T;
  }

  async create(data: NewRecord<T>) {
    const [record] = await this.createMany([data]);
    return record;
  }

  async createMany(data: NewRecord<T>[]) {
    const records = data.map((d) => this.stamp(d));
    await this.tx(async () => {
      await this.table.bulkAdd(records);
      await this.enqueue(records);
      await this.remember(records.map((record) => ({ record })));
    });
    return records;
  }

  private async write(id: string, change: (existing: T) => Partial<T>): Promise<T> {
    return this.tx(async () => {
      const existing = await this.table.get(id);
      if (!existing) throw new Error(`Record ${id} not found`);
      const next = {
        ...existing,
        ...change(existing),
        id,
        updatedAt: nextTimestamp(this.ctx, existing.updatedAt),
        deviceId: this.ctx.deviceId,
        updatedBy: this.ctx.caregiver,
      } as T;
      await this.table.put(next);
      await this.enqueue([next]);
      await this.remember([{ record: next, previous: existing }]);
      return next;
    });
  }

  update(id: string, patch: RecordPatch<T>) {
    return this.write(id, () => patch as Partial<T>);
  }

  async remove(id: string) {
    await this.write(id, () => ({ deletedAt: this.ctx.now().toISOString() }) as Partial<T>);
  }

  async restore(id: string) {
    await this.write(id, () => ({ deletedAt: null }) as Partial<T>);
  }

  /** Merges records from a backup or the starter list; what changes is uploaded like a local edit. */
  async merge(incoming: T[]): Promise<MergeStats> {
    return (await this.mergeRecords(incoming, true)).stats;
  }

  /** Merges records downloaded from the sync server (no upload). Returns what changed, with the version it replaced. */
  async applyRemote(incoming: T[]): Promise<{ record: T; previous: T | undefined }[]> {
    const { toWrite, local } = await this.mergeRecords(incoming, false);
    const before = new Map(local.map((r) => [r.id, r]));
    return toWrite.map((record) => ({ record, previous: before.get(record.id) }));
  }

  private async mergeRecords(incoming: T[], upload: boolean) {
    return this.tx(async () => {
      const ids = incoming.map((r) => r.id);
      const local = (await this.table.bulkGet(ids)).filter((r): r is T => r !== undefined);
      const { toWrite, stats } = planMerge(local, incoming);
      await this.table.bulkPut(toWrite);
      if (upload) await this.enqueue(toWrite);
      return { toWrite, stats, local };
    });
  }
}

class DexieLogRepository extends DexieRepository<LogEntry> implements LogRepository {
  constructor(
    private readonly logs: Table<LogEntry, string>,
    ctx: Context,
    outbox: OutboxTable,
  ) {
    super(logs, ctx, outbox);
  }

  async listBetween(from: ISODateTime, to: ISODateTime) {
    const entries = await this.logs
      .where('start')
      .between(from, to, true, false)
      .filter((e) => e.deletedAt === null && isKnownLog(e))
      .toArray();
    // Same-minute entries (e.g. a "both" action) come back in id order; make it stable by twin.
    return entries.sort((a, b) => a.start.localeCompare(b.start) || a.babyId.localeCompare(b.babyId));
  }

  latest(babyId: string, type: LogType) {
    return this.logs
      .where('[babyId+start]')
      .between([babyId, Dexie.minKey], [babyId, Dexie.maxKey])
      .reverse()
      .filter((e) => e.deletedAt === null && e.type === type && isKnownLog(e))
      .first();
  }

  recent(babyId: string, type: LogType, limit: number) {
    return this.logs
      .where('[babyId+start]')
      .between([babyId, Dexie.minKey], [babyId, Dexie.maxKey])
      .reverse()
      .filter((e) => e.deletedAt === null && e.type === type && isKnownLog(e))
      .limit(limit)
      .toArray();
  }

  listRunning(since: ISODateTime) {
    return this.logs
      .where('start')
      .aboveOrEqual(since)
      .filter((e) => e.deletedAt === null && e.end === null && isKnownLog(e) && isTimed(e))
      .toArray();
  }
}

class DexieSettingsRepository implements SettingsRepository {
  readonly repo: DexieRepository<SharedSettings>;

  constructor(
    private readonly table: Table<SharedSettings, string>,
    private readonly ctx: Context,
    private readonly outbox: OutboxTable,
  ) {
    this.repo = new DexieRepository(table, ctx, outbox);
  }

  async get(): Promise<SharedSettings> {
    const stored = await this.table.get('shared');
    // Defaults first, so fields added in later versions have a value on records saved by older ones.
    if (stored) return { ...DEFAULT_SETTINGS, ...stored };
    return { ...DEFAULT_SETTINGS, createdAt: '', updatedAt: '', deletedAt: null, deviceId: this.ctx.deviceId };
  }

  async update(patch: Partial<Omit<SharedSettings, keyof Entity>>) {
    return this.table.db.transaction('rw', this.table, this.outbox, this.ctx.activity, async () => {
      if (!(await this.table.get('shared'))) {
        const { id: _id, ...defaults } = DEFAULT_SETTINGS;
        await this.repo.create({ ...defaults, id: 'shared' } as NewRecord<SharedSettings>);
      }
      return this.repo.update('shared', patch);
    });
  }

  listAll() {
    return this.table.toArray();
  }

  merge(incoming: SharedSettings[]) {
    return this.repo.merge(incoming.filter((s) => s.id === 'shared'));
  }
}

class DexieDevicePrefsRepository implements DevicePrefsRepository {
  constructor(
    private readonly table: Table<DevicePrefs, string>,
    private readonly ctx: Context,
  ) {}

  async get(): Promise<DevicePrefs> {
    const prefs = await this.table.get('device');
    if (!prefs) throw new Error('Device preferences missing; was the store opened with openDexieStore()?');
    return prefs;
  }

  async update(patch: Partial<Omit<DevicePrefs, 'id' | 'deviceId'>>) {
    return this.table.db.transaction('rw', this.table, async () => {
      const next = { ...(await this.get()), ...patch };
      await this.table.put(next);
      this.ctx.caregiver = next.parent;
      return next;
    });
  }
}

export interface OpenOptions {
  /** IndexedDB database name; tests use a unique one per test. */
  name?: string;
  now?: () => Date;
  /** Initial language for a brand-new install. */
  initialLanguage?: DevicePrefs['language'];
}

export type DexieStore = DataStore & { db: TwinsDb; sync: SyncLocal };

export async function openDexieStore(options: OpenOptions = {}): Promise<DexieStore> {
  const db = new TwinsDb(options.name ?? 'twins-mk');
  await db.open();

  let prefs = await db.device.get('device');
  if (!prefs) {
    prefs = {
      ...DEFAULT_DEVICE_PREFS,
      deviceId: newId(),
      language: options.initialLanguage ?? DEFAULT_DEVICE_PREFS.language,
    };
    await db.device.put(prefs);
  }

  const ctx: Context = {
    deviceId: prefs.deviceId,
    caregiver: prefs.parent,
    now: options.now ?? (() => new Date()),
    activity: db.activity,
  };
  const repo = <T extends Entity>(table: Table<T, string>) => new DexieRepository(table, ctx, db.outbox);
  const settings = new DexieSettingsRepository(db.settings, ctx, db.outbox);
  const logs = new DexieLogRepository(db.logs, ctx, db.outbox);
  const collections = {
    settings,
    categories: repo(db.categories),
    prepItems: repo(db.prepItems),
    babies: repo(db.babies),
    logs,
    appointments: repo(db.appointments),
    routines: repo(db.routines),
    routineDone: repo(db.routineDone),
    tasks: repo(db.tasks),
    doctorNotes: repo(db.doctorNotes),
    pumps: repo(db.pumps),
    milkStash: repo(db.milkStash),
    supplies: repo(db.supplies),
    caregivers: repo(db.caregivers),
    milestones: repo(db.milestones),
    contractions: repo(db.contractions),
    vaccines: repo(db.vaccines),
    motherLogs: repo(db.motherLogs),
    reminderSnoozes: repo(db.reminderSnoozes),
    photos: repo(db.photos),
  };
  const raw = { ...collections, settings: settings.repo } as unknown as Record<CollectionName, DexieRepository<Entity>>;

  return {
    db,
    ...collections,
    device: new DexieDevicePrefsRepository(db.device, ctx),
    activity: createActivity(db.activity),
    photoBlobs: createPhotoBlobs(db.photoBlobs),
    live: (query) => liveQuery(query),
    transaction: (fn) => db.transaction('rw', db.tables, fn),
    sync: createSyncLocal(db, raw),
  };
}

function createPhotoBlobs(table: Table<PhotoBlob, string>): PhotoBlobRepository {
  return {
    get: (id) => table.get(id),
    put(blob) {
      // In one transaction, so a thumbnail and a full image arriving together never overwrite each other.
      return table.db.transaction('rw', table, async () => {
        const existing = await table.get(blob.id);
        await table.put({ id: blob.id, full: blob.full ?? existing?.full ?? null, thumb: blob.thumb ?? existing?.thumb ?? null });
      });
    },
    remove: (id) => table.delete(id),
    async usage(only) {
      let count = 0;
      let bytes = 0;
      await table.each((b) => {
        if (only && !only.has(b.id)) return;
        count++;
        bytes += (b.full?.size ?? 0) + (b.thumb?.size ?? 0);
      });
      return { count, bytes };
    },
  };
}

function createActivity(table: ActivityTable): ActivityRepository {
  return {
    list: (limit) => table.orderBy('at').reverse().limit(limit).toArray(),

    async add(entries) {
      await table.bulkAdd(entries);
    },

    unseenCount: () => table.where('seen').equals(0).count(),

    async markAllSeen() {
      await table.where('seen').equals(0).modify({ seen: 1 });
    },

    async prune(before, keep) {
      await table.db.transaction('rw', table, async () => {
        await table.where('at').below(before).delete();
        const extra = await table.orderBy('at').reverse().offset(keep).primaryKeys();
        await table.bulkDelete(extra);
      });
    },

    clear: () => table.clear(),
  };
}

const CURSOR_KEY = 'cursor';
const outboxKey = (e: OutboxEntry): [string, string] => [e.collection, e.id];

/** The sync engine's view of this phone's storage: what to upload, and where downloads go. */
function createSyncLocal(db: TwinsDb, repos: Record<CollectionName, DexieRepository<Entity>>): SyncLocal {
  const table = (name: CollectionName) => db.table<Entity, string>(name);
  return {
    pending: () => db.outbox.toArray(),

    async read(entries) {
      const out: { collection: CollectionName; record: Entity }[] = [];
      for (const name of COLLECTIONS) {
        const ids = entries.filter((e) => e.collection === name).map((e) => e.id);
        if (!ids.length) continue;
        for (const record of await table(name).bulkGet(ids)) if (record) out.push({ collection: name, record });
      }
      return out;
    },

    async acknowledge(entries) {
      await db.transaction('rw', db.outbox, async () => {
        const current = await db.outbox.bulkGet(entries.map(outboxKey));
        // Keep entries that changed again while the upload was in flight.
        const done = entries.filter((e, i) => current[i]?.updatedAt === e.updatedAt);
        await db.outbox.bulkDelete(done.map(outboxKey));
      });
    },

    async applyRemote(collection, records): Promise<AppliedChange[]> {
      const applied = await repos[collection].applyRemote(records);
      return applied.map((a) => ({ collection, ...a }));
    },

    async enqueueAll() {
      await db.transaction('rw', [db.outbox, ...COLLECTIONS.map(table)], async () => {
        for (const name of COLLECTIONS) {
          const records = await table(name).toArray();
          await db.outbox.bulkPut(records.map((r) => ({ collection: name, id: r.id, updatedAt: r.updatedAt })));
        }
      });
    },

    async getCursor() {
      return (await db.syncMeta.get(CURSOR_KEY))?.value ?? 0;
    },

    async setCursor(value) {
      await db.syncMeta.put({ key: CURSOR_KEY, value });
    },

    async reset() {
      await db.transaction('rw', db.outbox, db.syncMeta, db.photos, db.photoBlobs, db.photoPurged, async () => {
        await db.outbox.clear();
        await db.syncMeta.clear();
        // A new (or rejoined) family has none of this phone's images yet: upload them again, and forget
        // which deleted photos were removed from the old family's Storage.
        await db.photoPurged.clear();
        const withImages = new Set((await db.photoBlobs.toArray()).filter((b) => b.full).map((b) => b.id));
        await db.photos.filter((p) => p.deletedAt === null && p.uploaded && withImages.has(p.id)).modify({ uploaded: false });
      });
    },

    watchPending(onChange) {
      const sub = liveQuery(() => db.outbox.count()).subscribe({ next: onChange, error: () => {} });
      return () => sub.unsubscribe();
    },

    photos: {
      async toUpload() {
        const waiting = (await db.photos.toArray()).filter((p) => p.deletedAt === null && !p.uploaded);
        const out: PhotoUpload[] = [];
        for (const p of waiting) {
          const blob = await db.photoBlobs.get(p.id);
          // Only a phone with the full image uploads (one with just a cached thumbnail must not mark it uploaded).
          if (blob?.full) out.push({ id: p.id, mime: p.mime ?? 'image/webp', full: blob.full, thumb: blob.thumb });
        }
        return out;
      },
      async markUploaded(id) {
        const photo = await db.photos.get(id);
        if (photo && !photo.uploaded) await repos.photos.update(id, { uploaded: true } as Partial<Entity>);
      },
      async toPurge() {
        const deleted = (await db.photos.toArray()).filter((p) => p.deletedAt !== null);
        const out: { id: string; mime: PhotoMime }[] = [];
        for (const p of deleted) {
          const purged = await db.photoPurged.get(p.id);
          // A photo deleted again after an undo is purged again.
          if (!purged || purged.deletedAt !== p.deletedAt) out.push({ id: p.id, mime: p.mime ?? 'image/webp' });
        }
        return out;
      },
      async markPurged(id) {
        const photo = await db.photos.get(id);
        if (photo?.deletedAt) await db.photoPurged.put({ id, deletedAt: photo.deletedAt });
      },
    },
  };
}
