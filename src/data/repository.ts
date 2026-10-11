import type { MergeStats } from './merge';
import type {
  Appointment,
  Baby,
  Caregiver,
  Category,
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
} from './types';

/**
 * Storage-agnostic access to one collection. The UI only talks to these
 * interfaces, so IndexedDB can later be swapped for (or synced with) a
 * backend such as Supabase without touching screens.
 */
export interface Repository<T extends Entity> {
  get(id: string): Promise<T | undefined>;
  /** Live (not deleted) records. */
  list(): Promise<T[]>;
  /** All records including tombstones; used for export and sync. */
  listAll(): Promise<T[]>;
  create(data: NewRecord<T>): Promise<T>;
  createMany(data: NewRecord<T>[]): Promise<T[]>;
  update(id: string, patch: RecordPatch<T>): Promise<T>;
  /** Soft delete: the record becomes a tombstone and can be restored (undo). */
  remove(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  /** Merge records from another device (last writer wins). */
  merge(incoming: T[]): Promise<MergeStats>;
}

/** Log entries need time-range queries that a generic repository does not offer. */
export interface LogRepository extends Repository<LogEntry> {
  /** Live entries whose start is in [from, to), oldest first. */
  listBetween(from: ISODateTime, to: ISODateTime): Promise<LogEntry[]>;
  /** The newest live entry of a type for one baby, if any. */
  latest(babyId: string, type: LogType): Promise<LogEntry | undefined>;
  /** Up to `limit` newest live entries of a type for one baby, newest first. */
  recent(babyId: string, type: LogType, limit: number): Promise<LogEntry[]>;
  /** Live timed entries (sleep, breastfeeding) still running, started after `since`. */
  listRunning(since: ISODateTime): Promise<LogEntry[]>;
}

export interface SettingsRepository {
  get(): Promise<SharedSettings>;
  update(patch: Partial<Omit<SharedSettings, keyof Entity>>): Promise<SharedSettings>;
  /** The raw record (if one was ever saved), for export. */
  listAll(): Promise<SharedSettings[]>;
  merge(incoming: SharedSettings[]): Promise<MergeStats>;
}

export interface DevicePrefsRepository {
  get(): Promise<DevicePrefs>;
  update(patch: Partial<Omit<DevicePrefs, 'id' | 'deviceId'>>): Promise<DevicePrefs>;
}

/** A minimal observable, compatible with Dexie's liveQuery and most stream libraries. */
export interface Subscribable<T> {
  subscribe(observer: { next: (value: T) => void; error?: (err: unknown) => void }): { unsubscribe(): void };
}

export interface SyncedCollections {
  settings: SettingsRepository;
  categories: Repository<Category>;
  prepItems: Repository<PrepItem>;
  babies: Repository<Baby>;
  logs: LogRepository;
  appointments: Repository<Appointment>;
  routines: Repository<Routine>;
  routineDone: Repository<RoutineDone>;
  tasks: Repository<ParentTask>;
  doctorNotes: Repository<DoctorNote>;
  pumps: Repository<Pump>;
  milkStash: Repository<MilkStashItem>;
  supplies: Repository<Supply>;
  caregivers: Repository<Caregiver>;
  milestones: Repository<Milestone>;
}

export type CollectionName = keyof SyncedCollections;

export const COLLECTIONS: readonly CollectionName[] = [
  'settings',
  'categories',
  'prepItems',
  'babies',
  'logs',
  'appointments',
  'routines',
  'routineDone',
  'tasks',
  'doctorNotes',
  'pumps',
  'milkStash',
  'supplies',
  'caregivers',
  'milestones',
];

export interface DataStore extends SyncedCollections {
  device: DevicePrefsRepository;
  /**
   * Re-runs `query` whenever data it read changes and emits the result.
   * Queries should only read through this store's repositories.
   */
  live<R>(query: () => Promise<R>): Subscribable<R>;
  /** Runs several writes atomically. */
  transaction<R>(fn: () => Promise<R>): Promise<R>;
}
