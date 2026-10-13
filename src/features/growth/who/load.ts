import type { WhoTables } from './lms';

/** The WHO tables as a separate chunk, fetched from the precache only when the reference curves are switched on. */
export const loadWhoTables = (): Promise<WhoTables> => import('./tables').then((m) => m.WHO_TABLES);
