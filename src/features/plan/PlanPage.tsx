import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Page, Segmented } from '@/components/ui';
import { CalendarView } from './CalendarView';
import { RoutinesView } from './RoutinesView';
import { TasksView } from './TasksView';

type Tab = 'calendar' | 'routines' | 'tasks';
const TABS: Tab[] = ['calendar', 'routines', 'tasks'];

export function PlanPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'calendar';

  return (
    <Page title={t('plan.title')}>
      <Segmented<Tab>
        label={t('plan.title')}
        hideLabel
        value={tab}
        options={TABS.map((v) => ({ value: v, label: t(`plan.${v}`) }))}
        onChange={(v) => setParams(v === 'calendar' ? {} : { tab: v }, { replace: true })}
      />
      {tab === 'calendar' && <CalendarView />}
      {tab === 'routines' && <RoutinesView />}
      {tab === 'tasks' && <TasksView />}
    </Page>
  );
}
