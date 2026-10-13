import { PhotoZipButton } from '@/features/photos/PhotoSettings';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { Download, FileSpreadsheet, Info, Share2, Upload } from 'lucide-react';
import { Button } from '@/components/Button';
import { Section } from '@/components/ui';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { useStore } from '@/data/StoreContext';
import { BackupError, exportBackup, importBackup, parseBackup } from '@/data/backup';
import { dateLocale } from '@/i18n';
import { toCsv } from '@/lib/csv';
import { zip } from '@/lib/zip';
import { useLabel } from '@/lib/labels';
import { useCaregiverName } from '@/lib/caregivers';
import { useBabies, useTwinName } from '@/features/twins/twins';
import { scopeLabelKey } from '@/features/plan/logic';
import { buildCsvFiles, csvZipName, type CsvText } from './csvExport';

import { markBackupDone, readLastBackup } from './backupLogic';

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

  const remember = () => setLastBackup(markBackupDone());

  const saveFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const download = async () => {
    saveFile(await makeFile());
    remember();
  };

  const canShareFiles = typeof navigator.canShare === 'function';
  /** The phone's share sheet where it can share files, otherwise a download. True once handed over. */
  const shareFile = async (file: File, title: string) => {
    if (!navigator.canShare?.({ files: [file] })) {
      saveFile(file);
      return true;
    }
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      saveFile(file);
      return true;
    }
  };
  const share = async () => {
    if (await shareFile(await makeFile(), t('backup.shareTitle'))) remember();
  };

  // Spreadsheet export: names instead of ids, headers in this phone's language.
  const twin = useTwinName(useBabies());
  const person = useCaregiverName();
  const label = useLabel();
  const [csvBusy, setCsvBusy] = useState(false);
  const exportCsv = async () => {
    if (csvBusy) return;
    setCsvBusy(true);
    try {
      const [logs, pumps, milkStash, appointments, tasks, milestones, prepItems, categories, contractions, vaccines, motherLogs, babies] =
        await Promise.all([
          store.logs.listAll(),
          store.pumps.listAll(),
          store.milkStash.listAll(),
          store.appointments.listAll(),
          store.tasks.listAll(),
          store.milestones.listAll(),
          store.prepItems.listAll(),
          store.categories.listAll(),
          store.contractions.listAll(),
          store.vaccines.listAll(),
          store.motherLogs.listAll(),
          store.babies.listAll(),
        ]);
      const tx: CsvText = {
        t: t as unknown as CsvText['t'],
        twin,
        person,
        label,
        scope: (scope, kind) => {
          const key = scopeLabelKey(scope, kind);
          return key ? t(key) : twin(scope);
        },
      };
      const files = buildCsvFiles(
        { logs, pumps, milkStash, appointments, tasks, milestones, prepItems, categories, contractions, vaccines, motherLogs, babies },
        tx,
      );
      const now = new Date();
      const blob = zip(
        files.map((f) => ({ name: f.fileName, data: toCsv(f.rows) })),
        now,
      );
      await shareFile(new File([blob], csvZipName(now), { type: 'application/zip' }), t('csv.shareTitle'));
    } catch {
      toast({ message: t('csv.failed') });
    } finally {
      setCsvBusy(false);
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
        <Button variant="secondary" className="w-full" onClick={() => void exportCsv()} disabled={csvBusy} aria-busy={csvBusy}>
          <FileSpreadsheet aria-hidden size={18} />
          {t('csv.export')}
        </Button>
        <p className="text-sm text-muted">{t('csv.exportHint')}</p>
      </div>
      <PhotoZipButton />
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
