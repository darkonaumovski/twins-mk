import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Field, Segmented, TextArea, TextInput, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import { isTimed } from '@/data/logTypes';
import { parseAmount } from '@/features/checklist/logic';
import { colorOf, tintFor, twinStyle, useBabies, useTwinName } from '@/features/twins/twins';
import { useParentName } from '@/lib/parents';
import { useFormatAgo } from '@/lib/useNow';
import { medCheck } from '@/features/plan/logic';
import { useMedData, useMedGuard } from '@/features/plan/useMeds';
import type { DiaperData, FeedData, LogEntry, LogType, Milk, SpitupData } from '@/data/types';
import { BABY_IDS, fromLocalInput, slotOf, toLocalInput, type LogDraft, type Who } from './logic';
import { useLogActions } from './useLogActions';
import { WhoPicker } from './WhoPicker';
import type { FormType } from './LogUIContext';

type Side = Extract<FeedData, { method: 'breast' }>['side'];

interface Draft {
  type: LogType;
  babyId: string;
  start: string;
  end: string;
  running: boolean;
  feedMethod: FeedData['method'];
  side: Side;
  ml: number;
  milk: Milk;
  topUpOn: boolean;
  topUpMl: number;
  topUpMilk: Milk;
  diaper: DiaperData['kind'];
  medName: string;
  dose: string;
  weight: string;
  length: string;
  text: string;
  celsius: string;
  spit: SpitupData['size'];
  tummyMin: number;
}

/** Plausible body temperatures; only catches typing mistakes such as 375 for 37,5. */
const TEMP_MIN = 30;
const TEMP_MAX = 45;

const hourAgo = () => new Date(Date.now() - 3600_000).toISOString();

function draftFrom(entry: LogEntry | null, type: LogType): Draft {
  const now = new Date().toISOString();
  const d: Draft = {
    type,
    babyId: entry?.babyId ?? BABY_IDS.A,
    start: toLocalInput(entry?.start ?? (type === 'sleep' ? hourAgo() : now)),
    end: toLocalInput(entry?.end ?? now),
    running: entry ? entry.end === null : false,
    feedMethod: 'breast',
    side: 'left',
    ml: 60,
    milk: 'breast',
    topUpOn: false,
    topUpMl: 30,
    topUpMilk: 'formula',
    diaper: 'wet',
    medName: '',
    dose: '',
    weight: '',
    length: '',
    text: '',
    celsius: '',
    spit: 'small',
    tummyMin: 5,
  };
  if (!entry) return d;
  switch (entry.type) {
    case 'feed':
      d.feedMethod = entry.data.method;
      if (entry.data.method === 'breast') {
        d.side = entry.data.side;
        if (entry.data.topUp) Object.assign(d, { topUpOn: true, topUpMl: entry.data.topUp.ml, topUpMilk: entry.data.topUp.milk });
      } else Object.assign(d, { ml: entry.data.ml, milk: entry.data.milk });
      break;
    case 'diaper':
      d.diaper = entry.data.kind;
      break;
    case 'med':
      Object.assign(d, { medName: entry.data.name, dose: entry.data.dose });
      break;
    case 'measure':
      d.weight = entry.data.weightG?.toString() ?? '';
      d.length = entry.data.lengthCm?.toString().replace('.', ',') ?? '';
      break;
    case 'note':
      d.text = entry.data.text;
      break;
    case 'temp':
      d.celsius = entry.data.celsius.toString().replace('.', ',');
      break;
    case 'spitup':
      d.spit = entry.data.size;
      break;
    case 'tummy':
      d.tummyMin = entry.data.minutes;
      break;
  }
  return d;
}

type Props = { onClose: () => void } & ({ mode: 'create'; type: FormType; who: Who } | { mode: 'edit'; entry: LogEntry });

export function EntryEditor(props: Props) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const babies = useBabies();
  const name = useTwinName(babies);
  const parentName = useParentName();
  const { log } = useLogActions();
  const medData = useMedData();
  const medGuard = useMedGuard();
  const ago = useFormatAgo();
  const entry = props.mode === 'edit' ? props.entry : null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(entry, props.mode === 'edit' ? props.entry.type : props.type));
  const [who, setWho] = useState<Who>(props.mode === 'create' ? props.who : 'A');
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };

  // Earlier medicine names, offered as suggestions.
  const medNames = useLive(
    async (s) => {
      if (draft.type !== 'med') return [];
      const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
      const meds = (await s.logs.listBetween(since, new Date(Date.now() + 60_000).toISOString())).filter((e) => e.type === 'med');
      return [...new Set(meds.map((e) => (e.type === 'med' ? e.data.name : '')).filter(Boolean))];
    },
    [draft.type],
  );

  const timed = draft.type === 'sleep' || (draft.type === 'feed' && draft.feedMethod === 'breast') || (entry !== null && isTimed(entry));
  const titleKey = {
    feed: 'log.feed',
    diaper: 'log.diaper',
    sleep: 'log.sleep',
    med: 'log.med',
    measure: 'log.measure',
    note: 'log.note',
    temp: 'log.temp',
    spitup: 'log.spitup',
    bath: 'log.bath',
    tummy: 'log.tummy',
  } as const;

  const buildDraft = (): LogDraft | string => {
    const start = fromLocalInput(draft.start);
    if (!start) return t('log.required');
    let end: string | null = null;
    if (timed && !draft.running) {
      end = fromLocalInput(draft.end);
      if (!end) return t('log.required');
      if (end <= start) return t('log.endBeforeStart');
    }
    switch (draft.type) {
      case 'feed':
        return draft.feedMethod === 'breast'
          ? {
              type: 'feed',
              data: draft.topUpOn
                ? { method: 'breast', side: draft.side, topUp: { ml: draft.topUpMl, milk: draft.topUpMilk } }
                : { method: 'breast', side: draft.side },
              start,
              end,
            }
          : { type: 'feed', data: { method: 'bottle', ml: draft.ml, milk: draft.milk }, start, end: null };
      case 'diaper':
        return { type: 'diaper', data: { kind: draft.diaper }, start, end: null };
      case 'sleep':
        return { type: 'sleep', data: {}, start, end };
      case 'med':
        if (!draft.medName.trim()) return t('log.required');
        return { type: 'med', data: { name: draft.medName.trim(), dose: draft.dose.trim() }, start, end: null };
      case 'measure': {
        const weightG = draft.weight.trim() ? parseAmount(draft.weight) : null;
        const lengthCm = draft.length.trim() ? parseAmount(draft.length) : null;
        if (weightG === null && lengthCm === null) return t('log.measureEmpty');
        return { type: 'measure', data: { weightG: weightG === null ? null : Math.round(weightG), lengthCm }, start, end: null };
      }
      case 'note':
        if (!draft.text.trim()) return t('log.required');
        return { type: 'note', data: { text: draft.text.trim() }, start, end: null };
      case 'temp': {
        const celsius = parseAmount(draft.celsius);
        if (celsius === null || celsius < TEMP_MIN || celsius > TEMP_MAX) return t('log.tempInvalid');
        return { type: 'temp', data: { celsius: Math.round(celsius * 10) / 10 }, start, end: null };
      }
      case 'spitup':
        return { type: 'spitup', data: { size: draft.spit }, start, end: null };
      case 'bath':
        return { type: 'bath', data: {}, start, end: null };
      case 'tummy':
        return { type: 'tummy', data: { minutes: draft.tummyMin }, start, end: null };
    }
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const result = buildDraft();
    if (typeof result === 'string') {
      setError(result);
      return;
    }
    if (entry) {
      await store.logs.update(entry.id, { ...result, babyId: draft.babyId } as Partial<LogEntry>);
    } else {
      if (result.type === 'med' && !(await medGuard(who === 'both' ? ['A', 'B'] : [who], result.data.name))) return;
      await log(who, result, t(titleKey[draft.type]));
    }
    props.onClose();
  };

  const remove = async () => {
    if (!entry) return;
    const ok = await confirm({ title: t('log.deleteConfirm'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    await store.logs.remove(entry.id);
    props.onClose();
    toast({ message: t('log.deleted'), action: { label: t('common.undo'), onClick: () => void store.logs.restore(entry.id) } });
  };

  const forWho = entry ? name(draft.babyId) : who === 'both' ? t('twins.both') : name(who);
  const tint = entry ? twinStyle(colorOf(babies, slotOf(draft.babyId))) : tintFor(babies, who);

  return (
    <Sheet
      open
      onClose={props.onClose}
      tint={tint}
      title={entry ? t('log.editEntry') : t(titleKey[draft.type])}
      footer={
        <>
          {entry && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="entry-form" className="flex-1">
            {t('log.saveFor', { name: forWho })}
          </Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={save} className="space-y-5" noValidate>
        {entry ? (
          <>
            <p className="text-sm text-muted">{t('log.by', { name: parentName(entry.loggedBy) })}</p>
            {entry.groupId && (
              <p className="flex gap-2 text-sm text-muted">
                <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
                {t('log.groupNote', { name: name(entry.babyId) })}
              </p>
            )}
            <Segmented
              label={t('log.baby')}
              value={slotOf(draft.babyId)}
              options={[
                { value: 'A', label: name('A') },
                { value: 'B', label: name('B') },
              ]}
              onChange={(slot) => set('babyId', BABY_IDS[slot])}
            />
          </>
        ) : (
          <WhoPicker babies={babies} value={who} onChange={setWho} />
        )}

        {draft.type === 'feed' && (
          <>
            <Segmented
              label={t('log.feed')}
              value={draft.feedMethod}
              options={[
                { value: 'breast', label: t('log.breast') },
                { value: 'bottle', label: t('log.bottle') },
              ]}
              onChange={(m) => set('feedMethod', m)}
            />
            {draft.feedMethod === 'breast' ? (
              <Segmented<Side>
                label={t('log.side')}
                value={draft.side}
                options={[
                  { value: 'left', label: t('log.left') },
                  { value: 'right', label: t('log.right') },
                  { value: 'both', label: t('log.bothSides') },
                ]}
                onChange={(s) => set('side', s)}
              />
            ) : null}
            {draft.feedMethod === 'breast' ? (
              <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
                <Toggle label={t('log.topUp')} checked={draft.topUpOn} onChange={(v) => set('topUpOn', v)} />
                {draft.topUpOn && (
                  <>
                    <Stepper label={t('log.amount')} value={draft.topUpMl} min={5} max={300} step={5} onChange={(v) => set('topUpMl', v)} />
                    <Segmented<Milk>
                      label={t('log.milk')}
                      value={draft.topUpMilk}
                      options={[
                        { value: 'breast', label: t('log.breastMilk') },
                        { value: 'formula', label: t('log.formula') },
                      ]}
                      onChange={(m) => set('topUpMilk', m)}
                    />
                  </>
                )}
              </div>
            ) : (
              <>
                <Stepper label={t('log.amount')} value={draft.ml} min={5} max={500} step={5} onChange={(v) => set('ml', v)} />
                <Segmented<Milk>
                  label={t('log.milk')}
                  value={draft.milk}
                  options={[
                    { value: 'breast', label: t('log.breastMilk') },
                    { value: 'formula', label: t('log.formula') },
                  ]}
                  onChange={(m) => set('milk', m)}
                />
              </>
            )}
          </>
        )}

        {draft.type === 'diaper' && (
          <Segmented<DiaperData['kind']>
            label={t('log.diaper')}
            value={draft.diaper}
            options={[
              { value: 'wet', label: t('log.wet') },
              { value: 'dirty', label: t('log.dirty') },
              { value: 'both', label: t('log.wetDirty') },
            ]}
            onChange={(k) => set('diaper', k)}
          />
        )}

        {draft.type === 'med' && (
          <>
            <Field label={t('log.medName')}>
              {(p) => (
                <>
                  <TextInput
                    {...p}
                    value={draft.medName}
                    onChange={(e) => set('medName', e.target.value)}
                    list="med-names"
                    autoComplete="off"
                    maxLength={80}
                    data-autofocus={!entry || undefined}
                  />
                  <datalist id="med-names">
                    {medNames?.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            {!entry && draft.medName.trim() && medData && (
              <ul className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
                {(who === 'both' ? (['A', 'B'] as const) : [who]).map((slot) => {
                  const check = medCheck(medData.logs, slot, draft.medName, medData.routines, new Date());
                  return (
                    <li key={slot} className={check.warn ? 'font-semibold text-danger' : 'text-muted'}>
                      {check.lastAt
                        ? t('med.lastGiven', { name: name(slot), when: ago(check.lastAt) })
                        : t('med.neverGiven', { name: name(slot) })}
                      {check.minIntervalHours !== null && ` · ${t('med.yourInterval', { hours: check.minIntervalHours })}`}
                    </li>
                  );
                })}
              </ul>
            )}
            <Field label={t('log.dose')}>
              {(p) => <TextInput {...p} value={draft.dose} onChange={(e) => set('dose', e.target.value)} maxLength={80} />}
            </Field>
          </>
        )}

        {draft.type === 'measure' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('log.weightG')}>
              {(p) => <TextInput {...p} inputMode="numeric" value={draft.weight} onChange={(e) => set('weight', e.target.value)} />}
            </Field>
            <Field label={t('log.lengthCm')}>
              {(p) => <TextInput {...p} inputMode="decimal" value={draft.length} onChange={(e) => set('length', e.target.value)} />}
            </Field>
          </div>
        )}

        {draft.type === 'note' && (
          <Field label={t('log.noteText')}>
            {(p) => (
              <TextArea
                {...p}
                rows={4}
                value={draft.text}
                onChange={(e) => set('text', e.target.value)}
                maxLength={2000}
                data-autofocus={!entry || undefined}
              />
            )}
          </Field>
        )}

        {draft.type === 'temp' && (
          <Field label={t('log.tempC')}>
            {(p) => (
              <TextInput
                {...p}
                inputMode="decimal"
                value={draft.celsius}
                onChange={(e) => set('celsius', e.target.value)}
                placeholder="37,0"
                data-autofocus={!entry || undefined}
              />
            )}
          </Field>
        )}

        {draft.type === 'spitup' && (
          <Segmented<SpitupData['size']>
            label={t('log.spitup')}
            value={draft.spit}
            options={[
              { value: 'small', label: t('log.spitSmall') },
              { value: 'large', label: t('log.spitLarge') },
            ]}
            onChange={(v) => set('spit', v)}
          />
        )}

        {draft.type === 'tummy' && (
          <Stepper label={t('log.minutes')} value={draft.tummyMin} min={1} max={120} onChange={(v) => set('tummyMin', v)} />
        )}

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Field label={timed ? t('log.start') : t('log.time')}>
            {(p) => <TextInput {...p} type="datetime-local" value={draft.start} onChange={(e) => set('start', e.target.value)} />}
          </Field>
          {timed && !draft.running && (
            <Field label={t('log.end')}>
              {(p) => <TextInput {...p} type="datetime-local" value={draft.end} onChange={(e) => set('end', e.target.value)} />}
            </Field>
          )}
        </div>
        {timed && entry && <Toggle label={t('log.stillRunning')} checked={draft.running} onChange={(v) => set('running', v)} />}

        {error && (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
