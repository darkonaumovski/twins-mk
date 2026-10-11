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
/** `night`: a very dim, warm palette; `autoNight`: that palette from 22:00 to 06:00, otherwise the phone's setting. */
export type ThemePref = 'system' | 'light' | 'dark' | 'night' | 'autoNight';
/**
 * Who logged or does something. The two parents are `p1` and `p2` (fixed ids, names in the
 * shared settings); helpers such as a grandparent or a nanny are `caregivers` records.
 */
export type CaregiverId = string;
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
  /** "Use within" days for stored breast milk, as the parents set them (null = not set). */
  stashUseWithinDays: { fridge: number | null; freezer: number | null };
  /** Who is on duty at night, repeated every night until changed. */
  nightShifts: NightShift[];
  /** The family's time zone (e.g. "Europe/Skopje"), so the server reads routine times the same way. */
  timeZone?: string;
}

/** One night shift, e.g. 22:00–02:00. `to` earlier than `from` means it runs past midnight. */
export interface NightShift {
  caregiverId: CaregiverId;
  from: string;
  to: string;
}

/**
 * A milestone for one twin. The built-in ones (first smile…) have a `key` and the fixed id
 * `milestone-<key>-<babyId>`, so both phones fill in the same record; custom ones have a title.
 */
export interface Milestone extends Entity {
  babyId: string;
  key: string | null;
  title: string;
  date: ISODate | null;
  note: string;
}

/** What a phone wants push reminders for. */
export type ReminderKind = 'routines' | 'medicines' | 'appointments' | 'feedDue';

/** This phone's push subscription, as saved on the sync server. */
export interface PushPrefs {
  endpoint: string;
  kinds: ReminderKind[];
}

/** A helper (grandparent, nanny…). The parents themselves are `p1` and `p2` and have no record. */
export interface Caregiver extends Entity {
  name: string;
  order: number;
}

/** Preferences for this phone only. Never exported or merged. */
export interface DevicePrefs {
  id: 'device';
  deviceId: string;
  language: Language;
  theme: ThemePref;
  /** Who normally uses this phone (a parent or a helper); stamped on new log entries. */
  parent: CaregiverId;
  notifications: boolean;
  /** Version of the starter checklist already added on this device (absent on older installs). */
  seedVersion?: number;
  /** Tell this phone about the other parent's synced changes (absent means on). */
  changeAlerts?: boolean;
  /** The family this phone syncs with, if sync is on. */
  sync?: SyncMembership | null;
  /** When this phone last left the app (went to the background); powers "since you last opened". */
  lastSeenAt?: ISODateTime | null;
  /** A short vibration after logging (absent means on). */
  haptics?: boolean;
  /** Push reminders on this phone (also while the app is closed), if turned on. */
  push?: PushPrefs | null;
  /** `onDuty`: during a night shift that belongs to someone else, do not announce their changes. */
  changeAlertsMode?: 'always' | 'onDuty';
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
  /** Gestational age at birth, e.g. 35 weeks + 4 days; used for the corrected age. Absent or null means not entered. */
  gestationWeeksAtBirth?: number | null;
  gestationDaysAtBirth?: number | null;
  /** Where the twin is now; absent means home. */
  location?: BabyLocation;
}

export type BabyLocation = 'home' | 'hospital';

export type LogType = 'feed' | 'diaper' | 'sleep' | 'med' | 'measure' | 'note' | 'temp' | 'spitup' | 'bath' | 'tummy';

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
export type TempData = { celsius: number };
export type SpitupData = { size: 'small' | 'large' };
export type BathData = Record<string, never>;
export type TummyData = { minutes: number };

interface LogBase extends Entity {
  babyId: string;
  start: ISODateTime;
  /** End time for timed entries (sleep, breastfeeding); `null` while a timer runs. */
  end: ISODateTime | null;
  /** Shared by the two entries created by one "both twins" action. */
  groupId: string | null;
  loggedBy: CaregiverId;
}

export type LogEntry =
  | (LogBase & { type: 'feed'; data: FeedData })
  | (LogBase & { type: 'diaper'; data: DiaperData })
  | (LogBase & { type: 'sleep'; data: SleepData })
  | (LogBase & { type: 'med'; data: MedData })
  | (LogBase & { type: 'measure'; data: MeasureData })
  | (LogBase & { type: 'note'; data: NoteData })
  | (LogBase & { type: 'temp'; data: TempData })
  | (LogBase & { type: 'spitup'; data: SpitupData })
  | (LogBase & { type: 'bath'; data: BathData })
  | (LogBase & { type: 'tummy'; data: TummyData });

// ---------- Pumping, milk stash and supplies ----------

/**
 * One pumping session. Kept apart from the twins' log entries: it belongs to the
 * mother, and older app versions (which only know the `logs` collection) skip it.
 */
export interface Pump extends Entity {
  start: ISODateTime;
  minutes: number | null;
  /** Millilitres per side, if noted separately. */
  leftMl: number | null;
  rightMl: number | null;
  /** Total millilitres (the sum of the sides when both are given). */
  totalMl: number;
  loggedBy: CaregiverId;
}

export type StashLocation = 'fridge' | 'freezer';

/** A container of stored breast milk. */
export interface MilkStashItem extends Entity {
  pumpedAt: ISODateTime;
  /** What is left in it; a bottle can use part of it. */
  ml: number;
  location: StashLocation;
  /** Set once it has been used up (or thrown away). */
  usedAt: ISODateTime | null;
  /** The pumping session it came from, if logged. */
  pumpId: string | null;
}

/** What uses up a supply automatically. */
export type SupplySource = 'diapers' | 'formula';

/**
 * A supply the app keeps count of. Stock is counted at `countedAt`; what is left now
 * is that minus the use logged since (diaper entries, ml of formula). The stock itself
 * is only written on a count or a restock, so two phones never race on a counter.
 */
export interface Supply extends Entity {
  source: SupplySource;
  /** Stock at `countedAt`, in pieces (diapers) or ml of prepared formula. */
  stock: number;
  countedAt: ISODateTime;
  /** One pack: diapers per pack, or ml of prepared formula one tin makes. */
  packSize: number;
  /** Warn when fewer than this many days are left. */
  lowThresholdDays: number;
}

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

/**
 * A medicine or supplement given on this routine. Everything here is entered by
 * the parents (from their doctor); the app has no doses or intervals of its own.
 */
export interface RoutineMed {
  /** Matched (ignoring case) against the name of logged medicine entries. */
  name: string;
  dose: string;
  /** Minimum hours between two doses for one twin, if the parents set one. */
  minIntervalHours: number | null;
}

export interface Routine extends Entity {
  title: string;
  babies: BabyScope;
  rule: RoutineRule;
  active: boolean;
  /** Set when this routine is a medicine or supplement. Absent on older records. */
  med?: RoutineMed | null;
  /** Skip this routine for a twin who is in hospital. */
  onlyWhenHome?: boolean;
}

/** Marks one generated occurrence of a routine as done. */
export interface RoutineDone extends Entity {
  routineId: string;
  occurrence: ISODateTime;
}

export interface ParentTask extends Entity {
  title: string;
  assignee: CaregiverId | null;
  due: ISODate | null;
  done: boolean;
  notes: string;
}

export interface DoctorNote extends Entity {
  text: string;
  babies: BabyScope;
  reviewedAt: ISODateTime | null;
}
