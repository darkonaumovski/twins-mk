import type { MergeStats } from './merge';
import type {
  ActivityEntry,
  Appointment,
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
  JournalEntry,
  Food,
  FoodTry,
} from './types';

/**
 * Storage-agnostic access to one collection. The UI only talks to these
 * interfaces, so IndexedDB can later be swapped for (or synced with) a
 * backend such as Supabase without touching screens.
 */
export interface Repository<T extends Entity> {
  get(id: string): Promise<T | undefined>;
  /** One record by id, also when it is deleted (a tombstone); for "create or bring back" with fixed ids. */
  getAny(id: string): Promise<T | undefined>;
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
  contractions: Repository<Contraction>;
  vaccines: Repository<Vaccine>;
  motherLogs: Repository<MotherLog>;
  reminderSnoozes: Repository<ReminderSnooze>;
  photos: Repository<Photo>;
  journal: Repository<JournalEntry>;
  foods: Repository<Food>;
  foodTries: Repository<FoodTry>;
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
  'contractions',
  'vaccines',
  'motherLogs',
  'reminderSnoozes',
  'photos',
  'journal',
  'foods',
  'foodTries',
];

/** The photos' images on this phone (local only: never synced, exported or merged). */
export interface PhotoBlobRepository {
  get(id: string): Promise<PhotoBlob | undefined>;
  /** Saves the images; a missing part keeps what is already stored (e.g. a downloaded full image next to the thumbnail). */
  put(blob: PhotoBlob): Promise<void>;
  remove(id: string): Promise<void>;
  /** How many photos have images on this phone, and their size in bytes (only these photos, when given). */
  usage(only?: ReadonlySet<string>): Promise<{ count: number; bytes: number }>;
}

/** This phone's notification history (local only). */
export interface ActivityRepository {
  /** Newest first, up to `limit` entries. */
  list(limit: number): Promise<ActivityEntry[]>;
  /** Saves changes that sync brought in from another phone. */
  add(entries: ActivityEntry[]): Promise<void>;
  /** Changes from other phones not seen yet. */
  unseenCount(): Promise<number>;
  markAllSeen(): Promise<void>;
  /** Drops entries older than `before` and all but the newest `keep`. */
  prune(before: ISODateTime, keep: number): Promise<void>;
  clear(): Promise<void>;
}

export interface DataStore extends SyncedCollections {
  device: DevicePrefsRepository;
  photoBlobs: PhotoBlobRepository;
  activity: ActivityRepository;
  /**
   * Re-runs `query` whenever data it read changes and emits the result.
   * Queries should only read through this store's repositories.
   */
  live<R>(query: () => Promise<R>): Subscribable<R>;
  /** Runs several writes atomically. */
  transaction<R>(fn: () => Promise<R>): Promise<R>;
}
