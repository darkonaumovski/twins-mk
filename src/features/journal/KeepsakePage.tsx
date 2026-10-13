import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { Printer } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, Page, TextInput, Toggle } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import type { BabyScope, Photo, TwinSlot } from '@/data/types';
import { dateLocale } from '@/i18n';
import { formatNumber, todayISO } from '@/lib/format';
import { SLOTS } from '@/features/log/logic';
import { usePhotoImage } from '@/features/photos/usePhotoImage';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { useFormatAgeDays } from '@/features/twins/useAge';
import { buildBook, type BookMilestoneCell } from './book';
import { useFirstFoods } from './useFirstFoods';

/** A photo in the book: the full image where it can be had, kept small enough to print several on a page. */
function BookPhoto({ photo, alt, onSettled }: { photo: Photo | undefined; alt: string; onSettled: (id: string) => void }) {
  const image = usePhotoImage(photo ?? { id: '', uploaded: false }, 'full', Boolean(photo));
  const id = photo?.id;
  // Tell the page once this photo is ready (or not to be had), so Print waits for it.
  useEffect(() => {
    if (id && image.state !== 'loading') onSettled(id);
  }, [id, image.state, onSettled]);
  if (!photo || image.state !== 'ready') return null;
  return <img src={image.url} alt={alt} className="max-h-56 w-auto max-w-full rounded-lg object-contain print:max-h-[70mm]" />;
}

const cell = 'border border-line px-2 py-1.5 align-top text-left';
const head = 'border border-line bg-surface-2 px-2 py-1.5 text-left font-semibold';

/**
 * The keepsake book: a printable A4 page made from the data. Cover, birth details, milestones side by side,
 * a page per month (the monthly photo and the journal entries put in the book) and the first foods.
 * "Print / Save as PDF" as for the doctor's report; it reads well in black and white.
 */
export function KeepsakePage() {
  const { t, i18n } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const fmtAge = useFormatAgeDays();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const onSettled = useCallback((id: string) => setSettled((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const firstFoods = useFirstFoods();
  const data = useLive(
    async (s) => ({ milestones: await s.milestones.listAll(), journal: await s.journal.listAll(), photos: await s.photos.listAll() }),
    [],
  );
  if (!babies || !data) return null;

  const locale = dateLocale(i18n.language);
  const book = buildBook(
    { babies: { A: babies.A, B: babies.B }, ...data, firstFoods: firstFoods ?? [] },
    { from: from || null, to: to || null, includePhotos },
  );
  const photoById = new Map(data.photos.map((p) => [p.id, p]));
  const day = (date: string) => format(parseISO(date), 'd MMMM yyyy', { locale });
  const who = (babies: BabyScope) => (babies === 'both' ? t('twins.both') : babies === 'none' ? '' : name(babies));
  const milestoneTitle = (key: string | null, title: string | null) => (key ? t(`milestones.keys.${key}` as never) : (title ?? ''));
  const names = SLOTS.map((s) => book.cover.names[s]).filter((n): n is string => Boolean(n));
  const coverTitle = names.length === 2 ? t('book.names', { a: names[0], b: names[1] }) : (names[0] ?? t('book.twins'));
  const badRange = Boolean(from && to && from > to);
  // Print waits until every photo in the book is loaded (or known to be missing).
  const photoIds = [
    ...book.milestones.flatMap((m) => SLOTS.flatMap((s) => m.cells[s]?.photoIds ?? [])),
    ...book.months.flatMap((m) => [...m.photoIds, ...m.entries.flatMap((e) => e.photoIds)]),
  ];
  const loading = photoIds.filter((id) => photoById.has(id) && !settled.has(id)).length;

  const age = (c: BookMilestoneCell) =>
    [
      c.ageDays !== null ? t('milestones.atAge', { age: fmtAge(c.ageDays) }) : '',
      c.correctedDays !== null
        ? c.correctedDays >= 0
          ? t('age.corrected', { age: fmtAge(c.correctedDays) })
          : t('age.correctedBefore', { age: fmtAge(c.correctedDays) })
        : '',
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <Page title={t('book.title')}>
      <div className="space-y-4 print:hidden">
        <p className="text-sm text-muted">{t('book.intro')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('book.from')}>
            {(p) => <TextInput {...p} type="date" value={from} max={to || todayISO()} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label={t('book.to')}>
            {(p) => <TextInput {...p} type="date" value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} />}
          </Field>
        </div>
        {badRange && (
          <p role="alert" className="font-medium text-danger">
            {t('book.badRange')}
          </p>
        )}
        <Toggle label={t('book.includePhotos')} checked={includePhotos} onChange={setIncludePhotos} />
        <Button className="w-full" onClick={() => window.print()} disabled={loading > 0} aria-busy={loading > 0}>
          <Printer aria-hidden size={20} />
          {loading > 0 ? t('book.loadingPhotos', { count: loading }) : t('report.print')}
        </Button>
        <p className="text-sm text-muted">{t('report.printHint')}</p>
      </div>

      <article className="space-y-8 text-ink print:space-y-0 print:text-[11pt]">
        <section className="flex min-h-[40vh] flex-col items-center justify-center gap-3 border-y border-line py-10 text-center print:min-h-[250mm] print:break-after-page print:border-0">
          <h2 className="text-3xl font-bold">{coverTitle}</h2>
          {book.cover.birthDate && <p className="text-lg">{t('book.born', { date: day(book.cover.birthDate) })}</p>}
        </section>

        {book.births.length > 0 && (
          <section className="space-y-2 print:break-inside-avoid print:pt-4">
            <h3 className="text-xl font-semibold">{t('book.birth')}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={head} />
                  {book.births.map((b) => (
                    <th key={b.slot} className={head}>
                      {b.name || name(b.slot)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className={head}>{t('book.time')}</th>
                  {book.births.map((b) => (
                    <td key={b.slot} className={cell}>
                      {b.birthDateTime ? format(new Date(b.birthDateTime), 'd MMM yyyy, HH:mm', { locale }) : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className={head}>{t('book.weight')}</th>
                  {book.births.map((b) => (
                    <td key={b.slot} className={cell}>
                      {b.weightG ? t('log.summary.weight', { g: b.weightG }) : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className={head}>{t('book.length')}</th>
                  {book.births.map((b) => (
                    <td key={b.slot} className={cell}>
                      {b.lengthCm ? t('log.summary.length', { cm: formatNumber(b.lengthCm, i18n.language) }) : '–'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className={head}>{t('book.week')}</th>
                  {book.births.map((b) => (
                    <td key={b.slot} className={cell}>
                      {b.gestation ? t('book.gestation', { weeks: b.gestation.weeks, days: b.gestation.days }) : '–'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {book.milestones.length > 0 && (
          <section className="space-y-2 print:pt-6">
            <h3 className="text-xl font-semibold">{t('book.milestones')}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={head} />
                  {SLOTS.map((s) => (
                    <th key={s} className={head}>
                      {name(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.milestones.map((m) => (
                  <tr key={m.key ?? m.title ?? ''} className="break-inside-avoid">
                    <th className={head}>{milestoneTitle(m.key, m.title)}</th>
                    {SLOTS.map((s: TwinSlot) => {
                      const c = m.cells[s];
                      return (
                        <td key={s} className={cell}>
                          {c ? (
                            <div className="space-y-1">
                              <p className="font-semibold">{day(c.date)}</p>
                              {age(c) && <p className="text-muted">{age(c)}</p>}
                              {c.note && <p>{c.note}</p>}
                              {c.photoIds.map((id) => (
                                <BookPhoto
                                  key={id}
                                  photo={photoById.get(id)}
                                  alt={`${milestoneTitle(m.key, m.title)} · ${name(s)}`}
                                  onSettled={onSettled}
                                />
                              ))}
                            </div>
                          ) : (
                            '–'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {book.months.map((m) => (
          <section key={m.month} className="space-y-3 border-t border-line pt-6 print:break-before-page print:border-0">
            <h3 className="text-2xl font-semibold capitalize">{format(parseISO(`${m.month}-01`), 'LLLL yyyy', { locale })}</h3>
            {m.photoIds.map((id) => (
              <BookPhoto key={id} photo={photoById.get(id)} alt={t('photos.owner.monthly')} onSettled={onSettled} />
            ))}
            {m.entries.map((e) => (
              <div key={e.id} className="space-y-1 break-inside-avoid">
                <p className="text-sm font-semibold">
                  {day(e.date)}
                  {who(e.babies) && ` · ${who(e.babies)}`}
                </p>
                <p className="whitespace-pre-line">{e.text}</p>
                {e.photoIds.map((id) => (
                  <BookPhoto key={id} photo={photoById.get(id)} alt={day(e.date)} onSettled={onSettled} />
                ))}
              </div>
            ))}
          </section>
        ))}

        {book.firstFoods.length > 0 && (
          <section className="space-y-2 border-t border-line pt-6 print:break-before-page print:border-0">
            <h3 className="text-xl font-semibold">{t('book.firstFoods')}</h3>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={head} />
                  {SLOTS.map((s) => (
                    <th key={s} className={head}>
                      {name(s)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.firstFoods.map((f) => (
                  <tr key={f.name} className="break-inside-avoid">
                    <th className={head}>{f.name}</th>
                    {SLOTS.map((s) => (
                      <td key={s} className={cell}>
                        {f.dates[s] ? day(f.dates[s]!) : '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {book.milestones.length === 0 && book.months.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted print:hidden">{t('book.empty')}</p>
        )}
      </article>
    </Page>
  );
}
