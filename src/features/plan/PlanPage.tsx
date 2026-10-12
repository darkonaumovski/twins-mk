import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Page, Segmented } from '@/components/ui';
import { useSettings } from '@/data/StoreContext';
import { ContractionsCard } from '@/features/contractions/ContractionsCard';
import { CalendarView } from './CalendarView';
import { RoutinesView } from './RoutinesView';
import { TasksView } from './TasksView';

type Tab = 'calendar' | 'routines' | 'tasks';
const TABS: Tab[] = ['calendar', 'routines', 'tasks'];

export function PlanPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  if (!settings) return null;
  // Before the birth: appointments, parent tasks and contractions. Routines are about the babies.
  const prep = settings.phase === 'prep';
  const tabs = prep ? TABS.filter((v) => v !== 'routines') : TABS;
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : 'calendar';

  return (
    <Page title={t('plan.title')}>
      <Segmented<Tab>
        label={t('plan.title')}
        hideLabel
        value={tab}
        options={tabs.map((v) => ({ value: v, label: t(`plan.${v}`) }))}
        onChange={(v) => setParams(v === 'calendar' ? {} : { tab: v }, { replace: true })}
      />
      {prep && <ContractionsCard />}
      {tab === 'calendar' && <CalendarView />}
      {tab === 'routines' && <RoutinesView />}
      {tab === 'tasks' && <TasksView />}
    </Page>
  );
}
