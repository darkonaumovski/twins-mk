import { format } from 'date-fns';
import { isKnownLog } from '@/data/logTypes';
import type {
  Appointment,
  Baby,
  BabyScope,
  Category,
  Contraction,
  ISODateTime,
  LogEntry,
  Milestone,
  MilkStashItem,
  ParentTask,
  PrepItem,
  Pump,
  Vaccine,
  MotherLog,
  Food,
  FoodTry,
} from '@/data/types';
import type { CsvCell } from '@/lib/csv';
import { ageInfo } from '@/features/twins/age';
import { finishedPumps } from '@/features/milk/logic';
import { contractionRows } from '@/features/contractions/logic';
import { checkinDate } from '@/features/mother/logic';
import type { ScopeKind } from '@/features/plan/logic';

/** Everything the spreadsheet export reads (live and deleted records; deleted ones are left out here). */
export interface CsvData {
  logs: readonly LogEntry[];
  pumps: readonly Pump[];
  milkStash: readonly MilkStashItem[];
  appointments: readonly Appointment[];
  tasks: readonly ParentTask[];
  milestones: readonly Milestone[];
  prepItems: readonly PrepItem[];
  categories: readonly Category[];
  contractions: readonly Contraction[];
  vaccines: readonly Vaccine[];
  motherLogs: readonly MotherLog[];
  foods: readonly Food[];
  foodTries: readonly FoodTry[];
  babies: readonly Baby[];
}

/** Text in the phone's language: headers, names instead of ids, and translated values. */
export interface CsvText {
  t: (key: string, options?: Record<string, unknown>) => string;
  twin: (babyId: string) => string;
  person: (caregiverId: string) => string;
  /** A checklist record's name, translated while it is still the starter text. */
  label: (record: { name: string; seedKey: string | null }) => string;
  scope: (scope: BabyScope, kind: ScopeKind) => string;
}

export interface CsvFile {
  fileName: string;
  rows: CsvCell[][];
}

const live = <T extends { deletedAt: string | null }>(list: readonly T[]) => list.filter((r) => r.deletedAt === null);
/** A damaged timestamp gives an empty cell instead of failing the whole export. */
const stamp = (iso: ISODateTime | null | undefined, pattern: string) =>
  iso && !Number.isNaN(Date.parse(iso)) ? format(new Date(iso), pattern) : '';
const day = (iso: ISODateTime) => stamp(iso, 'yyyy-MM-dd');
const time = (iso: ISODateTime) => stamp(iso, 'HH:mm');
const minutesBetween = (from: ISODateTime, to: ISODateTime) => Math.round((Date.parse(to) - Date.parse(from)) / 60_000);

/**
 * Free text, safe to open in Excel: a cell that starts with = + - or @ would be read as a
 * formula ("-ate well" shows as #NAME?), so it gets a leading apostrophe. In a CSV file the
 * apostrophe stays visible ("'-ate well"); that is the price of never running a formula.
 */
export function text(value: string | null | undefined): string {
  if (!value) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function logsCsv(entries: readonly LogEntry[], tx: CsvText): CsvFile {
  const { t } = tx;
  const header = [
    'date',
    'time',
    'twin',
    'type',
    'method',
    'side',
    'ml',
    'milk',
    'topUpMl',
    'diaper',
    'rash',
    'stoolColor',
    'stoolTexture',
    'sleepMinutes',
    'medicine',
    'dose',
    'temperature',
    'weightG',
    'lengthCm',
    'headCm',
    'minutes',
    'size',
    'note',
    'loggedBy',
  ].map((k) => t(`csv.logs.${k}`));
  const rows = live(entries)
    .filter(isKnownLog)
    .sort((a, b) => a.start.localeCompare(b.start) || a.babyId.localeCompare(b.babyId))
    .map((e) => {
      const c: Record<string, CsvCell> = {};
      switch (e.type) {
        case 'feed':
          c.method = t(`log.${e.data.method === 'breast' ? 'breast' : 'bottle'}`);
          if (e.data.method === 'breast') {
            c.side = t(`activity.value.side.${e.data.side}`);
            if (e.data.topUp) {
              c.topUpMl = e.data.topUp.ml;
              c.milk = t(`activity.value.milk.${e.data.topUp.milk}`);
            }
            c.minutes = e.end ? minutesBetween(e.start, e.end) : t('csv.running');
          } else {
            c.ml = e.data.ml;
            c.milk = t(`activity.value.milk.${e.data.milk}`);
          }
          break;
        case 'diaper': {
          c.diaper = t(`activity.value.diaper.${e.data.kind}`);
          if (typeof e.data.rash === 'boolean') c.rash = e.data.rash ? t('activity.yes') : t('activity.no');
          // A value from a newer version that this one has no word for is written as it is.
          if (e.data.color) c.stoolColor = t(`diaper.colors.${e.data.color}`, { defaultValue: e.data.color });
          if (e.data.texture) c.stoolTexture = t(`diaper.textures.${e.data.texture}`, { defaultValue: e.data.texture });
          break;
        }
        case 'sleep':
          c.sleepMinutes = e.end ? minutesBetween(e.start, e.end) : t('csv.running');
          break;
        case 'med':
          c.medicine = text(e.data.name);
          c.dose = text(e.data.dose);
          break;
        case 'temp':
          c.temperature = e.data.celsius;
          break;
        case 'measure': {
          c.weightG = e.data.weightG;
          c.lengthCm = e.data.lengthCm;
          if (typeof e.data.headCm === 'number') c.headCm = e.data.headCm;
          break;
        }
        case 'tummy':
          c.minutes = e.data.minutes;
          break;
        case 'spitup':
          c.size = t(`activity.value.size.${e.data.size}`);
          break;
        case 'note':
          c.note = text(e.data.text);
          break;
        case 'bath':
          break;
      }
      return [
        day(e.start),
        time(e.start),
        tx.twin(e.babyId),
        t(`log.${e.type}`),
        c.method,
        c.side,
        c.ml,
        c.milk,
        c.topUpMl,
        c.diaper,
        c.rash,
        c.stoolColor,
        c.stoolTexture,
        c.sleepMinutes,
        c.medicine,
        c.dose,
        c.temperature,
        c.weightG,
        c.lengthCm,
        c.headCm,
        c.minutes,
        c.size,
        c.note,
        tx.person(e.loggedBy),
      ];
    });
  return { fileName: 'logs.csv', rows: [header, ...rows] };
}

function pumpingCsv(pumps: readonly Pump[], tx: CsvText): CsvFile {
  const header = ['date', 'time', 'minutes', 'leftMl', 'rightMl', 'totalMl', 'loggedBy'].map((k) => tx.t(`csv.pumping.${k}`));
  // A running timer is not a finished session yet.
  const rows = finishedPumps(pumps)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => [day(p.start), time(p.start), p.minutes, p.leftMl, p.rightMl, p.totalMl, tx.person(p.loggedBy)]);
  return { fileName: 'pumping.csv', rows: [header, ...rows] };
}

function stashCsv(items: readonly MilkStashItem[], tx: CsvText): CsvFile {
  const header = ['date', 'time', 'ml', 'place', 'usedOn'].map((k) => tx.t(`csv.stash.${k}`));
  const rows = live(items)
    .sort((a, b) => a.pumpedAt.localeCompare(b.pumpedAt))
    .map((s) => [day(s.pumpedAt), time(s.pumpedAt), s.ml, tx.t(`stash.${s.location}`), s.usedAt ? day(s.usedAt) : '']);
  return { fileName: 'milk-stash.csv', rows: [header, ...rows] };
}

function appointmentsCsv(appointments: readonly Appointment[], tx: CsvText): CsvFile {
  const header = ['date', 'time', 'title', 'for', 'place', 'notes'].map((k) => tx.t(`csv.appointments.${k}`));
  const rows = live(appointments)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((a) => [day(a.start), time(a.start), text(a.title), tx.scope(a.babies, 'appointment'), text(a.location), text(a.notes)]);
  return { fileName: 'appointments.csv', rows: [header, ...rows] };
}

function tasksCsv(tasks: readonly ParentTask[], tx: CsvText): CsvFile {
  const header = ['title', 'who', 'due', 'done', 'notes'].map((k) => tx.t(`csv.tasks.${k}`));
  const rows = live(tasks)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt.localeCompare(b.createdAt))
    .map((task) => [
      text(task.title),
      task.assignee ? tx.person(task.assignee) : '',
      task.due ?? '',
      task.done ? tx.t('activity.yes') : tx.t('activity.no'),
      text(task.notes),
    ]);
  return { fileName: 'tasks.csv', rows: [header, ...rows] };
}

function milestonesCsv(milestones: readonly Milestone[], babies: readonly Baby[], tx: CsvText): CsvFile {
  const header = ['twin', 'milestone', 'date', 'ageDays', 'correctedAgeDays', 'note'].map((k) => tx.t(`csv.milestones.${k}`));
  const rows = live(milestones)
    .filter((m) => m.date !== null)
    .sort((a, b) => a.date!.localeCompare(b.date!) || a.babyId.localeCompare(b.babyId))
    .map((m) => {
      const baby = babies.find((b) => b.id === m.babyId && b.deletedAt === null);
      // The age on that day (noon, so the time zone never moves it to another day).
      const age = baby ? ageInfo(baby, new Date(`${m.date}T12:00:00`)) : null;
      const title = m.key ? tx.t(`milestones.keys.${m.key}`) : text(m.title);
      return [tx.twin(m.babyId), title, m.date, age?.actualDays, age?.correctedDays, text(m.note)];
    });
  return { fileName: 'milestones.csv', rows: [header, ...rows] };
}

function checklistCsv(items: readonly PrepItem[], categories: readonly Category[], tx: CsvText): CsvFile {
  const header = ['category', 'item', 'scope', 'quantity', 'acquired', 'status', 'estimatedUnitPrice', 'actualPrice', 'store'].map((k) =>
    tx.t(`csv.checklist.${k}`),
  );
  const cats = new Map(live(categories).map((c) => [c.id, c]));
  const rows = live(items)
    .sort(
      (a, b) =>
        (cats.get(a.categoryId)?.order ?? 999) - (cats.get(b.categoryId)?.order ?? 999) || a.order - b.order || a.id.localeCompare(b.id),
    )
    .map((item) => {
      const cat = cats.get(item.categoryId);
      const task = item.kind === 'task';
      return [
        cat ? text(tx.label(cat)) : '',
        text(tx.label(item)),
        task ? '' : tx.t(`activity.value.scope.${item.scope}`),
        task ? '' : item.quantity,
        task ? '' : item.acquired,
        task ? (item.done ? tx.t('activity.yes') : tx.t('activity.no')) : tx.t(`status.${item.status}`),
        item.estimatedUnitPrice,
        item.actualPrice,
        text(item.store),
      ];
    });
  return { fileName: 'checklist.csv', rows: [header, ...rows] };
}

function contractionsCsv(list: readonly Contraction[], tx: CsvText): CsvFile {
  const header = ['date', 'start', 'lengthSec', 'sincePreviousSec'].map((k) => tx.t(`csv.contractions.${k}`));
  const rows = contractionRows(list)
    .reverse()
    .map((r) => [day(r.start), format(new Date(r.start), 'HH:mm:ss'), r.durationSec, r.sincePreviousSec]);
  return { fileName: 'contractions.csv', rows: [header, ...rows] };
}

function vaccinesCsv(list: readonly Vaccine[], tx: CsvText): CsvFile {
  const header = ['twin', 'date', 'vaccine', 'dose', 'place', 'lot', 'notes'].map((k) => tx.t(`csv.vaccines.${k}`));
  const rows = live(list)
    .sort((a, b) => a.date.localeCompare(b.date) || a.babyId.localeCompare(b.babyId) || a.createdAt.localeCompare(b.createdAt))
    .map((v) => [tx.twin(v.babyId), v.date, text(v.name), v.dose, text(v.place), text(v.lot), text(v.notes)]);
  return { fileName: 'vaccines.csv', rows: [header, ...rows] };
}

function motherCsv(list: readonly MotherLog[], tx: CsvText): CsvFile {
  const header = ['date', 'time', 'type', 'medicine', 'dose', 'mood', 'sleepHours', 'note', 'loggedBy'].map((k) => tx.t(`csv.mother.${k}`));
  const rows = live(list)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((m) => {
      // A check-in is for its day (its fixed id), not for the moment it was saved.
      const date = m.type === 'checkin' ? checkinDate(m) : day(m.start);
      const base = [date, m.type === 'checkin' ? '' : time(m.start), tx.t(`csv.motherType.${m.type}`)];
      const by = tx.person(m.loggedBy);
      if (m.type === 'med') return [...base, text(m.data.name), text(m.data.dose), null, null, '', by];
      if (m.type === 'checkin') return [...base, '', '', m.data.mood, m.data.sleepHours, text(m.data.note), by];
      return [...base, '', '', null, null, text(m.data.text), by];
    });
  return { fileName: 'mother.csv', rows: [header, ...rows] };
}

function foodsCsv(foods: readonly Food[], tries: readonly FoodTry[], tx: CsvText): CsvFile {
  const header = ['date', 'twin', 'food', 'reaction', 'note'].map((k) => tx.t(`csv.foods.${k}`));
  // A try of a food deleted later still says what it was.
  const names = new Map(foods.map((f) => [f.id, text(tx.label(f))]));
  const rows = live(tries)
    .sort((a, b) => a.date.localeCompare(b.date) || a.babyId.localeCompare(b.babyId) || a.createdAt.localeCompare(b.createdAt))
    .map((tr) => [tr.date, tx.twin(tr.babyId), names.get(tr.foodId) ?? '', tx.t(`foods.reaction.${tr.reaction}`), text(tr.note)]);
  return { fileName: 'foods.csv', rows: [header, ...rows] };
}

/** One spreadsheet per area. Every file has its header row, even when there is nothing in it yet. */
export function buildCsvFiles(data: CsvData, raw: CsvText): CsvFile[] {
  // Names are typed by the parents too, so they get the same formula guard as notes.
  const tx: CsvText = {
    ...raw,
    twin: (id) => text(raw.twin(id)),
    person: (id) => text(raw.person(id)),
    scope: (scope, kind) => text(raw.scope(scope, kind)),
  };
  return [
    logsCsv(data.logs, tx),
    pumpingCsv(data.pumps, tx),
    stashCsv(data.milkStash, tx),
    appointmentsCsv(data.appointments, tx),
    tasksCsv(data.tasks, tx),
    milestonesCsv(data.milestones, data.babies, tx),
    checklistCsv(data.prepItems, data.categories, tx),
    contractionsCsv(data.contractions, tx),
    vaccinesCsv(data.vaccines, tx),
    motherCsv(data.motherLogs, tx),
    foodsCsv(data.foods, data.foodTries, tx),
  ];
}

/** `twins-organizer-2026-10-12.zip` */
export function csvZipName(now: Date): string {
  return `twins-organizer-${format(now, 'yyyy-MM-dd')}.zip`;
}
