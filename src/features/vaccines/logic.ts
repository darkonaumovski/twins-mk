import type { BabyScope, ISODate, NewRecord, TwinSlot, Vaccine } from '@/data/types';
import { babyIdsFor, BABY_IDS, slotOf, type Who } from '@/features/log/logic';

/** What the parents fill in once; it becomes one record per selected twin. */
export type VaccineFields = Pick<Vaccine, 'name' | 'dose' | 'date' | 'place' | 'lot' | 'notes'>;

/** One record per twin; "both" links the two with a shared `groupId`, like a tandem feed. */
export function vaccineRecords(who: Who, fields: VaccineFields, newGroupId: () => string): NewRecord<Vaccine>[] {
  const ids = babyIdsFor(who);
  const groupId = ids.length > 1 ? newGroupId() : null;
  const clean: VaccineFields = {
    name: fields.name.trim(),
    dose: fields.dose !== null && Number.isInteger(fields.dose) && fields.dose >= 1 ? fields.dose : null,
    date: fields.date,
    place: fields.place.trim(),
    lot: fields.lot.trim(),
    notes: fields.notes.trim(),
  };
  return ids.map((babyId) => ({ ...clean, babyId, groupId }));
}

/** Newest first: by date, then by when it was entered. */
const newestFirst = (a: Vaccine, b: Vaccine) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** Each twin's vaccinations, newest first (for the side-by-side list). Deleted ones are left out. */
export function vaccinesBySlot(list: readonly Vaccine[]): Record<TwinSlot, Vaccine[]> {
  const live = list.filter((v) => v.deletedAt === null).sort(newestFirst);
  return {
    A: live.filter((v) => v.babyId === BABY_IDS.A),
    B: live.filter((v) => v.babyId === BABY_IDS.B),
  };
}

/**
 * The dose number as typed: empty is "not noted" (null), a whole number from 1 up is kept, and
 * anything else (0, 2.5, letters) is 'invalid', so the form asks again instead of guessing.
 */
export function parseDose(input: string): number | null | 'invalid' {
  const text = input.trim();
  if (!text) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isInteger(n) && n >= 1 ? n : 'invalid';
}

/** Values of one text field already used in this family, most recent first, each once (ignoring case). */
function used(list: readonly Vaccine[], field: 'name' | 'place'): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const v of list.filter((x) => x.deletedAt === null).sort(newestFirst)) {
    const value = v[field].trim();
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

/** Vaccine names already used in this family, most recent first, each once (ignoring case). */
export const nameSuggestions = (list: readonly Vaccine[]) => used(list, 'name');
/** Places already used, the same way. */
export const placeSuggestions = (list: readonly Vaccine[]) => used(list, 'place');

/**
 * Which twins a vaccination was for: both when its linked record for the other twin still exists,
 * otherwise just this twin. Used for "Plan next dose".
 */
export function scopeOf(vaccine: Vaccine, list: readonly Vaccine[]): BabyScope {
  const slot = slotOf(vaccine.babyId);
  if (!vaccine.groupId) return slot;
  const partner = list.some(
    (v) => v.id !== vaccine.id && v.deletedAt === null && v.groupId === vaccine.groupId && v.babyId !== vaccine.babyId,
  );
  return partner ? 'both' : slot;
}

/** The next dose number, or null when the dose was not noted. */
export function nextDose(vaccine: Pick<Vaccine, 'dose'>): number | null {
  return vaccine.dose === null ? null : vaccine.dose + 1;
}

/** Vaccinations of these twins given in [from, to] (calendar days, inclusive), oldest first. */
export function vaccinesInPeriod(list: readonly Vaccine[], slots: readonly TwinSlot[], from: ISODate, to: ISODate): Vaccine[] {
  const ids = slots.map((s) => BABY_IDS[s]);
  return list
    .filter((v) => v.deletedAt === null && ids.includes(v.babyId) && v.date >= from && v.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.babyId.localeCompare(b.babyId) || a.createdAt.localeCompare(b.createdAt));
}
