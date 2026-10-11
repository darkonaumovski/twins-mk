import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { CloudOff, Copy, KeyRound, Lock, RefreshCw, Share2, TriangleAlert, Users, Wifi } from 'lucide-react';
import { Button } from '@/components/Button';
import { Field, Section, TextInput, Toggle, cx } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useDevicePrefs, useStore } from '@/data/StoreContext';
import { formatCode, normalizeCode } from '@/data/sync/engine';
import { useSyncEngine, useSyncStatus } from '@/data/sync/SyncContext';
import { SyncError } from '@/data/sync/types';
import { dateLocale } from '@/i18n';
import { useNow } from '@/lib/useNow';
import { notifySupport, requestNotifyPermission } from '@/lib/notify';

const errorCode = (e: unknown) => (e instanceof SyncError ? e.code : 'failed');

export function SyncSettings() {
  const { t } = useTranslation();
  const engine = useSyncEngine();
  const prefs = useDevicePrefs();

  if (!engine.available || !prefs) return null;

  return <Section title={t('sync.title')}>{prefs.sync ? <Joined code={prefs.sync.code} /> : <NotJoined />}</Section>;
}

function NotJoined() {
  const { t } = useTranslation();
  const store = useStore();
  const engine = useSyncEngine();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(`sync.errors.${errorCode(e)}`));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const membership = await engine.createFamily();
      await store.device.update({ sync: membership });
      toast({ message: t('sync.started') });
    });

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (normalizeCode(code).length < 12) return setError(t('sync.errors.notFound'));
    const ok = await confirm({ title: t('sync.joinConfirmTitle'), body: t('sync.joinConfirmBody'), confirmLabel: t('sync.join') });
    if (!ok) return;
    await run(async () => {
      const membership = await engine.joinFamily(code);
      await store.device.update({ sync: membership });
      toast({ message: t('sync.joined') });
    });
  };

  return (
    <>
      <p className="flex gap-3">
        <Users aria-hidden className="mt-0.5 shrink-0 text-accent" size={20} />
        <span>{t('sync.intro')}</span>
      </p>
      {!joining ? (
        <div className="space-y-2">
          <Button className="w-full" disabled={busy} onClick={start}>
            {t('sync.start')}
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => setJoining(true)}>
            <KeyRound aria-hidden size={18} />
            {t('sync.haveCode')}
          </Button>
          <p className="text-sm text-muted">{t('sync.startHint')}</p>
        </div>
      ) : (
        <form className="space-y-2" onSubmit={join}>
          <Field label={t('sync.codeLabel')}>
            {(props) => (
              <TextInput
                {...props}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={20}
                className="font-mono tracking-widest uppercase"
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setJoining(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !code.trim()}>
              {t('sync.join')}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
      )}
      <p className="flex gap-2 text-sm text-muted">
        <Lock aria-hidden size={16} className="mt-0.5 shrink-0" />
        <span>{t('sync.privacy')}</span>
      </p>
    </>
  );
}

function Joined({ code }: { code: string }) {
  const { t } = useTranslation();
  const store = useStore();
  const engine = useSyncEngine();
  const toast = useToast();
  const confirm = useConfirm();
  const prefs = useDevicePrefs();
  const [syncing, setSyncing] = useState(false);
  const pretty = formatCode(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      toast({ message: t('sync.copied') });
    } catch {
      /* clipboard blocked; the code is on screen to type */
    }
  };

  const canShare = typeof navigator.share === 'function';
  const share = async () => {
    try {
      await navigator.share({ text: t('sync.shareText', { code: pretty }) });
    } catch {
      /* cancelled */
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await engine.syncNow();
    } finally {
      setSyncing(false);
    }
  };

  const leave = async () => {
    const ok = await confirm({
      title: t('sync.leaveConfirmTitle'),
      body: t('sync.leaveConfirmBody'),
      confirmLabel: t('sync.leaveConfirmLabel'),
      danger: true,
    });
    if (!ok || !prefs?.sync) return;
    const membership = prefs.sync;
    await store.device.update({ sync: null });
    await engine.leave(membership);
    toast({ message: t('sync.left') });
  };

  return (
    <>
      <SyncStatusLine />
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted">{t('sync.familyCode')}</p>
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-center font-mono text-2xl font-semibold tracking-widest select-all">
          {pretty}
        </p>
        <div className={cx('grid gap-2', canShare && 'grid-cols-2')}>
          <Button variant="secondary" onClick={copy}>
            <Copy aria-hidden size={18} />
            {t('sync.copy')}
          </Button>
          {canShare && (
            <Button variant="secondary" onClick={share}>
              <Share2 aria-hidden size={18} />
              {t('sync.shareCode')}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted">{t('sync.familyCodeHint')}</p>
      </div>
      <ChangeAlertsToggle />
      <Button variant="secondary" className="w-full" disabled={syncing} onClick={syncNow}>
        <RefreshCw aria-hidden size={18} className={cx(syncing && 'animate-spin')} />
        {t('sync.syncNow')}
      </Button>
      <Button variant="ghost" className="w-full text-danger!" onClick={leave}>
        {t('sync.leave')}
      </Button>
      <p className="flex gap-2 text-sm text-muted">
        <Lock aria-hidden size={16} className="mt-0.5 shrink-0" />
        <span>{t('sync.privacy')}</span>
      </p>
    </>
  );
}

function SyncStatusLine() {
  const { t, i18n } = useTranslation();
  const status = useSyncStatus();
  // Re-render every minute so "2 minutes ago" stays right.
  useNow(60_000);

  let icon = <RefreshCw aria-hidden size={20} className="mt-0.5 shrink-0 animate-spin text-muted" />;
  let text = t('sync.status.connecting');
  if (status.state === 'synced') {
    icon = <Wifi aria-hidden size={20} className="mt-0.5 shrink-0 text-ok" />;
    text = status.lastSyncAt
      ? t('sync.status.syncedAgo', {
          when: formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true, locale: dateLocale(i18n.language) }),
        })
      : t('sync.status.synced');
  } else if (status.state === 'offline') {
    icon = <CloudOff aria-hidden size={20} className="mt-0.5 shrink-0 text-warn" />;
    text = t('sync.status.offline');
  } else if (status.state === 'error') {
    icon = <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0 text-danger" />;
    text = t(`sync.errors.${status.error ?? 'failed'}`);
  }

  return (
    <div role="status" className="flex gap-3">
      {icon}
      <div>
        <p className="font-medium">
          {text}
          {status.state === 'synced' && status.live && (
            <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {t('sync.status.live')}
            </span>
          )}
        </p>
        {status.pending > 0 && status.state !== 'synced' && (
          <p className="text-sm text-muted">{t('sync.status.pending', { count: status.pending })}</p>
        )}
      </div>
    </div>
  );
}

function ChangeAlertsToggle() {
  const { t } = useTranslation();
  const store = useStore();
  const prefs = useDevicePrefs();
  const [support, setSupport] = useState(notifySupport);
  if (!prefs) return null;

  const toggle = async (on: boolean) => {
    await store.device.update({ changeAlerts: on });
    // Messages on screen need no permission; notifications in the background do.
    if (on && support === 'default') setSupport(await requestNotifyPermission());
  };

  return (
    <div>
      <Toggle label={t('sync.alerts')} checked={prefs.changeAlerts !== false} onChange={toggle} />
      <p className="text-sm text-muted">{t('sync.alertsHint')}</p>
      {prefs.changeAlerts !== false && support === 'denied' && <p className="text-sm font-medium text-warn">{t('sync.alertsDenied')}</p>}
    </div>
  );
}
