import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isSameDay } from 'date-fns';
import { Mic, MicOff, Pencil } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Field, TextInput } from '@/components/ui';
import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import type { LogEntry, Milk, TwinSlot } from '@/data/types';
import { buzz } from '@/lib/device';
import { newId } from '@/lib/ids';
import { dateLocale } from '@/i18n';
import { useMedGuard } from '@/features/plan/useMeds';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { useDescribeEntry } from './describe';
import { BABY_IDS, babyIdsFor, buildEntries, type Who } from './logic';
import { useLogUI } from './LogUIContext';
import { useRunning } from './useLogActions';
import { parseQuickLog, type QuickItem } from './parse';

type Recognition = {
  lang: string;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** The browser's speech recognition, where there is one. */
export function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Quick text logging: type (or, if switched on, say) a short phrase; the preview shows what was understood
 * and anything that was not. Nothing is saved until Save; Edit opens the normal editor filled in.
 */
export function QuickTextSheet({ who, onClose, onSaved }: { who: Who; onClose: () => void; onSaved?: () => void }) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const ui = useLogUI();
  const prefs = useDevicePrefs();
  const babies = useBabies();
  const name = useTwinName(babies);
  const describe = useDescribeEntry();
  const guard = useMedGuard();
  const running = useRunning();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const Speech = speechRecognition();
  const voice = Boolean(Speech && prefs?.voiceInput);

  const context = useLive(async (s) => {
    const routines = await s.routines.list();
    const lastMilk: Partial<Record<TwinSlot, Milk>> = {};
    for (const slot of ['A', 'B'] as const) {
      const bottle = (await s.logs.recent(BABY_IDS[slot], 'feed', 20)).find((e) => e.type === 'feed' && e.data.method === 'bottle');
      if (bottle?.type === 'feed' && bottle.data.method === 'bottle') lastMilk[slot] = bottle.data.milk;
    }
    return { medNames: routines.flatMap((r) => (r.med?.name ? [r.med.name] : [])), lastMilk };
  }, []);

  useEffect(() => () => recognition.current?.stop(), []);
  if (!babies || !context || !running) return null;

  const now = new Date();
  const parsed = parseQuickLog(text, {
    names: { A: babies.A?.name, B: babies.B?.name },
    medNames: context.medNames,
    now,
    who,
    lastMilk: context.lastMilk,
    asleep: (['A', 'B'] as const).filter((slot) => running.some((r) => r.type === 'sleep' && r.babyId === BABY_IDS[slot])),
  });
  // "Both" saves one entry per twin.
  const count = parsed.items.reduce((n, item) => n + (item.who === 'both' ? 2 : 1), 0);
  const whoName = (w: Who) => (w === 'both' ? t('twins.both') : name(w));
  const line = (item: QuickItem) => {
    if (item.kind === 'wake') return t('quick.wake');
    const { title, detail } = describe({ ...item.draft, babyId: BABY_IDS.A } as LogEntry, now);
    return detail ? `${title} · ${detail}` : title;
  };
  const time = (item: QuickItem) => {
    const at = new Date(item.kind === 'wake' ? item.at : item.draft.start);
    return format(at, isSameDay(at, now) ? 'HH:mm' : 'EEE HH:mm', { locale: dateLocale(i18n.language) });
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!parsed.items.length) return;
    // The same medicine check as the medicine form.
    for (const item of parsed.items) {
      if (item.kind === 'log' && item.draft.type === 'med') {
        const slots: TwinSlot[] = item.who === 'both' ? ['A', 'B'] : [item.who];
        if (!(await guard(slots, item.draft.data.name))) return;
      }
    }
    const loggedBy = prefs?.parent ?? 'p1';
    const created: string[] = [];
    const woke: string[] = [];
    await store.transaction(async () => {
      for (const item of parsed.items) {
        if (item.kind === 'log') {
          const records = await store.logs.createMany(buildEntries(item.who, item.draft, loggedBy, newId));
          created.push(...records.map((r) => r.id));
        } else {
          const ids = babyIdsFor(item.who);
          const sleeping = running.filter((r) => r.type === 'sleep' && r.end === null && ids.includes(r.babyId));
          for (const r of sleeping) {
            // A wake time before the sleep started (a typo, an old phrase) ends it now instead.
            await store.logs.update(r.id, { end: item.at < r.start ? new Date().toISOString() : item.at });
            woke.push(r.id);
          }
        }
      }
    });
    buzz(prefs);
    onClose();
    onSaved?.();
    toast({
      message: t('quick.saved', { count: created.length + woke.length }),
      action: {
        label: t('common.undo'),
        onClick: () =>
          void store.transaction(async () => {
            for (const id of created) await store.logs.remove(id);
            for (const id of woke) await store.logs.update(id, { end: null });
          }),
      },
    });
  };

  const edit = (item: QuickItem) => {
    if (item.kind !== 'log') return;
    onClose();
    ui.prefill(item.draft, item.who);
  };

  const listen = () => {
    if (!Speech) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = i18n.language === 'mk' ? 'mk-MK' : 'en-US';
    r.interimResults = false;
    r.onresult = (e) => {
      const heard = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? '')
        .join(' ')
        .trim();
      // Only into the field: what was heard is shown and saved like typed text.
      if (heard) setText((old) => (old.trim() ? `${old.trim()} ${heard}` : heard));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('quick.title')}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="quick-form" className="flex-1" disabled={!parsed.items.length}>
            {t('quick.save', { count })}
          </Button>
        </>
      }
    >
      <form id="quick-form" onSubmit={save} className="space-y-4" noValidate>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label={t('quick.label')} hint={t('quick.examples')}>
              {(p) => (
                <TextInput
                  {...p}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('quick.placeholder')}
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={200}
                  data-autofocus
                />
              )}
            </Field>
          </div>
          {voice && (
            <IconButton
              label={listening ? t('quick.stopListening') : t('quick.speak')}
              onClick={listen}
              className={listening ? 'mb-7 bg-accent text-on-accent' : 'mb-7 bg-surface-2'}
            >
              {listening ? <MicOff aria-hidden size={22} /> : <Mic aria-hidden size={22} />}
            </IconButton>
          )}
        </div>

        <section aria-live="polite" className="space-y-2">
          {text.trim() !== '' && (
            <>
              {parsed.items.length > 0 && (
                <ul className="space-y-1.5">
                  {parsed.items.map((item, i) => (
                    <li key={i} className="flex min-h-12 items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {whoName(item.who)} · {line(item)}
                        </span>
                        <span className="block text-sm text-muted">{time(item)}</span>
                      </span>
                      {item.kind === 'log' && (
                        <Button variant="ghost" className="min-h-11 min-w-11 px-2" aria-label={t('quick.edit')} onClick={() => edit(item)}>
                          <Pencil aria-hidden size={18} />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {parsed.unknown.length > 0 && <p className="text-sm">{t('quick.unknown', { words: parsed.unknown.join(', ') })}</p>}
              {parsed.hints.map((h) => (
                <p key={h} className="text-sm">
                  {t(`quick.hint.${h}`)}
                </p>
              ))}
              {!parsed.items.length && !parsed.unknown.length && !parsed.hints.length && (
                <p className="text-sm text-muted">{t('quick.nothing')}</p>
              )}
            </>
          )}
        </section>
        {voice && <p className="text-xs text-muted">{t('quick.voiceNote')}</p>}
      </form>
    </Sheet>
  );
}
