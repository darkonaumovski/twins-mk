import type { DataStore } from '@/data/repository';
import type { JournalEntry } from '@/data/types';
import { deletePhoto, photosOf } from '@/features/photos/logic';

/** Deletes an entry with its photos; the returned undo brings both back. */
export async function deleteJournalEntry(
  store: Pick<DataStore, 'journal' | 'photos' | 'transaction'>,
  id: string,
): Promise<() => Promise<void>> {
  return store.transaction(async () => {
    const photos = photosOf(await store.photos.list(), { kind: 'journal', id });
    const undos: (() => Promise<void>)[] = [];
    for (const p of photos) undos.push(await deletePhoto(store, p.id));
    await store.journal.remove(id);
    return async () => {
      await store.transaction(async () => {
        await store.journal.restore(id);
        for (const undo of undos) await undo();
      });
    };
  });
}

/** Live entries, newest first, grouped by month (`2026-10`). */
export function journalByMonth(entries: readonly JournalEntry[]): { month: string; entries: JournalEntry[] }[] {
  const live = entries
    .filter((e) => e.deletedAt === null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, JournalEntry[]>();
  for (const e of live) {
    const month = e.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), e]);
  }
  return [...groups].map(([month, list]) => ({ month, entries: list }));
}
