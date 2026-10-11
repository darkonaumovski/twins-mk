/** Calendar date, `YYYY-MM-DD`, in the user's local time zone. */
export type ISODate = string;
/** Full timestamp, `new Date().toISOString()`. */
export type ISODateTime = string;

/**
 * Metadata every synced record carries. It is what makes merging two phones'
 * data (and a future sync backend) possible: newest `updatedAt` wins, and
 * deletes are tombstones (`deletedAt`) so they propagate instead of vanishing.
 */
export interface Entity {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
  /** Device that last wrote the record. Used as a merge tie-breaker. */
  deviceId: string;
}

/** Fields a caller supplies when creating a record; metadata is filled in by the repository. */
export type NewRecord<T extends Entity> = Omit<T, keyof Entity> & { id?: string };
export type RecordPatch<T extends Entity> = Partial<Omit<T, keyof Entity>>;

export type Language = 'mk' | 'en';
export type ThemePref = 'system' | 'light' | 'dark';
export type ParentId = 'p1' | 'p2';
export type Phase = 'prep' | 'planner';

/** Settings shared by both parents; exported and merged like any other record. */
export interface SharedSettings extends Entity {
  id: 'shared';
  currency: string;
  dueDate: ISODate | null;
  /** Planned delivery date (e.g. a planned caesarean or induction), if one has been set. Filled from the defaults on older records. */
  expectedDelivery: ISODate | null;
  parent1Name: string;
  parent2Name: string;
  phase: Phase;
  /**
   * When one twin starts a feed and the other's next feed (from its feed interval)
   * is due within this many minutes, offer to feed the other twin too.
   */
  feedNudgeMin: number;
}

/** Preferences for this phone only. Never exported or merged. */
export interface DevicePrefs {
  id: 'device';
  deviceId: string;
  language: Language;
  theme: ThemePref;
  /** Which parent normally uses this phone; stamped on new log entries. */
  parent: ParentId;
  notifications: boolean;
  /** Version of the starter checklist already added on this device (absent on older installs). */
  seedVersion?: number;
  /** Tell this phone about the other parent's synced changes (absent means on). */
  changeAlerts?: boolean;
  /** The family this phone syncs with, if sync is on. */
  sync?: SyncMembership | null;
}

/** Which family a phone syncs with. */
export interface SyncMembership {
  familyId: string;
  /** Join code, kept so the other phone can be added later and to rejoin after a lost sign-in. */
  code: string;
}

// ---------- Preparation checklist ----------

export type PrepStatus = 'needed' | 'ordered' | 'bought' | 'gifted' | 'borrowed';
export type Priority = 'must' | 'nice';
/** `perBaby` quantities are per twin, so the total needed is doubled. */
export type Scope = 'perBaby' | 'shared';
export type NeededBy = { kind: 'week'; week: number } | { kind: 'date'; date: ISODate } | null;

/**
 * Seeded records keep a `seedKey` so their text follows the UI language.
 * Once the user edits the name, `seedKey` is cleared and `name` is used.
 */
export interface Category extends Entity {
  name: string;
  seedKey: string | null;
  order: number;
}

export interface PrepItem extends Entity {
  kind: 'item' | 'task';
  name: string;
  seedKey: string | null;
  categoryId: string;
  scope: Scope;
  quantity: number;
  acquired: number;
  priority: Priority;
  status: PrepStatus;
  /** Estimated price of one unit. */
  estimatedUnitPrice: number | null;
  /** Total actually paid for this line. */
  actualPrice: number | null;
  store: string;
  link: string;
  notes: string;
  neededBy: NeededBy;
  /** Only meaningful for `kind: 'task'`. */
  done: boolean;
  order: number;
}

// ---------- Babies and logging ----------

export type TwinSlot = 'A' | 'B';
export type TwinColor = 'teal' | 'amber' | 'violet' | 'rose' | 'blue' | 'green';

export interface Baby extends Entity {
  slot: TwinSlot;
  name: string;
  color: TwinColor;
  birthDateTime: ISODateTime | null;
  birthWeightG: number | null;
  birthLengthCm: number | null;
  /** Minutes between feeds as the parents set it (never a built-in default); absent or null means not set. */
  feedIntervalMin?: number | null;
}

export type LogType = 'feed' | 'diaper' | 'sleep' | 'med' | 'measure' | 'note';

export type Milk = 'breast' | 'formula';
/** A bottle given after a breastfeed (combination feeding). Absent on older entries. */
export type TopUp = { ml: number; milk: Milk };
export type FeedData =
  { method: 'breast'; side: 'left' | 'right' | 'both'; topUp?: TopUp | null } | { method: 'bottle'; ml: number; milk: Milk };
export type DiaperData = { kind: 'wet' | 'dirty' | 'both' };
export type SleepData = Record<string, never>;
export type MedData = { name: string; dose: string };
export type MeasureData = { weightG: number | null; lengthCm: number | null };
export type NoteData = { text: string };

interface LogBase extends Entity {
  babyId: string;
  start: ISODateTime;
  /** End time for timed entries (sleep, breastfeeding); `null` while a timer runs. */
  end: ISODateTime | null;
  /** Shared by the two entries created by one "both twins" action. */
  groupId: string | null;
  loggedBy: ParentId;
}

export type LogEntry =
  | (LogBase & { type: 'feed'; data: FeedData })
  | (LogBase & { type: 'diaper'; data: DiaperData })
  | (LogBase & { type: 'sleep'; data: SleepData })
  | (LogBase & { type: 'med'; data: MedData })
  | (LogBase & { type: 'measure'; data: MeasureData })
  | (LogBase & { type: 'note'; data: NoteData });

// ---------- Planner ----------

/** Which twin(s) a planner record concerns. */
export type BabyScope = 'A' | 'B' | 'both' | 'none';

export interface Appointment extends Entity {
  title: string;
  babies: BabyScope;
  start: ISODateTime;
  location: string;
  notes: string;
}

export type RoutineRule =
  /** Every N hours, counted from the latest matching log entry (e.g. feeds). */
  | { kind: 'afterLast'; hours: number; logType: LogType }
  /** Every N days at fixed times of day (`HH:mm`), starting from `startDate`. */
  | { kind: 'everyDays'; days: number; times: string[]; startDate: ISODate };

export interface Routine extends Entity {
  title: string;
  babies: BabyScope;
  rule: RoutineRule;
  active: boolean;
}

/** Marks one generated occurrence of a routine as done. */
export interface RoutineDone extends Entity {
  routineId: string;
  occurrence: ISODateTime;
}

export interface ParentTask extends Entity {
  title: string;
  assignee: ParentId | null;
  due: ISODate | null;
  done: boolean;
  notes: string;
}

export interface DoctorNote extends Entity {
  text: string;
  babies: BabyScope;
  reviewedAt: ISODateTime | null;
}
