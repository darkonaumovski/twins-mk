import type { DoctorNote } from '@/data/types';

/** Which notes the list shows: all, the twins' (A, B or both), or the mother's (`babies: 'none'`). */
export type NoteFilter = 'all' | 'twins' | 'mother';

export function filterNotes(notes: readonly DoctorNote[], filter: NoteFilter): DoctorNote[] {
  if (filter === 'all') return [...notes];
  return notes.filter((n) => (filter === 'mother' ? n.babies === 'none' : n.babies !== 'none'));
}
