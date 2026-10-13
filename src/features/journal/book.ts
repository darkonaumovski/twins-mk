import { format } from 'date-fns';
import type { Baby, ISODate, JournalEntry, Milestone, Photo, TwinSlot } from '@/data/types';
import { SLOTS } from '@/features/log/logic';
import { ageInfo, gestationDays } from '@/features/twins/age';
import { milestoneRows, type MilestoneKey } from '@/features/milestones/logic';
import { photosOf } from '@/features/photos/logic';

/** What the keepsake book is made from (live and deleted records; deleted ones are left out here). */
export interface BookInput {
  babies: Partial<Record<TwinSlot, Baby>>;
  milestones: readonly Milestone[];
  journal: readonly JournalEntry[];
  photos: readonly Photo[];
  /** First foods (F14): the first day each twin tried each food. */
  firstFoods?: readonly { name: string; dates: Partial<Record<TwinSlot, ISODate>> }[];
}

export interface BookOptions {
  /** Inclusive date range; null means from the start / up to now. */
  from: ISODate | null;
  to: ISODate | null;
  includePhotos: boolean;
}

export interface BookBirth {
  slot: TwinSlot;
  name: string;
  birthDateTime: string | null;
  weightG: number | null;
  lengthCm: number | null;
  /** Weeks + days of pregnancy at birth, if entered. */
  gestation: { weeks: number; days: number } | null;
}

export interface BookMilestoneCell {
  date: ISODate;
  /** Age in days on that date, and the corrected age for a twin born before 37+0 (null otherwise). */
  ageDays: number | null;
  correctedDays: number | null;
  note: string;
  photoIds: string[];
}

export interface BookMilestone {
  key: MilestoneKey | null;
  title: string | null;
  cells: Partial<Record<TwinSlot, BookMilestoneCell>>;
}

export interface BookMonth {
  /** `2026-10` */
  month: string;
  photoIds: string[];
  entries: { id: string; date: ISODate; babies: JournalEntry['babies']; text: string; photoIds: string[] }[];
}

export interface Book {
  cover: { names: Partial<Record<TwinSlot, string>>; birthDate: ISODate | null };
  births: BookBirth[];
  milestones: BookMilestone[];
  months: BookMonth[];
  firstFoods: { name: string; dates: Partial<Record<TwinSlot, ISODate>> }[];
}

const inRange = (date: ISODate, o: BookOptions) => (!o.from || date >= o.from) && (!o.to || date <= o.to);
/** A month (`2026-10`) overlaps the range. */
const monthInRange = (month: string, o: BookOptions) => (!o.from || month >= o.from.slice(0, 7)) && (!o.to || month <= o.to.slice(0, 7));
const localDate = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

/**
 * The keepsake book's contents, in order: the cover, birth details side by side, the milestones side by
 * side (oldest first, with age and corrected age), one page per month with the monthly photo and the
 * journal entries put in the book (months with neither are skipped), and the first foods.
 */
export function buildBook(input: BookInput, options: BookOptions): Book {
  const photos = options.includePhotos ? input.photos.filter((p) => p.deletedAt === null) : [];
  const live = <T extends { deletedAt: string | null }>(list: readonly T[]) => list.filter((r) => r.deletedAt === null);
  const baby = (slot: TwinSlot) => {
    const b = input.babies[slot];
    return b && b.deletedAt === null ? b : undefined;
  };

  const birthDates = SLOTS.map((s) => baby(s)?.birthDateTime).filter((d): d is string => Boolean(d));
  const cover = {
    names: Object.fromEntries(SLOTS.flatMap((s) => (baby(s) ? [[s, baby(s)!.name]] : []))) as Partial<Record<TwinSlot, string>>,
    birthDate: birthDates.length ? localDate(birthDates.sort()[0]) : null,
  };

  const births: BookBirth[] = SLOTS.flatMap((slot) => {
    const b = baby(slot);
    if (!b) return [];
    const ga = gestationDays(b);
    return [
      {
        slot,
        name: b.name,
        birthDateTime: b.birthDateTime,
        weightG: b.birthWeightG,
        lengthCm: b.birthLengthCm,
        gestation: ga === null ? null : { weeks: Math.floor(ga / 7), days: ga % 7 },
      },
    ];
  });

  const milestones: BookMilestone[] = [];
  for (const row of milestoneRows(input.milestones)) {
    const cells: Partial<Record<TwinSlot, BookMilestoneCell>> = {};
    for (const slot of SLOTS) {
      const m = row.cells[slot];
      if (!m?.date || !inRange(m.date, options)) continue;
      const b = baby(slot);
      // The age on that day (noon, so the time zone never moves it to another day).
      const age = b ? ageInfo(b, new Date(`${m.date}T12:00:00`)) : null;
      cells[slot] = {
        date: m.date,
        ageDays: age?.actualDays ?? null,
        correctedDays: age?.correctedDays ?? null,
        note: m.note,
        photoIds: photosOf(photos, { kind: 'milestone', id: m.id }).map((p) => p.id),
      };
    }
    if (Object.keys(cells).length) milestones.push({ key: row.key, title: row.title, cells });
  }
  const first = (m: BookMilestone) => [m.cells.A?.date, m.cells.B?.date].filter((d): d is string => Boolean(d)).sort()[0];
  milestones.sort((a, b) => first(a).localeCompare(first(b)));

  const months = new Map<string, BookMonth>();
  const month = (key: string) => {
    if (!months.has(key)) months.set(key, { month: key, photoIds: [], entries: [] });
    return months.get(key)!;
  };
  for (const p of photos) {
    if (p.owner.kind !== 'monthly' || !p.owner.id || !/^\d{4}-\d{2}$/.test(p.owner.id)) continue;
    if (!monthInRange(p.owner.id, options)) continue;
    month(p.owner.id).photoIds.push(p.id);
  }
  for (const e of live(input.journal)) {
    if (!e.inBook || !inRange(e.date, options)) continue;
    month(e.date.slice(0, 7)).entries.push({
      id: e.id,
      date: e.date,
      babies: e.babies,
      text: e.text,
      photoIds: photosOf(photos, { kind: 'journal', id: e.id }).map((p) => p.id),
    });
  }
  const monthList = [...months.values()]
    .filter((m) => m.photoIds.length || m.entries.length)
    .sort((a, b) => a.month.localeCompare(b.month));
  for (const m of monthList) m.entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const firstFoods = (input.firstFoods ?? [])
    .map((f) => ({ name: f.name, dates: Object.fromEntries(Object.entries(f.dates).filter(([, d]) => d && inRange(d, options))) }))
    .filter((f) => Object.keys(f.dates).length > 0)
    .sort((a, b) => {
      const earliest = (f: typeof a) => Object.values(f.dates).sort()[0] ?? '';
      return earliest(a).localeCompare(earliest(b)) || a.name.localeCompare(b.name);
    });

  return { cover, births, milestones, months: monthList, firstFoods };
}
