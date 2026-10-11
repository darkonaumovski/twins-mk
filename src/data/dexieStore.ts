import Dexie, { liveQuery, type Table } from 'dexie';
import { planMerge, type MergeStats } from './merge';
import type { DataStore, DevicePrefsRepository, Repository, SettingsRepository } from './repository';
import type {
  Appointment,
  Baby,
  Category,
  DevicePrefs,
  DoctorNote,
  Entity,
  LogEntry,
  NewRecord,
  ParentTask,
  PrepItem,
  RecordPatch,
  Routine,
  RoutineDone,
  SharedSettings,
} from './types';
import { DEFAULT_DEVICE_PREFS, DEFAULT_SETTINGS } from './defaults';
import { newId } from '@/lib/ids';

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
  }
}

interface Context {
  deviceId: string;
  now: () => Date;
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
  ) {}

  async get(id: string) {
    const record = await this.table.get(id);
    return record && record.deletedAt === null ? record : undefined;
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
    } as unknown as T;
  }

  async create(data: NewRecord<T>) {
    const record = this.stamp(data);
    await this.table.add(record);
    return record;
  }

  async createMany(data: NewRecord<T>[]) {
    const records = data.map((d) => this.stamp(d));
    await this.table.bulkAdd(records);
    return records;
  }

  private async write(id: string, change: (existing: T) => Partial<T>): Promise<T> {
    return this.table.db.transaction('rw', this.table, async () => {
      const existing = await this.table.get(id);
      if (!existing) throw new Error(`Record ${id} not found`);
      const next = {
        ...existing,
        ...change(existing),
        id,
        updatedAt: nextTimestamp(this.ctx, existing.updatedAt),
        deviceId: this.ctx.deviceId,
      } as T;
      await this.table.put(next);
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

  async merge(incoming: T[]): Promise<MergeStats> {
    return this.table.db.transaction('rw', this.table, async () => {
      const ids = incoming.map((r) => r.id);
      const local = (await this.table.bulkGet(ids)).filter((r): r is T => r !== undefined);
      const { toWrite, stats } = planMerge(local, incoming);
      await this.table.bulkPut(toWrite);
      return stats;
    });
  }
}

class DexieSettingsRepository implements SettingsRepository {
  private readonly repo: DexieRepository<SharedSettings>;

  constructor(
    private readonly table: Table<SharedSettings, string>,
    private readonly ctx: Context,
  ) {
    this.repo = new DexieRepository(table, ctx);
  }

  async get(): Promise<SharedSettings> {
    const stored = await this.table.get('shared');
    return stored ?? { ...DEFAULT_SETTINGS, createdAt: '', updatedAt: '', deletedAt: null, deviceId: this.ctx.deviceId };
  }

  async update(patch: Partial<Omit<SharedSettings, keyof Entity>>) {
    return this.table.db.transaction('rw', this.table, async () => {
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
  constructor(private readonly table: Table<DevicePrefs, string>) {}

  async get(): Promise<DevicePrefs> {
    const prefs = await this.table.get('device');
    if (!prefs) throw new Error('Device preferences missing; was the store opened with openDexieStore()?');
    return prefs;
  }

  async update(patch: Partial<Omit<DevicePrefs, 'id' | 'deviceId'>>) {
    return this.table.db.transaction('rw', this.table, async () => {
      const next = { ...(await this.get()), ...patch };
      await this.table.put(next);
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

export async function openDexieStore(options: OpenOptions = {}): Promise<DataStore & { db: TwinsDb }> {
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

  const ctx: Context = { deviceId: prefs.deviceId, now: options.now ?? (() => new Date()) };
  const repo = <T extends Entity>(table: Table<T, string>) => new DexieRepository(table, ctx);

  return {
    db,
    settings: new DexieSettingsRepository(db.settings, ctx),
    device: new DexieDevicePrefsRepository(db.device),
    categories: repo(db.categories),
    prepItems: repo(db.prepItems),
    babies: repo(db.babies),
    logs: repo(db.logs),
    appointments: repo(db.appointments),
    routines: repo(db.routines),
    routineDone: repo(db.routineDone),
    tasks: repo(db.tasks),
    doctorNotes: repo(db.doctorNotes),
    live: (query) => liveQuery(query),
    transaction: (fn) => db.transaction('rw', db.tables, fn),
  };
}
