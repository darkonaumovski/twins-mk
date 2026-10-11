import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/Button';
import { Page, TextArea, cx } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useLive, useStore } from '@/data/StoreContext';
import { dateLocale } from '@/i18n';
import type { BabyScope, DoctorNote } from '@/data/types';
import { ScopeBadges, ScopePicker } from '@/features/plan/shared';

function NoteRow({ note }: { note: DoctorNote }) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const discussed = note.reviewedAt !== null;

  const remove = async () => {
    if (!(await confirm({ title: t('notes.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.doctorNotes.remove(note.id);
    toast({ message: t('notes.deleted'), action: { label: t('common.undo'), onClick: () => void store.doctorNotes.restore(note.id) } });
  };

  return (
    <div className="flex items-start gap-1 py-2 pr-1 pl-2">
      <IconButton
        label={discussed ? t('notes.markOpen') : t('notes.markDiscussed')}
        aria-pressed={discussed}
        onClick={() => store.doctorNotes.update(note.id, { reviewedAt: discussed ? null : new Date().toISOString() })}
        className={discussed ? 'text-ok' : 'text-muted'}
      >
        {discussed ? <CheckCircle2 aria-hidden size={24} /> : <Circle aria-hidden size={24} />}
      </IconButton>
      <div className="min-w-0 flex-1 py-2">
        <p className={cx('whitespace-pre-wrap', discussed && 'text-muted')}>{note.text}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-muted">
          <ScopeBadges scope={note.babies} />
          {format(new Date(note.createdAt), 'd MMM, HH:mm', { locale: dateLocale(i18n.language) })}
          {discussed && ` · ${t('notes.discussed')}`}
        </p>
      </div>
      <IconButton label={t('common.delete')} onClick={remove} className="text-muted">
        <Trash2 aria-hidden size={18} />
      </IconButton>
    </div>
  );
}

/** A running list to bring to appointments; ticked off once discussed. */
export function DoctorNotesPage() {
  const { t } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const [babies, setBabies] = useState<BabyScope>('both');
  const [showDiscussed, setShowDiscussed] = useState(false);
  const notes = useLive(async (s) => (await s.doctorNotes.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), []);
  const open = notes?.filter((n) => n.reviewedAt === null) ?? [];
  const discussed = notes?.filter((n) => n.reviewedAt !== null) ?? [];

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await store.doctorNotes.create({ text: text.trim(), babies, reviewedAt: null });
    setText('');
    toast({ message: t('notes.added') });
  };

  return (
    <Page title={t('notes.title')}>
      <form onSubmit={add} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('notes.placeholder')}
          aria-label={t('notes.add')}
          maxLength={2000}
        />
        <ScopePicker value={babies} onChange={setBabies} />
        <Button type="submit" className="w-full" disabled={!text.trim()}>
          {t('notes.add')}
        </Button>
      </form>

      {notes && open.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-5 text-center text-muted">{t('notes.empty')}</p>
      )}
      {open.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {open.map((n) => (
            <li key={n.id}>
              <NoteRow note={n} />
            </li>
          ))}
        </ul>
      )}
      {discussed.length > 0 && (
        <>
          <Button variant="ghost" className="w-full" onClick={() => setShowDiscussed((v) => !v)} aria-expanded={showDiscussed}>
            {showDiscussed ? t('notes.hideDiscussed') : t('notes.showDiscussed', { count: discussed.length })}
          </Button>
          {showDiscussed && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {discussed.map((n) => (
                <li key={n.id}>
                  <NoteRow note={n} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  );
}
