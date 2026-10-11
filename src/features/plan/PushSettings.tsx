import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, Info } from 'lucide-react';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useSettings, useStore } from '@/data/StoreContext';
import { useSyncEngine } from '@/data/sync/SyncContext';
import { SyncError } from '@/data/sync/types';
import type { ReminderKind } from '@/data/types';
import { currentPush, pushSupport, subscribePush, unsubscribePush, type PushSupport } from '@/lib/push';

export const REMINDER_KINDS: readonly ReminderKind[] = ['routines', 'medicines', 'appointments', 'feedDue'];

const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/**
 * Keeps this phone's push registration on the server up to date: who uses the phone,
 * its language and kinds, and a subscription the browser replaced. Stops push when the
 * phone leaves the family or notifications were turned off in the phone settings.
 */
export function PushSync() {
  const store = useStore();
  const engine = useSyncEngine();
  const prefs = useDevicePrefs();
  const push = prefs?.push;
  const sync = prefs?.sync;
  const kinds = push?.kinds.join(',');

  useEffect(() => {
    if (!push || !prefs) return;
    let cancelled = false;
    void (async () => {
      if (!sync) {
        // Left the family: the server already dropped the subscription.
        await unsubscribePush();
        if (!cancelled) await store.device.update({ push: null });
        return;
      }
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        await store.device.update({ push: null });
        return;
      }
      const keys = (await currentPush()) ?? (await subscribePush());
      if (cancelled || !keys) return;
      if (keys.endpoint !== push.endpoint) {
        await engine.deletePush(push.endpoint).catch(() => {});
        await store.device.update({ push: { ...push, endpoint: keys.endpoint } });
        return; // runs again with the new endpoint
      }
      await engine.savePush(sync, { ...keys, caregiverId: prefs.parent, kinds: push.kinds, lang: prefs.language }).catch(() => {
        /* offline: tried again on the next start */
      });
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when what the server needs to know changes.
  }, [push?.endpoint, kinds, prefs?.parent, prefs?.language, sync?.familyId]);

  return null;
}

/** Settings → Reminders: push reminders that also arrive while the app is closed. */
export function PushSettings() {
  const { t } = useTranslation();
  const store = useStore();
  const engine = useSyncEngine();
  const toast = useToast();
  const prefs = useDevicePrefs();
  const settings = useSettings();
  const [support, setSupport] = useState<PushSupport>(pushSupport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setSupport(pushSupport()), [prefs?.push]);
  if (!prefs || !settings || !engine.available) return null;

  const errorText = (e: unknown) => t(`sync.errors.${e instanceof SyncError ? e.code : 'failed'}`);

  const turnOn = async () => {
    if (!prefs.sync) return;
    setBusy(true);
    setError(null);
    try {
      const keys = await subscribePush();
      setSupport(pushSupport());
      if (!keys) return;
      const kinds = prefs.push?.kinds ?? [...REMINDER_KINDS];
      await engine.savePush(prefs.sync, { ...keys, caregiverId: prefs.parent, kinds, lang: prefs.language });
      await store.device.update({ push: { endpoint: keys.endpoint, kinds } });
      // The server reads routine times in the family's time zone.
      if (!settings.timeZone) await store.settings.update({ timeZone: deviceTimeZone() });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    if (prefs.push) await engine.deletePush(prefs.push.endpoint).catch(() => {});
    await unsubscribePush();
    await store.device.update({ push: null });
    setBusy(false);
  };

  const setKind = (kind: ReminderKind, on: boolean) => {
    if (!prefs.push) return;
    const kinds = on ? [...new Set([...prefs.push.kinds, kind])] : prefs.push.kinds.filter((k) => k !== kind);
    void store.device.update({ push: { ...prefs.push, kinds } });
  };

  const test = async () => {
    if (!prefs.push) return;
    try {
      await engine.testPush(prefs.push.endpoint);
      toast({ message: t('push.testSent') });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line p-3">
      <p className="font-semibold">{t('push.title')}</p>
      {!prefs.sync ? (
        <p className="text-sm text-muted">{t('push.needsSync')}</p>
      ) : support === 'unsupported' ? (
        <p className="text-sm text-muted">{t('push.unsupported')}</p>
      ) : support === 'installFirst' ? (
        <p className="text-sm text-muted">{t('push.installFirst')}</p>
      ) : (
        <>
          <div>
            <Toggle
              label={t('push.enable')}
              checked={Boolean(prefs.push)}
              onChange={(on) => void (busy ? null : on ? turnOn() : turnOff())}
            />
            <p className="text-sm text-muted">{t('push.hint')}</p>
          </div>
          {support === 'denied' && <p className="text-sm font-medium text-danger">{t('reminders.denied')}</p>}
          {prefs.push && (
            <>
              <fieldset className="space-y-1">
                <legend className="mb-1 text-sm font-medium">{t('push.kinds')}</legend>
                {REMINDER_KINDS.map((kind) => (
                  <Toggle
                    key={kind}
                    label={t(`push.kind.${kind}`)}
                    checked={prefs.push!.kinds.includes(kind)}
                    onChange={(on) => setKind(kind, on)}
                  />
                ))}
              </fieldset>
              <p className="flex gap-2 text-sm text-muted">
                <Info aria-hidden size={16} className="mt-0.5 shrink-0" />
                <span>{t('push.nightNote')}</span>
              </p>
              <Button variant="secondary" onClick={test}>
                <BellRing aria-hidden size={18} />
                {t('push.test')}
              </Button>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
