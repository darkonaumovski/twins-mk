import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { Plus, Star } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Field, Page, Segmented, TextArea, TextInput } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import { todayISO } from '@/lib/format';
import type { Milestone, TwinSlot } from '@/data/types';
import { BABY_IDS, SLOTS, type Who } from '@/features/log/logic';
import { ageInfo } from '@/features/twins/age';
import { colorOf, twinStyle, TwinBadge, useBabies, useTwinName, type Babies } from '@/features/twins/twins';
import { useFormatAgeDays } from '@/features/twins/useAge';
import { PhotoStrip } from '@/features/photos/PhotoParts';
import { milestoneId, milestoneRows, type MilestoneKey, type MilestoneRow } from './logic';

type Editing = { row: MilestoneRow; slot: TwinSlot } | { add: true };

/** "at 6 weeks 2 days · corrected 1 week" for a date, from the twin's birth details. */
function useAgeAt(babies: Babies | undefined) {
  const { t } = useTranslation();
  const fmt = useFormatAgeDays();
  return (slot: TwinSlot, date: string) => {
    const baby = babies?.[slot];
    const info = baby ? ageInfo(baby, parseISO(date)) : null;
    if (!info) return null;
    const actual = t('milestones.atAge', { age: fmt(info.actualDays) });
    if (info.correctedDays === null) return actual;
    return `${actual} · ${info.correctedDays >= 0 ? t('age.corrected', { age: fmt(info.correctedDays) }) : t('age.correctedBefore', { age: fmt(info.correctedDays) })}`;
  };
}

function MilestoneSheet({ editing, babies, onClose }: { editing: Editing; babies: Babies; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const name = useTwinName(babies);
  const existing = 'row' in editing ? editing.row.cells[editing.slot] : undefined;
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<Who>('both');
  const [date, setDate] = useState(existing?.date ?? todayISO());
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState(false);

  const rowTitle =
    'row' in editing ? (editing.row.key ? t(`milestones.keys.${editing.row.key}`) : editing.row.title!) : t('milestones.add');

  /** Creates or updates the record for one twin (reviving a cleared built-in one). */
  const upsert = async (slot: TwinSlot, fields: Pick<Milestone, 'key' | 'title' | 'date' | 'note'>, id?: string) => {
    const all = id ? await store.milestones.listAll() : [];
    const found = id ? all.find((m) => m.id === id) : undefined;
    if (found) {
      if (found.deletedAt) await store.milestones.restore(found.id);
      await store.milestones.update(found.id, fields);
    } else {
      await store.milestones.create({ ...fields, babyId: BABY_IDS[slot], ...(id ? { id } : {}) });
    }
  };

  const save = async () => {
    if (!date) return setError(true);
    if ('add' in editing) {
      if (!title.trim()) return setError(true);
      const slots: TwinSlot[] = who === 'both' ? ['A', 'B'] : [who];
      await store.transaction(async () => {
        for (const slot of slots) await upsert(slot, { key: null, title: title.trim(), date, note: note.trim() });
      });
    } else {
      const { row, slot } = editing;
      const fields = { key: row.key, title: row.key ? '' : row.title!, date, note: note.trim() };
      await upsert(slot, fields, existing?.id ?? (row.key ? milestoneId(row.key, BABY_IDS[slot]) : undefined));
    }
    onClose();
  };

  const clear = async () => {
    if (!existing) return;
    await store.milestones.remove(existing.id);
    onClose();
    toast({
      message: t('milestones.cleared'),
      action: { label: t('common.undo'), onClick: () => void store.milestones.restore(existing.id) },
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={'row' in editing ? `${rowTitle} · ${name(editing.slot)}` : rowTitle}
      tint={'row' in editing ? twinStyle(colorOf(babies, editing.slot)) : undefined}
      footer={
        <>
          {existing && (
            <Button variant="ghost" className="text-danger" onClick={clear}>
              {t('milestones.clear')}
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button className="flex-1" onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {'add' in editing && (
          <>
            <Field label={t('milestones.title')}>
              {(p) => (
                <TextInput
                  {...p}
                  value={title}
                  maxLength={80}
                  placeholder={t('milestones.titlePlaceholder')}
                  data-autofocus
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError(false);
                  }}
                />
              )}
            </Field>
            <Segmented<Who>
              label={t('log.who')}
              value={who}
              options={[
                { value: 'A', label: name('A') },
                { value: 'both', label: t('twins.both') },
                { value: 'B', label: name('B') },
              ]}
              onChange={setWho}
            />
          </>
        )}
        <Field label={t('milestones.date')}>
          {(p) => <TextInput {...p} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label={t('milestones.note')}>
          {(p) => <TextArea {...p} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {existing && 'row' in editing && <PhotoStrip owner={{ kind: 'milestone', id: existing.id }} babies={editing.slot} />}
        {error && (
          <p role="alert" className="font-medium text-danger">
            {t('log.required')}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Firsts for both twins side by side, with the age (and corrected age) on that day. */
export function MilestonesPage() {
  const { t, i18n } = useTranslation();
  const babies = useBabies();
  const name = useTwinName(babies);
  const ageAt = useAgeAt(babies);
  const records = useLive((s) => s.milestones.listAll(), []);
  const [editing, setEditing] = useState<Editing | null>(null);
  if (!babies || !records) return null;

  const locale = dateLocale(i18n.language);
  const rows = milestoneRows(records);
  const label = (row: MilestoneRow) => (row.key ? t(`milestones.keys.${row.key as MilestoneKey}`) : row.title!);

  return (
    <Page
      title={t('milestones.pageTitle')}
      actions={
        <Button variant="secondary" onClick={() => setEditing({ add: true })}>
          <Plus aria-hidden size={18} />
          {t('milestones.addShort')}
        </Button>
      }
    >
      <p className="text-sm text-muted">{t('milestones.intro')}</p>
      <div className="grid grid-cols-2 gap-2 px-1">
        {SLOTS.map((slot) => (
          <p key={slot} className="flex items-center gap-2 font-semibold">
            <TwinBadge slot={slot} color={colorOf(babies, slot)} size="sm" />
            <span className="truncate">{name(slot)}</span>
          </p>
        ))}
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.rowKey} className="rounded-2xl border border-line bg-surface p-3">
            <p className="mb-2 flex items-center gap-2 font-medium">
              <Star aria-hidden size={16} className="shrink-0 text-accent" />
              {label(row)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map((slot) => {
                const m = row.cells[slot];
                const age = m?.date ? ageAt(slot, m.date) : null;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setEditing({ row, slot })}
                    style={twinStyle(colorOf(babies, slot))}
                    aria-label={`${label(row)}, ${name(slot)}: ${m?.date ?? t('milestones.notYet')}`}
                    className={
                      m?.date
                        ? 'min-h-14 rounded-xl border-2 border-(--tw) bg-(--tw-soft) px-2 py-1.5 text-left text-sm'
                        : 'min-h-14 rounded-xl border border-dashed border-line px-2 py-1.5 text-left text-sm text-muted'
                    }
                  >
                    {m?.date ? (
                      <>
                        <span className="block font-semibold text-(--tw-ink)">{format(parseISO(m.date), 'd MMM yyyy', { locale })}</span>
                        {age && <span className="block text-xs text-muted">{age}</span>}
                        {m.note && <span className="block truncate text-xs">{m.note}</span>}
                      </>
                    ) : (
                      t('milestones.notYet')
                    )}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {editing && <MilestoneSheet editing={editing} babies={babies} onClose={() => setEditing(null)} />}
    </Page>
  );
}
