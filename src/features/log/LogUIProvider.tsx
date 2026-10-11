import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { LogUIContext, type LogSheetState, type LogUI } from './LogUIContext';
import { QuickLogPanel } from './QuickLogPanel';
import { FeedSheet } from './FeedSheet';
import { EntryEditor } from './EntryEditor';

/** Hosts the logging sheets so they can be opened from anywhere (nav button, Today, toasts). */
export function LogUIProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LogSheetState | null>(null);

  const ui = useMemo<LogUI>(
    () => ({
      quick: () => setState({ kind: 'quick' }),
      feed: (who) => setState({ kind: 'feed', who }),
      create: (type, who) => setState({ kind: 'create', type, who }),
      edit: (entry) => setState({ kind: 'edit', entry }),
      close: () => setState(null),
    }),
    [],
  );

  return (
    <LogUIContext.Provider value={ui}>
      {children}
      {state?.kind === 'quick' && (
        <Sheet open onClose={ui.close} title={t('log.title')}>
          <QuickLogPanel onLogged={ui.close} />
        </Sheet>
      )}
      {state?.kind === 'feed' && <FeedSheet who={state.who} onClose={ui.close} />}
      {state?.kind === 'create' && <EntryEditor mode="create" type={state.type} who={state.who} onClose={ui.close} />}
      {state?.kind === 'edit' && <EntryEditor key={state.entry.id} mode="edit" entry={state.entry} onClose={ui.close} />}
    </LogUIContext.Provider>
  );
}
