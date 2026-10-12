import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import schema from '../../../supabase/schema.sql?raw';
import migration002 from '../../../supabase/migrations/002_pumping_stash_supplies.sql?raw';
import migration003 from '../../../supabase/migrations/003_caregivers.sql?raw';
import migration004 from '../../../supabase/migrations/004_push_milestones.sql?raw';
import migration005 from '../../../supabase/migrations/005_roadmap_collections.sql?raw';
import { COLLECTIONS } from '../repository';

/**
 * Runs supabase/schema.sql in an in-process Postgres with just enough of
 * Supabase stubbed out (roles, auth.uid(), the realtime publication) to check
 * the access rules and the last-writer-wins upsert.
 */
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create publication supabase_realtime;
`;

const MOM = '00000000-0000-4000-8000-000000000001';
const DAD = '00000000-0000-4000-8000-000000000002';
const STRANGER = '00000000-0000-4000-8000-000000000003';

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const rpc = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const record = (id: string, updatedAt: string, deviceId: string, extra: Record<string, unknown> = {}) => ({
  collection: 'tasks',
  data: { id, updatedAt, deviceId, createdAt: updatedAt, deletedAt: null, ...extra },
});

const push = (family: string, rows: unknown[]) =>
  rpc<{ n: number }>('select public.push_records($1, $2::jsonb) as n', [family, JSON.stringify(rows)]).then((r) => r[0].n);

const pullTitles = () =>
  rpc<{ title: string; seq: string }>(`select data->>'title' as title, seq from public.records order by seq`).then((r) => r);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(schema);
  // Running it twice must work too (people re-run the setup script).
  await db.exec(schema);
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [MOM, DAD, STRANGER]);
}, 60_000);

describe('sync schema', () => {
  let family: string;
  let code: string;

  it('creates a family with a readable join code', async () => {
    const [row] = await as(MOM, () => rpc<{ family_id: string; join_code: string }>('select * from public.create_family()'));
    family = row.family_id;
    code = row.join_code;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{12}$/);
  });

  it('refuses anonymous callers without a session', async () => {
    await expect(as(null, () => rpc('select * from public.create_family()'))).rejects.toThrow();
  });

  it('joins with the code, ignoring case, spaces and dashes', async () => {
    const pretty = `${code.slice(0, 4)}-${code.slice(4, 8)} ${code.slice(8)}`.toLowerCase();
    const [row] = await as(DAD, () => rpc<{ f: string }>('select public.join_family($1) as f', [pretty]));
    expect(row.f).toBe(family);
    // Joining again is harmless.
    await as(DAD, () => rpc('select public.join_family($1)', [code]));
    await expect(as(STRANGER, () => rpc('select public.join_family($1)', ['AAAAAAAAAAAA']))).rejects.toThrow(/family_not_found/);
  });

  it('keeps the newest version of each record (ties broken by device id)', async () => {
    await as(MOM, () => push(family, [record('t1', '2026-10-11T08:00:00.000Z', 'mom', { title: 'v1' })]));
    // Older write loses.
    expect(await as(DAD, () => push(family, [record('t1', '2026-10-11T07:00:00.000Z', 'dad', { title: 'old' })]))).toBe(0);
    // Newer write wins.
    expect(await as(DAD, () => push(family, [record('t1', '2026-10-11T09:00:00.000Z', 'dad', { title: 'v2' })]))).toBe(1);
    // Same time: the larger device id wins, exactly like the app's merge.
    expect(await as(MOM, () => push(family, [record('t1', '2026-10-11T09:00:00.000Z', 'aaa', { title: 'tie-lose' })]))).toBe(0);
    expect(await as(MOM, () => push(family, [record('t1', '2026-10-11T09:00:00.000Z', 'zzz', { title: 'tie-win' })]))).toBe(1);
    // Duplicates within one batch keep the newest instead of failing.
    expect(
      await as(MOM, () =>
        push(family, [
          record('t2', '2026-10-11T08:00:00.000Z', 'mom', { title: 'a' }),
          record('t2', '2026-10-11T08:05:00.000Z', 'mom', { title: 'b' }),
        ]),
      ),
    ).toBe(1);

    const rows = await as(DAD, pullTitles);
    expect(rows.map((r) => r.title)).toEqual(['tie-win', 'b']);
    // Every applied write moves the record to the end of the change feed.
    expect(Number(rows[1].seq)).toBeGreaterThan(Number(rows[0].seq));
  });

  it('hides a family from everyone outside it', async () => {
    expect(await as(STRANGER, pullTitles)).toEqual([]);
    await expect(as(STRANGER, () => push(family, [record('x', '2030-01-01T00:00:00.000Z', 'evil')]))).rejects.toThrow(/not_a_member/);
    await expect(as(null, pullTitles)).rejects.toThrow();
    // Direct writes are not allowed, even for members.
    await expect(as(MOM, () => rpc(`insert into public.records values ($1, 'tasks', 'y', 'x', 'x', 1, '{}')`, [family]))).rejects.toThrow();
  });

  it('rejects unknown collections', async () => {
    await expect(
      as(MOM, () => push(family, [{ ...record('z', '2026-10-11T08:00:00.000Z', 'mom'), collection: 'secrets' }])),
    ).rejects.toThrow();
  });

  it('accepts every collection the app syncs', async () => {
    for (const collection of COLLECTIONS) {
      const row = { ...record(`c-${collection}`, '2026-10-11T08:00:00.000Z', 'mom'), collection };
      expect(await as(MOM, () => push(family, [row])), collection).toBe(1);
    }
  });

  it('upgrades a project made with the first schema through the migrations, in any order', async () => {
    // A project created with the first schema: a fixed list of the first ten collections.
    await db.exec(`
      delete from public.records where collection not in
        ('settings', 'categories', 'prepItems', 'babies', 'logs', 'appointments', 'routines', 'routineDone', 'tasks', 'doctorNotes');
      alter table public.records drop constraint records_collection_fkey;
      drop table public.sync_collections;
      alter table public.records add constraint records_collection_check check (collection in
        ('settings', 'categories', 'prepItems', 'babies', 'logs', 'appointments', 'routines', 'routineDone', 'tasks', 'doctorNotes'));
    `);
    const pump = { ...record('p-old', '2026-10-11T08:00:00.000Z', 'mom'), collection: 'pumps' };
    const helper = { ...record('h-old', '2026-10-11T08:00:00.000Z', 'mom'), collection: 'caregivers' };
    // 23514 and 23503 are what the app turns into "the sync server needs an update".
    await expect(as(MOM, () => push(family, [pump]))).rejects.toMatchObject({ code: '23514' });

    await db.exec(migration002);
    await db.exec(migration002);
    expect(await as(MOM, () => push(family, [pump]))).toBe(1);
    await expect(as(MOM, () => push(family, [helper]))).rejects.toMatchObject({ code: '23503' });

    await db.exec(migration003);
    expect(await as(MOM, () => push(family, [helper]))).toBe(1);
    // Running an older migration (or schema.sql) again never takes a collection away.
    await db.exec(migration002);
    await db.exec(schema);
    expect(await as(MOM, () => push(family, [{ ...helper, data: { ...helper.data, updatedAt: '2026-10-11T09:00:00.000Z' } }]))).toBe(1);
  });

  it('keeps push subscriptions per phone and family', async () => {
    const save = (user: string, endpoint: string) =>
      as(user, () =>
        rpc('select public.save_push_subscription($1, $2::jsonb)', [
          family,
          JSON.stringify({ endpoint, p256dh: 'key', auth: 'secret', caregiverId: 'p2', kinds: ['routines'], lang: 'en' }),
        ]),
      );
    await save(MOM, 'https://push.example/mom-phone');
    await save(DAD, 'https://push.example/dad-phone');
    // Saving again updates the same row.
    await save(DAD, 'https://push.example/dad-phone');
    await expect(save(STRANGER, 'https://push.example/stranger')).rejects.toThrow(/not_a_member/);

    const own = await as(DAD, () =>
      rpc<{ endpoint: string; caregiver_id: string; lang: string }>('select * from public.push_subscriptions'),
    );
    expect(own.map((r) => [r.endpoint, r.caregiver_id, r.lang])).toEqual([['https://push.example/dad-phone', 'p2', 'en']]);
    // What was sent is not readable from the app.
    await expect(as(DAD, () => rpc('select * from public.push_sent'))).rejects.toThrow();

    // A phone can only remove its own subscription.
    await as(MOM, () => rpc('select public.delete_push_subscription($1)', ['https://push.example/dad-phone']));
    expect(await as(DAD, () => rpc('select * from public.push_subscriptions'))).toHaveLength(1);
    await as(MOM, () => rpc('select public.delete_push_subscription($1)', ['https://push.example/mom-phone']));
    expect(await as(MOM, () => rpc('select * from public.push_subscriptions'))).toHaveLength(0);
  });

  it('runs migration 004 on an existing project, more than once', async () => {
    await db.exec(migration004);
    await db.exec(migration004);
    const milestone = { ...record('m-1', '2026-10-11T08:00:00.000Z', 'mom'), collection: 'milestones' };
    expect(await as(MOM, () => push(family, [milestone]))).toBe(1);
  });

  it('runs migration 005 on a project from before the roadmap, more than once', async () => {
    const roadmap = ['contractions', 'vaccines', 'motherLogs', 'journal', 'photos', 'foods', 'foodTries', 'reminderSnoozes'];
    // schema.sql (run again by an earlier test) already lists them all.
    const listed = await rpc<{ name: string }>('select name from public.sync_collections');
    expect(listed.map((r) => r.name)).toEqual(expect.arrayContaining(roadmap));
    // A project last updated with migration 004: none of the roadmap collections yet.
    await db.exec(`
      delete from public.records where collection in (${roadmap.map((n) => `'${n}'`).join(', ')});
      delete from public.sync_collections where name in (${roadmap.map((n) => `'${n}'`).join(', ')});
    `);
    const row = (collection: string, updatedAt: string) => ({ ...record(`r-${collection}`, updatedAt, 'mom'), collection });
    await expect(as(MOM, () => push(family, [row('vaccines', '2026-10-11T08:00:00.000Z')]))).rejects.toMatchObject({ code: '23503' });

    await db.exec(migration005);
    await db.exec(migration005);
    for (const collection of roadmap) {
      expect(await as(MOM, () => push(family, [row(collection, '2026-10-11T08:00:00.000Z')])), collection).toBe(1);
    }
    // An older migration run afterwards takes nothing away.
    await db.exec(migration004);
    expect(await as(MOM, () => push(family, [row('photos', '2026-10-11T09:00:00.000Z')]))).toBe(1);
  });

  it('lets a phone leave, which also ends its push reminders', async () => {
    await as(DAD, () => rpc('select public.leave_family($1)', [family]));
    expect(await as(DAD, pullTitles)).toEqual([]);
    expect(await as(DAD, () => rpc('select * from public.push_subscriptions'))).toHaveLength(0);
  });
});
