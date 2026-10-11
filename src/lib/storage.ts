export type PersistState = 'persisted' | 'notPersisted' | 'unknown';

/**
 * Asks the browser not to evict our IndexedDB data under storage pressure.
 * Browsers decide silently (Chrome grants it to installed or frequently used
 * sites; Safari grants it to home-screen apps), so this is best-effort.
 */
export async function ensurePersistentStorage(): Promise<PersistState> {
  if (!navigator.storage?.persisted) return 'unknown';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    if (navigator.storage.persist && (await navigator.storage.persist())) return 'persisted';
    return 'notPersisted';
  } catch {
    return 'unknown';
  }
}
