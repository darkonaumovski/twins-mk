import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { Download, Info, Share2, Upload } from 'lucide-react';
import { Button } from '@/components/Button';
import { Section } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { BackupError, exportBackup, importBackup, parseBackup } from '@/data/backup';
import { dateLocale } from '@/i18n';

const LAST_BACKUP_KEY = 'twinsmk.lastBackup';

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function BackupSettings() {
  const { t, i18n } = useTranslation();
  const store = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [error, setError] = useState<string | null>(null);
  const locale = dateLocale(i18n.language);

  const makeFile = async () => {
    const backup = await exportBackup(store);
    const name = `twins-organizer-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    return new File([JSON.stringify(backup)], name, { type: 'application/json' });
  };

  const remember = () => {
    const now = new Date().toISOString();
    setLastBackup(now);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now);
    } catch {
      /* only used for the "last backup" hint */
    }
  };

  const download = async () => {
    const file = await makeFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    remember();
  };

  const canShareFiles = typeof navigator.canShare === 'function';
  const share = async () => {
    const file = await makeFile();
    if (!navigator.canShare?.({ files: [file] })) return download();
    try {
      await navigator.share({ files: [file], title: t('backup.shareTitle') });
      remember();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') await download();
    }
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const records = Object.values(backup.data).reduce((n, list) => n + (list?.length ?? 0), 0);
      const date = backup.exportedAt ? format(new Date(backup.exportedAt), 'PPp', { locale }) : '?';
      const ok = await confirm({
        title: t('backup.confirmTitle'),
        body: t('backup.confirmBody', { date, count: records }),
        confirmLabel: t('backup.confirmLabel'),
      });
      if (!ok) return;
      const report = await importBackup(store, backup);
      const added = Object.values(report).reduce((n, s) => n + (s?.added ?? 0), 0);
      const updated = Object.values(report).reduce((n, s) => n + (s?.updated ?? 0), 0);
      toast({ message: added + updated === 0 ? t('backup.nothingNew') : t('backup.done', { added, updated }) });
    } catch (e) {
      setError(e instanceof BackupError ? t(`backup.errors.${e.code}`) : t('backup.errors.notJson'));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <Section title={t('backup.title')}>
      <p className="text-sm text-muted">
        {lastBackup
          ? t('backup.lastExport', { when: formatDistanceToNow(new Date(lastBackup), { addSuffix: true, locale }) })
          : t('backup.never')}
      </p>
      <div className="grid gap-2 min-[420px]:grid-cols-2">
        <Button variant="secondary" onClick={download}>
          <Download aria-hidden size={18} />
          {t('backup.export')}
        </Button>
        {canShareFiles && (
          <Button variant="secondary" onClick={share}>
            <Share2 aria-hidden size={18} />
            {t('backup.share')}
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <Button variant="secondary" className="w-full" onClick={() => fileInput.current?.click()}>
          <Upload aria-hidden size={18} />
          {t('backup.import')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <p className="text-sm text-muted">{t('backup.importHint')}</p>
        {error && (
          <p role="alert" className="font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <p className="flex gap-2 text-sm">
        <Info aria-hidden size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>{t('backup.twoPhones')}</span>
      </p>
    </Section>
  );
}
