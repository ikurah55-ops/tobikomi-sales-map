import { useMemo, useState } from 'react';
import { backupReminderCount, canShareFile, exportJson, lastBackupAt, shareJson, snoozeBackupReminder } from '../data/backup';
import { useStore } from '../store';

/** 地図の上に出す「しばらくバックアップしていません」のお知らせ */
export function BackupReminder() {
  const { visits, toast } = useStore();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = useMemo(() => backupReminderCount(visits), [visits]);
  if (hidden || !count) return null;

  const last = lastBackupAt();
  const days = last != null ? Math.floor((Date.now() - last) / 86400000) : null;
  const share = canShareFile();

  const run = async (fn: () => Promise<number | null>) => {
    setBusy(true);
    try {
      const n = await fn();
      if (n != null) {
        toast(`${n}件の訪問記録をバックアップしました`);
        setHidden(true);
      }
    } catch (e) {
      toast(`バックアップできませんでした: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backup-reminder" role="alert">
      <p>
        <b>{days != null ? `${days}日バックアップしていません` : 'まだバックアップしていません'}</b>
        <br />
        未保存の訪問記録が{count}件あります。記録はこの端末の中だけにあるので、機種変更や故障に備えて保存しましょう。
      </p>
      <div className="backup-reminder-actions">
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(share ? shareJson : exportJson)}>
          {share ? 'ドライブなどに保存' : 'ファイルに保存'}
        </button>
        <button
          className="btn btn-sm btn-outline"
          onClick={() => {
            snoozeBackupReminder();
            setHidden(true);
          }}
        >
          あとで
        </button>
      </div>
    </div>
  );
}
