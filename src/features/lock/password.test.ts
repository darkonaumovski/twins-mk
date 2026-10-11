import { describe, expect, it } from 'vitest';
import { checkPassword } from './password';

describe('family password', () => {
  it('accepts only the exact password', async () => {
    expect(await checkPassword('AnaEma')).toBe(true);
    expect(await checkPassword('anaema')).toBe(false);
    expect(await checkPassword('AnaEma ')).toBe(false);
    expect(await checkPassword('')).toBe(false);
  });
});
