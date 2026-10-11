import { describe, expect, it } from 'vitest';
import { needsBackupReminder } from './backupLogic';

const now = new Date('2026-10-11T12:00:00.000Z');

describe('needsBackupReminder', () => {
  it('reminds without sync when there is no recent backup', () => {
    expect(needsBackupReminder({ syncOn: false, lastBackup: null, now })).toBe(true);
    expect(needsBackupReminder({ syncOn: false, lastBackup: '2026-10-03T12:00:00.000Z', now })).toBe(true);
    expect(needsBackupReminder({ syncOn: false, lastBackup: '2026-10-05T12:00:00.000Z', now })).toBe(false);
  });

  it('stays quiet while sync is on', () => {
    expect(needsBackupReminder({ syncOn: true, lastBackup: null, now })).toBe(false);
  });
});
