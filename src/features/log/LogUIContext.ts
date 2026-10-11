import { createContext, useContext } from 'react';
import type { LogEntry, Pump } from '@/data/types';
import type { Who } from './logic';

/** Entry types logged through a form rather than a one-tap button. */
export type FormType = 'med' | 'measure' | 'note' | 'sleep' | 'temp' | 'spitup' | 'bath' | 'tummy';

export type LogSheetState =
  | { kind: 'quick' }
  | { kind: 'feed'; who: Who }
  | { kind: 'create'; type: FormType; who: Who }
  | { kind: 'edit'; entry: LogEntry }
  | { kind: 'more'; who: Who }
  | { kind: 'pump'; pump: Pump | null };

export interface LogUI {
  /** The full quick-log panel in a sheet (the "+" button in the navigation). */
  quick(): void;
  feed(who: Who): void;
  create(type: FormType, who: Who): void;
  edit(entry: LogEntry): void;
  /** Rarer log types, pumping, milk stash and supplies. */
  more(who: Who): void;
  /** A new pumping session, or editing one. */
  pump(pump?: Pump): void;
  close(): void;
}

export const LogUIContext = createContext<LogUI | null>(null);

export function useLogUI(): LogUI {
  const ui = useContext(LogUIContext);
  if (!ui) throw new Error('useLogUI must be used inside <LogUIProvider>');
  return ui;
}
