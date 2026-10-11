import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundlePath = `${root}supabase/functions/_shared/reminders.js`;

describe('Edge Function bundle', () => {
  it('matches the source (otherwise run `npm run build:functions`)', async () => {
    const output = await build({ root, configFile: `${root}vite.functions.config.ts`, logLevel: 'silent', build: { write: false } });
    const outputs = Array.isArray(output) ? output : [output];
    const chunk = outputs.flatMap((o) => ('output' in o ? o.output : [])).find((c) => c.type === 'chunk');
    const committed = readFileSync(bundlePath, 'utf8').replace(/\r\n/g, '\n');
    expect(chunk && 'code' in chunk ? chunk.code.replace(/\r\n/g, '\n') : null).toBe(committed);
  }, 60_000);

  it('loads on its own and exposes the run', async () => {
    const mod = (await import(/* @vite-ignore */ bundlePath)) as Record<string, unknown>;
    expect(typeof mod.runReminders).toBe('function');
    expect(typeof mod.sendTestReminder).toBe('function');
  });
});
