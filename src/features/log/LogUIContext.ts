import { createContext, useContext } from 'react';
import type { LogEntry, LogType, Pump } from '@/data/types';
import type { LogDraft, Who } from './logic';

/** Entry types logged through a form rather than a one-tap button. */
export type FormType = 'med' | 'measure' | 'note' | 'sleep' | 'temp' | 'spitup' | 'bath' | 'tummy';

export type LogSheetState =
  | { kind: 'quick' }
  | { kind: 'feed'; who: Who }
  | { kind: 'create'; type: FormType | LogType; who: Who; initial?: LogDraft }
  | { kind: 'edit'; entry: LogEntry }
  | { kind: 'more'; who: Who }
  | { kind: 'pump'; pump: Pump | null }
  | { kind: 'pumpTimer'; pumpId?: string };

export interface LogUI {
  /** The full quick-log panel in a sheet (the "+" button in the navigation). */
  quick(): void;
  feed(who: Who): void;
  create(type: FormType, who: Who): void;
  /** The normal editor for a new entry, filled in (e.g. from quick text logging). */
  prefill(draft: LogDraft, who: Who): void;
  edit(entry: LogEntry): void;
  /** Rarer log types, pumping, milk stash and supplies. */
  more(who: Who): void;
  /** A new pumping session, or editing one. */
  pump(pump?: Pump): void;
  /** The pumping timer: start it, or see it running and stop it. */
  pumpTimer(pumpId?: string): void;
  close(): void;
}

export const LogUIContext = createContext<LogUI | null>(null);

export function useLogUI(): LogUI {
  const ui = useContext(LogUIContext);
  if (!ui) throw new Error('useLogUI must be used inside <LogUIProvider>');
  return ui;
}
