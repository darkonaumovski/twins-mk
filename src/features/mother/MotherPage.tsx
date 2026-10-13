import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { Annoyed, Frown, Laugh, Meh, NotebookPen, Pill, Smile, SmilePlus, Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { Field, Page, Section, TextArea, TextInput, Toggle, cx } from '@/components/ui';
import { useDevicePrefs, useLive, useSettings, useStore } from '@/data/StoreContext';
import type { CheckinData, ISODate, Mood, MotherLog } from '@/data/types';
import { dateLocale } from '@/i18n';
import { formatNumber, todayISO } from '@/lib/format';
import { fromLocalInput, toLocalInput } from '@/features/log/logic';
import { daysEnding } from '@/features/history/summary';
import { useNow } from '@/lib/useNow';
import { checkinDate, checkinId, checkins, motherMedsByDay, motherNotes, parseSleepHours, pumpingByDay, saveCheckin } from './logic';
import { MotherMedsList, useGiveMotherMed } from './MotherMeds';

/** Five faces without words: the scale means what the mother wants it to mean. */
const MOODS: { value: Mood; icon: LucideIcon }[] = [
  { value: 1, icon: Frown },
  { value: 2, icon: Annoyed },
  { value: 3, icon: Meh },
  { value: 4, icon: Smile },
  { value: 5, icon: Laugh },
];
const moodIcon = (mood: Mood) => MOODS.find((m) => m.value === mood)?.icon ?? Meh;

function CheckinSheet({ existing, onClose }: { existing: MotherLog | null; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const toast = useToast();
  const data = existing?.type === 'checkin' ? existing.data : null;
  const [date, setDate] = useState<ISODate>(existing ? checkinDate(existing) : todayISO());
  const [mood, setMood] = useState<Mood | null>(data?.mood ?? null);
  const [sleep, setSleep] = useState(data?.sleepHours?.toString().replace('.', ',') ?? '');
  const [note, setNote] = useState(data?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  // A new check-in for a day that already has one opens that day's values, so saving replaces them knowingly.
  const sameDay = useLive(async (s) => (existing ? null : ((await s.motherLogs.get(checkinId(date))) ?? null)), [date, existing]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (sameDay?.type === 'checkin' && loadedFor !== sameDay.id) {
    setLoadedFor(sameDay.id);
    setMood(sameDay.data.mood);
    setSleep(sameDay.data.sleepHours?.toString().replace('.', ',') ?? '');
    setNote(sameDay.data.note);
  }

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const sleepHours = parseSleepHours(sleep);
    if (sleepHours === 'invalid') return setError(t('mother.invalidSleep'));
    if (mood === null || !date) return setError(t('log.required'));
    const record: CheckinData = { mood, sleepHours, note: note.trim() };
    await saveCheckin(store.motherLogs, date, record, prefs?.parent ?? 'p1');
    toast({ message: t('mother.checkinSaved') });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('mother.checkin')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="checkin-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="checkin-form" onSubmit={save} className="space-y-5" noValidate>
        <Field label={t('mother.checkinDate')}>
          {(p) => (
            // An existing check-in keeps its day (its id is the day); a different day is a new check-in.
            <TextInput
              {...p}
              type="date"
              value={date}
              max={todayISO()}
              readOnly={Boolean(existing)}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </Field>
        <fieldset>
          <legend className="mb-1.5 font-medium">{t('mother.mood')}</legend>
          <div className="grid grid-cols-5 gap-2">
            {MOODS.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mood === value}
                aria-label={t('mother.moodN', { n: value })}
                onClick={() => {
                  setMood(value);
                  setError(null);
                }}
                className={cx(
                  'flex min-h-14 items-center justify-center rounded-xl border-2 transition',
                  mood === value ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-muted',
                )}
              >
                <Icon aria-hidden size={28} />
              </button>
            ))}
          </div>
        </fieldset>
        <Field label={t('mother.sleepHours')}>
          {(p) => (
            <TextInput
              {...p}
              inputMode="decimal"
              value={sleep}
              onChange={(e) => {
                setSleep(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Field label={t('mother.checkinNote')}>
          {(p) => <TextArea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}
        </Field>
        <p className="text-sm text-muted">{t('mother.checkinHint')}</p>
        {error && (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

/** A medicine dose (new or to edit) or a note. */
function EntrySheet({ kind, existing, onClose }: { kind: 'med' | 'note'; existing: MotherLog | null; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const confirm = useConfirm();
  const toast = useToast();
  const give = useGiveMotherMed();
  const med = existing?.type === 'med' ? existing.data : null;
  const [name, setName] = useState(med?.name ?? '');
  const [dose, setDose] = useState(med?.dose ?? '');
  const [text, setText] = useState(existing?.type === 'note' ? existing.data.text : '');
  const [start, setStart] = useState(toLocalInput(existing?.start ?? new Date().toISOString()));
  const [error, setError] = useState(false);
  const names = useLive(async (s) => {
    const [routines, logs] = await Promise.all([s.routines.list(), s.motherLogs.list()]);
    const fromRoutines = routines.filter((r) => r.babies === 'none' && r.med).map((r) => r.med!.name);
    const fromLogs = logs.flatMap((m) => (m.type === 'med' ? [m.data.name] : []));
    return [...new Set([...fromRoutines, ...fromLogs])];
  }, []);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const at = fromLocalInput(start);
    if (!at || (kind === 'med' ? !name.trim() : !text.trim())) return setError(true);
    if (existing) {
      const data = kind === 'med' ? { name: name.trim(), dose: dose.trim() } : { text: text.trim() };
      await store.motherLogs.update(existing.id, { start: at, data } as Partial<MotherLog>);
    } else if (kind === 'med') {
      await give(name.trim(), dose.trim(), at);
    } else {
      await store.motherLogs.create({ type: 'note', start: at, data: { text: text.trim() }, loggedBy: prefs?.parent ?? 'p1' });
    }
    onClose();
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirm({ title: t('mother.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.motherLogs.remove(existing.id);
    onClose();
    toast({ message: t('mother.deleted'), action: { label: t('common.undo'), onClick: () => void store.motherLogs.restore(existing.id) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={kind === 'med' ? t('mother.medTitle') : t('mother.noteTitle')}
      footer={
        <>
          {existing && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="mother-entry-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="mother-entry-form" onSubmit={save} className="space-y-5" noValidate>
        {kind === 'med' ? (
          <>
            <Field label={t('log.medName')} hint={error ? <span className="text-danger">{t('log.required')}</span> : undefined}>
              {(p) => (
                <>
                  <TextInput
                    {...p}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(false);
                    }}
                    list="mother-med-names"
                    autoComplete="off"
                    maxLength={80}
                    data-autofocus={!existing || undefined}
                  />
                  <datalist id="mother-med-names">
                    {names?.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label={t('log.dose')}>
              {(p) => <TextInput {...p} value={dose} onChange={(e) => setDose(e.target.value)} maxLength={80} />}
            </Field>
          </>
        ) : (
          <Field label={t('mother.note')} hint={error ? <span className="text-danger">{t('log.required')}</span> : undefined}>
            {(p) => (
              <TextArea
                {...p}
                rows={4}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(false);
                }}
                maxLength={2000}
                data-autofocus={!existing || undefined}
              />
            )}
          </Field>
        )}
        <Field label={t('log.time')}>
          {(p) => <TextInput {...p} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
      </form>
    </Sheet>
  );
}

type Editing = { checkin: MotherLog | null } | { kind: 'med' | 'note'; entry: MotherLog | null };

/** The mother's page: her medicines, check-ins (the only place the mood is shown), notes and pumping. */
export function MotherPage() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const settings = useSettings();
  const now = useNow(60_000);
  const days = daysEnding(todayISO(now), 7);
  const data = useLive(async (s) => ({ logs: await s.motherLogs.list(), pumps: await s.pumps.list() }), []);
  const [editing, setEditing] = useState<Editing | null>(null);
  if (!data || !settings) return null;

  const locale = dateLocale(i18n.language);
  const dayLabel = (d: ISODate) => format(parseISO(d), 'EEE d MMM', { locale });
  const time = (iso: string) => format(new Date(iso), 'HH:mm', { locale });
  const today = data.logs.find((m) => m.id === checkinId(todayISO(now)));

  return (
    <Page title={t('mother.title')}>
      <p className="text-sm text-muted">{t('mother.intro')}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => setEditing({ checkin: today ?? null })} className="px-2">
          <SmilePlus aria-hidden size={20} />
          <span className="truncate">{t('mother.checkinShort')}</span>
        </Button>
        <Button variant="secondary" onClick={() => setEditing({ kind: 'med', entry: null })} className="px-2">
          <Pill aria-hidden size={20} />
          <span className="truncate">{t('mother.logMed')}</span>
        </Button>
        <Button variant="secondary" onClick={() => setEditing({ kind: 'note', entry: null })} className="px-2">
          <NotebookPen aria-hidden size={20} />
          <span className="truncate">{t('mother.note')}</span>
        </Button>
      </div>

      <Section title={t('mother.medsToday')}>
        <MotherMedsList now={now} />
      </Section>

      <Section title={t('mother.checkins')}>
        {checkins(data.logs).length === 0 ? (
          <p className="text-sm text-muted">{t('mother.noCheckins')}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {checkins(data.logs).map((c) => {
              const Icon = moodIcon(c.data.mood);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setEditing({ checkin: c })}
                    className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                  >
                    <Icon role="img" aria-label={t('mother.moodN', { n: c.data.mood })} size={24} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{dayLabel(checkinDate(c))}</span>
                      {(c.data.sleepHours !== null || c.data.note) && (
                        <span className="block truncate text-sm text-muted">
                          {[
                            c.data.sleepHours !== null ? t('mother.sleepShort', { h: formatNumber(c.data.sleepHours, i18n.language) }) : '',
                            c.data.note,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('mother.week')}>
        <ul className="-my-1 divide-y divide-line">
          {motherMedsByDay(data.logs, days).map(({ date, doses }) => (
            <li key={date} className="py-2">
              <p className="text-sm font-semibold">{dayLabel(date)}</p>
              {doses.length === 0 ? (
                <p className="text-sm text-muted">{t('mother.nothing')}</p>
              ) : (
                <ul>
                  {doses.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: 'med', entry: d })}
                        className="flex min-h-11 w-full items-center gap-2 text-left text-sm"
                      >
                        <span className="w-12 shrink-0 tabular-nums text-muted">{time(d.start)}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {d.data.name}
                          {d.data.dose && <span className="text-muted"> · {d.data.dose}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('mother.notes')}>
        {motherNotes(data.logs).length === 0 ? (
          <p className="text-sm text-muted">{t('mother.noNotes')}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {motherNotes(data.logs).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ kind: 'note', entry: n })}
                  className="block min-h-12 w-full py-2 text-left"
                >
                  <span className="block text-sm text-muted">{format(new Date(n.start), 'EEE d MMM HH:mm', { locale })}</span>
                  <span className="block whitespace-pre-line">{n.data.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t('mother.pumping')}>
        <ul className="-my-1 divide-y divide-line">
          {pumpingByDay(data.pumps, days).map(({ date, sessions, ml }) => (
            <li key={date} className="flex min-h-10 items-center justify-between gap-2 py-1.5 text-sm">
              <span className="font-medium">{dayLabel(date)}</span>
              <span className="text-muted tabular-nums">
                {sessions === 0 ? t('mother.nothing') : t('mother.pumpDay', { count: sessions, ml })}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('mother.settings')}>
        <Toggle
          label={t('mother.cardSetting')}
          checked={settings.motherCard}
          onChange={(v) => void store.settings.update({ motherCard: v })}
        />
        <div>
          <Toggle
            label={t('mother.announceSetting')}
            checked={settings.announceMother}
            onChange={(v) => void store.settings.update({ announceMother: v })}
          />
          <p className="text-sm text-muted">{t('mother.announceHint')}</p>
        </div>
      </Section>

      {editing &&
        ('checkin' in editing ? (
          <CheckinSheet key={editing.checkin?.id ?? 'new'} existing={editing.checkin} onClose={() => setEditing(null)} />
        ) : (
          <EntrySheet kind={editing.kind} existing={editing.entry} onClose={() => setEditing(null)} />
        ))}
    </Page>
  );
}
