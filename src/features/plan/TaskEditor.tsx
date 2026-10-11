import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, X } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/Button';
import { Field, TextArea, TextInput, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { useCaregivers } from '@/lib/caregivers';
import { Choice } from '@/components/Choice';
import type { ParentTask } from '@/data/types';

/** A caregiver id, or `any` for nobody in particular. */
type Assignee = string;

export function TaskEditor({ task, onClose }: { task: ParentTask; onClose: () => void }) {
  const { t } = useTranslation();
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const caregivers = useCaregivers() ?? [];
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState<Assignee>(task.assignee ?? 'any');
  const [due, setDue] = useState(task.due ?? '');
  const [done, setDone] = useState(task.done);
  const [notes, setNotes] = useState(task.notes);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    await store.tasks.update(task.id, {
      title: title.trim(),
      assignee: assignee === 'any' ? null : assignee,
      due: due || null,
      done,
      notes: notes.trim(),
    });
    onClose();
  };

  const remove = async () => {
    if (!(await confirm({ title: t('task.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))) return;
    await store.tasks.remove(task.id);
    onClose();
    toast({ message: t('task.deleted'), action: { label: t('common.undo'), onClick: () => void store.tasks.restore(task.id) } });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('task.edit')}
      footer={
        <>
          <Button variant="ghost" onClick={remove} className="text-danger" aria-label={t('common.delete')}>
            <Trash2 aria-hidden size={20} />
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="task-form" className="flex-1">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={save} className="space-y-5">
        <Field label={t('task.title')}>
          {(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />}
        </Field>
        <Choice
          label={t('task.assignee')}
          value={assignee}
          options={[{ value: 'any', label: t('task.anyone') }, ...caregivers.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={setAssignee}
        />
        <Field label={t('task.due')}>
          {(p) => (
            <div className="flex items-center gap-2">
              <TextInput {...p} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              {due && (
                <IconButton label={t('task.noDue')} onClick={() => setDue('')}>
                  <X aria-hidden size={20} />
                </IconButton>
              )}
            </div>
          )}
        </Field>
        <Toggle label={t('item.taskDone')} checked={done} onChange={setDone} />
        <Field label={t('task.notes')}>
          {(p) => <TextArea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}
        </Field>
      </form>
    </Sheet>
  );
}
