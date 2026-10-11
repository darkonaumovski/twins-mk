import type { Milestone, TwinSlot } from '@/data/types';
import { BABY_IDS, slotOf } from '@/features/log/logic';

/**
 * Built-in milestones, in the order they are listed. Only names: the app shows no
 * "usual" ages, every baby (and every twin) has their own pace.
 */
export const MILESTONE_KEYS = [
  'smile',
  'laugh',
  'headUp',
  'rollOver',
  'sitUp',
  'firstTooth',
  'crawl',
  'standUp',
  'firstSteps',
  'firstWord',
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

/** Fixed id, so both phones fill in the same record for a built-in milestone. */
export function milestoneId(key: string, babyId: string): string {
  return `milestone-${key}-${babyId}`;
}

export interface MilestoneRow {
  /** Stable React key: the built-in key, or the custom title in lower case. */
  rowKey: string;
  key: MilestoneKey | null;
  /** Custom title (built-in rows are translated by key). */
  title: string | null;
  cells: Partial<Record<TwinSlot, Milestone>>;
}

const norm = (title: string) => title.trim().toLocaleLowerCase();

/**
 * One row per milestone with both twins side by side: all built-in ones first,
 * then custom ones (the same title for both twins shares a row), oldest first.
 */
export function milestoneRows(records: readonly Milestone[]): MilestoneRow[] {
  const live = records.filter((m) => m.deletedAt === null && (m.babyId === BABY_IDS.A || m.babyId === BABY_IDS.B));
  const rows: MilestoneRow[] = MILESTONE_KEYS.map((key) => ({ rowKey: key, key, title: null, cells: {} }));
  const byKey = new Map(rows.map((r) => [r.rowKey, r]));
  const custom = new Map<string, MilestoneRow>();
  for (const m of live) {
    const slot = slotOf(m.babyId);
    if (m.key && byKey.has(m.key)) {
      byKey.get(m.key)!.cells[slot] = m;
      continue;
    }
    const k = norm(m.title);
    if (!k) continue;
    const row = custom.get(k) ?? { rowKey: `custom:${k}`, key: null, title: m.title.trim(), cells: {} };
    row.cells[slot] = m;
    custom.set(k, row);
  }
  const earliest = (r: MilestoneRow) => [r.cells.A?.date, r.cells.B?.date].filter((d): d is string => Boolean(d)).sort()[0] ?? '9999';
  const customRows = [...custom.values()].sort((a, b) => earliest(a).localeCompare(earliest(b)) || a.rowKey.localeCompare(b.rowKey));
  return [...rows, ...customRows];
}
