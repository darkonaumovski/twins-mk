import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, User } from 'lucide-react';
import { Button } from '@/components/Button';
import { TextInput, cx } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useLive, useStore } from '@/data/StoreContext';
import { formatShortDate, todayISO } from '@/lib/format';
import { useCaregiverName, useCaregivers } from '@/lib/caregivers';
import { useRemembered } from '@/lib/remember';
import { Choice } from '@/components/Choice';
import type { ParentTask } from '@/data/types';
import { sortTasks } from './logic';
import { TaskEditor } from './TaskEditor';

/** `all`, or one caregiver's id. */
type Filter = string;
const isFilter = (v: unknown): v is Filter => typeof v === 'string' && v.length > 0 && v.length <= 100;

export function TaskRow({ task, onOpen }: { task: ParentTask; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const parentName = useCaregiverName();
  const today = todayISO();
  const overdue = !task.done && task.due !== null && task.due < today;

  const toggle = async () => {
    await store.tasks.update(task.id, { done: !task.done });
    if (!task.done) {
      toast({
        message: t('task.markDone', { title: task.title }),
        action: { label: t('common.undo'), onClick: () => void store.tasks.update(task.id, { done: false }) },
      });
    }
  };

  const dueText = !task.due
    ? null
    : overdue
      ? t('task.overdue', { date: formatShortDate(task.due, i18n.language) })
      : task.due === today
        ? t('task.dueToday')
        : t('task.dueDate', { date: formatShortDate(task.due, i18n.language) });

  return (
    <div className="flex items-stretch">
      <label className="flex shrink-0 cursor-pointer items-center pr-1 pl-3">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={task.done}
          onChange={toggle}
          aria-label={t('task.markDone', { title: task.title })}
        />
        <span
          aria-hidden
          className={cx(
            'flex size-8 items-center justify-center rounded-full border-2 transition peer-focus-visible:outline-3 peer-focus-visible:outline-accent',
            task.done ? 'border-ok bg-ok text-surface' : 'border-muted/60',
          )}
        >
          {task.done && <Check size={18} strokeWidth={3} />}
        </span>
      </label>
      <button type="button" onClick={onOpen} className="min-h-14 flex-1 py-2.5 pr-4 pl-2 text-left">
        <span className={cx('block', task.done && 'text-muted line-through')}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          {task.assignee && (
            <span className="inline-flex items-center gap-1">
              <User aria-hidden size={14} />
              {parentName(task.assignee)}
            </span>
          )}
          {dueText && <span className={cx(overdue && 'font-semibold text-danger')}>{dueText}</span>}
        </span>
      </button>
    </div>
  );
}

export function TasksView() {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const caregivers = useCaregivers();
  const [savedFilter, setFilter] = useRemembered<Filter>('twinsmk.tasks.filter', 'all', isFilter);
  // A helper who was removed falls back to "all".
  const filter = savedFilter === 'all' || !caregivers || caregivers.some((c) => c.id === savedFilter) ? savedFilter : 'all';
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<ParentTask | null>(null);
  const tasks = useLive((s) => s.tasks.list(), []);

  const visible = sortTasks((tasks ?? []).filter((task) => filter === 'all' || task.assignee === filter || task.assignee === null));
  const open = visible.filter((task) => !task.done);
  const done = visible.filter((task) => task.done);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await store.tasks.create({ title: title.trim(), assignee: filter === 'all' ? null : filter, due: null, done: false, notes: '' });
    setTitle('');
  };

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('task.placeholder')}
          aria-label={t('task.add')}
          maxLength={120}
        />
        <Button type="submit" aria-label={t('task.add')} disabled={!title.trim()}>
          <Plus aria-hidden size={20} />
        </Button>
      </form>
      <Choice
        label={t('task.assignee')}
        value={filter}
        options={[
          { value: 'all', label: t('task.all') },
          ...(caregivers ?? []).map((c) => ({ value: c.id, label: `${c.name}${prefs?.parent === c.id ? ` (${t('task.mine')})` : ''}` })),
        ]}
        onChange={setFilter}
      />
      {tasks && open.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-5 text-center text-muted">{t('task.empty')}</p>
      )}
      {open.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {open.map((task) => (
            <li key={task.id}>
              <TaskRow task={task} onOpen={() => setEditing(task)} />
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <Button variant="ghost" className="w-full" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            {showDone ? t('task.hideDone') : t('task.showDone', { count: done.length })}
          </Button>
          {showDone && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {done.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} onOpen={() => setEditing(task)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
