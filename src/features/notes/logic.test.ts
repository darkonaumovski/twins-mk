import { describe, expect, it } from 'vitest';
import type { DoctorNote } from '@/data/types';
import { filterNotes } from './logic';

const note = (id: string, babies: DoctorNote['babies']): DoctorNote => ({
  id,
  text: id,
  babies,
  reviewedAt: null,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  deviceId: 'd',
});

describe('notes filter', () => {
  const notes = [note('a', 'A'), note('both', 'both'), note('mom', 'none'), note('b', 'B')];

  it('shows the mother’s notes, the twins’ notes, or all', () => {
    expect(filterNotes(notes, 'mother').map((n) => n.id)).toEqual(['mom']);
    expect(filterNotes(notes, 'twins').map((n) => n.id)).toEqual(['a', 'both', 'b']);
    expect(filterNotes(notes, 'all')).toHaveLength(4);
  });
});
