import type { DiaperData, LogEntry, StoolColor, StoolTexture } from '@/data/types';

export const STOOL_COLORS: readonly StoolColor[] = ['yellow', 'green', 'brown', 'black', 'red', 'pale', 'other'];
export const STOOL_TEXTURES: readonly StoolTexture[] = ['watery', 'soft', 'formed', 'hard'];

/** What the editor's "Details" chips hold; null means not noted. */
export interface DiaperDetails {
  rash: boolean;
  color: StoolColor | null;
  texture: StoolTexture | null;
}

export const NO_DETAILS: DiaperDetails = { rash: false, color: null, texture: null };

/** Colour and texture only describe a dirty diaper. */
export const isDirty = (kind: DiaperData['kind']) => kind !== 'wet';

/**
 * The entry's data with only the details that apply: rash when noted, colour and texture only for
 * a dirty diaper (switching to "wet" drops them). Nothing noted gives the same data as a quick tap.
 */
export function diaperData(kind: DiaperData['kind'], details: DiaperDetails): DiaperData {
  const data: DiaperData = { kind };
  if (details.rash) data.rash = true;
  if (isDirty(kind) && details.color) data.color = details.color;
  if (isDirty(kind) && details.texture) data.texture = details.texture;
  return data;
}

/** The details of an entry (older entries and quick taps have none). Unknown values from a newer version are ignored. */
export function detailsOf(data: DiaperData): DiaperDetails {
  const dirty = isDirty(data.kind);
  return {
    rash: data.rash === true,
    color: dirty && data.color && STOOL_COLORS.includes(data.color) ? data.color : null,
    texture: dirty && data.texture && STOOL_TEXTURES.includes(data.texture) ? data.texture : null,
  };
}

export const hasDetails = (d: DiaperDetails) => d.rash || d.color !== null || d.texture !== null;

/** Whether saving this kind with these chips stores any detail (colour and texture do not count on a wet diaper). */
export const savesDetails = (kind: DiaperData['kind'], d: DiaperDetails) => hasDetails(detailsOf(diaperData(kind, d)));

/** Labels the marker words come from; a plain function so it is testable without i18next. */
export type DetailLabel = (key: 'diaper.rashMark' | `diaper.colors.${StoolColor}` | `diaper.textures.${StoolTexture}`) => string;

/** The details as short lower-case words after the kind, for the timeline: ["rash", "green", "soft"]. */
export function detailMarks(data: DiaperData, label: DetailLabel): string[] {
  const d = detailsOf(data);
  const marks: string[] = [];
  if (d.rash) marks.push(label('diaper.rashMark'));
  if (d.color) marks.push(label(`diaper.colors.${d.color}`).toLocaleLowerCase());
  if (d.texture) marks.push(label(`diaper.textures.${d.texture}`).toLocaleLowerCase());
  return marks;
}

export interface DiaperBreakdown {
  /** Diapers with a rash noted. */
  rash: number;
  /** Diapers per colour and texture, in the fixed order above, only those that occur. */
  colors: [StoolColor, number][];
  textures: [StoolTexture, number][];
}

/** Rash count and colour/texture counts for one twin's diapers that start in [from, to). */
export function diaperBreakdown(entries: readonly LogEntry[], babyId: string, from: Date, to: Date): DiaperBreakdown {
  const f = from.toISOString();
  const t = to.toISOString();
  let rash = 0;
  const colors = new Map<StoolColor, number>();
  const textures = new Map<StoolTexture, number>();
  for (const e of entries) {
    if (e.type !== 'diaper' || e.babyId !== babyId || e.deletedAt !== null || e.start < f || e.start >= t) continue;
    const d = detailsOf(e.data);
    if (d.rash) rash++;
    if (d.color) colors.set(d.color, (colors.get(d.color) ?? 0) + 1);
    if (d.texture) textures.set(d.texture, (textures.get(d.texture) ?? 0) + 1);
  }
  return {
    rash,
    colors: STOOL_COLORS.flatMap((c) => (colors.has(c) ? [[c, colors.get(c)!] as [StoolColor, number]] : [])),
    textures: STOOL_TEXTURES.flatMap((x) => (textures.has(x) ? [[x, textures.get(x)!] as [StoolTexture, number]] : [])),
  };
}
