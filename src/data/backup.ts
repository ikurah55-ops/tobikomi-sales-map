import type { Pin, Visit } from '../types';
import { COMPETITOR_LABEL, HOUSING_LABEL, PRESENCE_LABEL, REACTION_LABEL, WEATHER_LABEL } from '../lib/records';
import { listPins, listVisits, upsertRecords } from './repository';

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

export async function exportJson(): Promise<number> {
  const [pins, visits] = await Promise.all([listPins(), listVisits()]);
  const body = { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), pins, visits };
  download(`訪問記録-${stamp()}.json`, JSON.stringify(body, null, 1), 'application/json');
  return visits.length;
}

export async function importJson(file: File): Promise<{ pins: number; visits: number }> {
  const data = JSON.parse(await file.text());
  if (data?.app !== APP_ID || !Array.isArray(data.pins) || !Array.isArray(data.visits)) {
    throw new Error('このアプリのバックアップファイルではありません');
  }
  const pins = (data.pins as Pin[]).filter((p) => p && typeof p.id === 'string' && typeof p.lat === 'number');
  const visits = (data.visits as Visit[]).filter((v) => v && typeof v.id === 'string' && typeof v.pinId === 'string');
  await upsertRecords(pins, visits);
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
