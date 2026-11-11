import type { FacilityMark, Pin, Track, Visit } from '../types';
import { COMPETITOR_LABEL, HOUSING_LABEL, PRESENCE_LABEL, REACTION_LABEL, WEATHER_LABEL } from '../lib/records';
import { listFacilityMarks, listPins, listTracks, listVisits, upsertFacilityMarks, upsertRecords, upsertTracks } from './repository';

const APP_ID = 'tobikomi-sales-map';

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

async function backupBody() {
  const [pins, visits, facilityMarks, tracks] = await Promise.all([listPins(), listVisits(), listFacilityMarks(), listTracks()]);
  return { count: visits.length, json: JSON.stringify({ app: APP_ID, version: 1, exportedAt: new Date().toISOString(), pins, visits, facilityMarks, tracks }, null, 1) };
}

export async function exportJson(): Promise<number> {
  const { count, json } = await backupBody();
  download(`訪問記録-${stamp()}.json`, json, 'application/json');
  markBackedUp();
  return count;
}

/** 共有シートで Google ドライブや LINE などに保存できる端末か */
export const canShareFile = () => {
  try {
    return !!navigator.canShare?.({ files: [new File(['{}'], 'test.json', { type: 'application/json' })] });
  } catch {
    return false;
  }
};

/** 共有シートでバックアップを渡す。キャンセルしたら null */
export async function shareJson(): Promise<number | null> {
  const { count, json } = await backupBody();
  const file = new File([json], `訪問記録-${stamp()}.json`, { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: '訪問記録のバックアップ' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
  markBackedUp();
  return count;
}

// ---------- バックアップのリマインド ----------

const LAST_BACKUP_KEY = 'tobikomi-last-backup';
const SNOOZE_KEY = 'tobikomi-backup-snooze';
const DAY = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_DAYS = 7;

const readTime = (key: string) => {
  try {
    const v = localStorage.getItem(key);
    return v ? Date.parse(v) : null;
  } catch {
    return null;
  }
};
const writeTime = (key: string) => {
  try {
    localStorage.setItem(key, new Date().toISOString());
  } catch {
    // 保存できなくてもリマインドが出続けるだけ
  }
};

export const lastBackupAt = () => readTime(LAST_BACKUP_KEY);
export const markBackedUp = () => writeTime(LAST_BACKUP_KEY);
/** 「あとで」を押したら1日出さない */
export const snoozeBackupReminder = () => writeTime(SNOOZE_KEY);

/**
 * バックアップ後(一度もなければ最初の記録から)7日たち、その間に新しい記録があればリマインドする。
 * 戻り値はバックアップしていない訪問記録の件数(リマインド不要なら 0)
 */
export function backupReminderCount(visits: Visit[], now = Date.now()): number {
  const snoozed = readTime(SNOOZE_KEY);
  if (snoozed != null && now - snoozed < DAY) return 0;
  const last = lastBackupAt();
  const pending = visits.filter((v) => last == null || Date.parse(v.createdAt) > last);
  if (!pending.length) return 0;
  const since = last ?? Math.min(...pending.map((v) => Date.parse(v.createdAt)));
  return now - since >= REMIND_AFTER_DAYS * DAY ? pending.length : 0;
}

export async function importJson(file: File): Promise<{ pins: number; visits: number }> {
  const data = JSON.parse(await file.text());
  if (data?.app !== APP_ID || !Array.isArray(data.pins) || !Array.isArray(data.visits)) {
    throw new Error('このアプリのバックアップファイルではありません');
  }
  const pins = (data.pins as Pin[]).filter((p) => p && typeof p.id === 'string' && typeof p.lat === 'number');
  const visits = (data.visits as Visit[]).filter((v) => v && typeof v.id === 'string' && typeof v.pinId === 'string');
  await upsertRecords(pins, visits);
  // 店の登録(使える駐車場・消した店)は後から加えたので、古いバックアップにはない
  if (Array.isArray(data.facilityMarks)) {
    await upsertFacilityMarks((data.facilityMarks as FacilityMark[]).filter((m) => m && typeof m.id === 'string' && (m.status === 'ok' || m.status === 'hidden')));
  }
  if (Array.isArray(data.tracks)) {
    await upsertTracks((data.tracks as Track[]).filter((x) => x && typeof x.id === 'string' && Array.isArray(x.points)));
  }
  return { pins: pins.length, visits: visits.length };
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(): Promise<number> {
  const [pins, visits] = await Promise.all([listPins(), listVisits()]);
  const byId = new Map(pins.map((p) => [p.id, p]));
  const header = ['訪問日時', '町丁目', '呼び名', '住居の種類', '在宅', '反応', '他社の営業', '天気', 'メモ', '再訪禁止', '再訪予定日', '緯度', '経度', 'ピンID', '訪問ID'];
  const lines = [header.join(',')];
  for (const v of visits) {
    const p = byId.get(v.pinId);
    const d = new Date(v.visitedAt);
    const dt = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    lines.push(
      [
        dt, p?.areaName ?? '', p?.label ?? '', p?.housingType ? HOUSING_LABEL[p.housingType] : '',
        PRESENCE_LABEL[v.presence], v.reaction ? REACTION_LABEL[v.reaction] : '',
        v.competitor ? COMPETITOR_LABEL[v.competitor] : '', v.weather ? WEATHER_LABEL[v.weather] : '', v.memo,
        p?.noRevisit ? '○' : '', p?.revisitDate ?? '', p?.lat.toFixed(6) ?? '', p?.lng.toFixed(6) ?? '', v.pinId, v.id,
      ].map(csvCell).join(','),
    );
  }
  // Excel で文字化けしないよう BOM をつける
  download(`訪問記録-${stamp()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  return visits.length;
}
