import type { Phase } from '@/data/types';

export type NavKey = 'checklist' | 'plan' | 'budget' | 'notifications' | 'settings' | 'today' | 'history' | 'more';

export interface NavLayout {
  /** Tabs left of the log button (all of them when there is no log button). */
  left: NavKey[];
  right: NavKey[];
  /** The big "+" in the middle, for logging (after the birth). */
  logButton: boolean;
}

/**
 * The bottom navigation per phase, at most five tabs. Before the birth: the checklist, Plan
 * (appointments, tasks, contractions), the budget (with the shopping list one tap away),
 * notifications and settings. After the birth: Today and History, the log button, Plan, notifications, More.
 */
export function navTabs(phase: Phase): NavLayout {
  if (phase === 'planner') return { left: ['today', 'history'], right: ['plan', 'notifications', 'more'], logButton: true };
  return { left: ['checklist', 'plan', 'budget', 'notifications', 'settings'], right: [], logButton: false };
}
