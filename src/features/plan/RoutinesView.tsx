import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/Button';
import { cx } from '@/components/ui';
import { useLive } from '@/data/StoreContext';
import type { Routine } from '@/data/types';
import { AppointmentEditor } from './AppointmentEditor';
import { RoutineEditor, useDescribeRoutine } from './RoutineEditor';
import { ScopeBadges, useScopeLabel } from './shared';

export function RoutinesView() {
  const { t } = useTranslation();
  const describe = useDescribeRoutine();
  const scopeLabel = useScopeLabel();
  const medScopeLabel = useScopeLabel('medRoutine');
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [appointmentTitle, setAppointmentTitle] = useState<string | null>(null);
  const routines = useLive(async (s) => (await s.routines.list()).sort((a, b) => a.title.localeCompare(b.title)), []);

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => setEditing('new')}>
        <Plus aria-hidden size={20} />
        {t('routine.add')}
      </Button>
      {routines && routines.length === 0 && (
        <p className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line p-6 text-center text-muted">
          <Repeat aria-hidden size={28} className="text-accent" />
          {t('routine.empty')}
        </p>
      )}
      {routines && routines.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {routines.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setEditing(r)}
                className={cx('flex w-full items-center gap-3 px-4 py-3 text-left', !r.active && 'opacity-60')}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    <ScopeBadges scope={r.babies} kind={r.med ? 'medRoutine' : 'routine'} />
                    <span className="truncate">{r.title}</span>
                  </span>
                  <span className="block text-sm text-muted">
                    {describe(r.rule)} · {(r.med ? medScopeLabel : scopeLabel)(r.babies)}
                    {r.med?.dose && ` · ${r.med.dose}`}
                    {!r.active && ` · ${t('routine.paused')}`}
                  </span>
                </span>
                <ChevronRight aria-hidden size={20} className="shrink-0 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RoutineEditor
          routine={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onAppointmentTemplate={(title) => {
            setEditing(null);
            setAppointmentTitle(title);
          }}
        />
      )}
      {appointmentTitle !== null && (
        <AppointmentEditor appointment={null} defaultTitle={appointmentTitle} onClose={() => setAppointmentTitle(null)} />
      )}
    </div>
  );
}
