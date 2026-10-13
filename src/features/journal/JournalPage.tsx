import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { BookHeart, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { Field, Page, TextArea, TextInput, Toggle } from '@/components/ui';
import { useLive, useStore } from '@/data/StoreContext';
import type { JournalEntry } from '@/data/types';
import { dateLocale } from '@/i18n';
import { todayISO } from '@/lib/format';
import type { Who } from '@/features/log/logic';
import { WhoPicker } from '@/features/log/WhoPicker';
import { ScopeBadges } from '@/features/plan/shared';
import { PhotoStrip } from '@/features/photos/PhotoParts';
import { tintFor, useBabies, useTwinName } from '@/features/twins/twins';
import { deleteJournalEntry, journalByMonth } from './logic';

function JournalSheet({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const babies = useBabies();
  const name = useTwinName(babies);
  const [who, setWho] = useState<Who>(entry && entry.babies !== 'none' ? entry.babies : 'both');
  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [text, setText] = useState(entry?.text ?? '');
  const [inBook, setInBook] = useState(entry?.inBook ?? false);
  const [error, setError] = useState(false);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || !date) return setError(true);
    const fields = { date, babies: who, text: text.trim(), inBook };
    if (entry) await store.journal.update(entry.id, fields);
    else await store.journal.create(fields);
    onClose();
  };

  const remove = async () => {
    if (!entry) return;
    if (!(await confirm({ title: t('journal.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    // The entry's photos go with it, and come back with an undo.
    const undo = await deleteJournalEntry(store, entry.id);
    onClose();
    toast({ message: t('journal.deleted'), action: { label: t('common.undo'), onClick: () => void undo() } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry ? t('journal.edit') : t('journal.new')}
      tint={tintFor(babies, who)}
      footer={
        <>
          {entry && (
            <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
              <Trash2 aria-hidden size={20} />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="journal-form" className="flex-1">
            {t('log.saveFor', { name: who === 'both' ? t('twins.both') : name(who) })}
          </Button>
        </>
      }
    >
      <form id="journal-form" onSubmit={save} className="space-y-5" noValidate>
        <WhoPicker babies={babies} value={who} onChange={setWho} />
        <Field label={t('journal.date')}>
          {(p) => <TextInput {...p} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label={t('journal.text')} hint={error ? <span className="text-danger">{t('log.required')}</span> : undefined}>
          {(p) => (
            <TextArea
              {...p}
              rows={5}
              value={text}
              maxLength={4000}
              data-autofocus={!entry || undefined}
              onChange={(e) => {
                setText(e.target.value);
                setError(false);
              }}
            />
          )}
        </Field>
        <Toggle label={t('journal.inBook')} checked={inBook} onChange={setInBook} />
        {entry ? (
          <PhotoStrip owner={{ kind: 'journal', id: entry.id }} babies={who} />
        ) : (
          <p className="text-sm text-muted">{t('journal.photosAfterSave')}</p>
        )}
      </form>
    </Sheet>
  );
}

/** Short entries about the twins, grouped by month; "Put in the book" marks them for the keepsake book. */
export function JournalPage() {
  const { t, i18n } = useTranslation();
  const entries = useLive((s) => s.journal.list(), []);
  const photos = useLive((s) => s.photos.list(), []);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);

  // "Journal entry" from Today's More sheet opens a new entry straight away.
  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing('new');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  if (!entries || !photos) return null;

  const locale = dateLocale(i18n.language);
  const groups = journalByMonth(entries);
  const photoCount = (id: string) => photos.filter((p) => p.owner.kind === 'journal' && p.owner.id === id).length;

  return (
    <Page
      title={t('journal.title')}
      actions={
        <Button variant="secondary" onClick={() => setEditing('new')}>
          <Plus aria-hidden size={18} />
          {t('journal.add')}
        </Button>
      }
    >
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t('journal.empty')}</p>
      ) : (
        groups.map(({ month, entries: list }) => (
          <section key={month} className="space-y-2">
            <h2 className="px-1 text-sm font-semibold tracking-wide text-muted uppercase">
              {format(parseISO(`${month}-01`), 'LLLL yyyy', { locale })}
            </h2>
            <ul className="space-y-2">
              {list.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="block min-h-14 w-full rounded-2xl border border-line bg-surface p-3 text-left"
                  >
                    <span className="mb-1 flex items-center gap-2 text-sm text-muted">
                      <span className="flex-1">{format(parseISO(e.date), 'EEE d MMM', { locale })}</span>
                      {photoCount(e.id) > 0 && <span>{t('journal.photos', { count: photoCount(e.id) })}</span>}
                      {e.inBook && <BookHeart role="img" aria-label={t('journal.inBookShort')} size={16} className="text-accent" />}
                      <ScopeBadges scope={e.babies} />
                    </span>
                    <span className="line-clamp-4 block whitespace-pre-line">{e.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {editing && <JournalSheet entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}
