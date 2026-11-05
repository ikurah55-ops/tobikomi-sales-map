import { useState } from 'react';
import { addCustomParking } from '../data/repository';
import { useStore } from '../store';
import { BottomSheet, Field } from './ui';

/** 店のデータにない場所を「使える駐車場」として登録する */
export function ParkingForm({ lat, lng, onClose }: { lat: number; lng: number; onClose: () => void }) {
  const { toast, settings, updateSettings } = useStore();
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');

  const save = async () => {
    await addCustomParking({ name: name.trim() || '駐車場', memo: memo.trim(), lat, lng });
    if (!settings.showFacilities) updateSettings({ showFacilities: true });
    toast('使える駐車場を登録しました');
    onClose();
  };

  return (
    <BottomSheet
      title={<>使える駐車場を登録 <small>長押しした位置</small></>}
      onClose={onClose}
      footer={<button className="btn btn-primary btn-block btn-lg" onClick={save}>登録</button>}
    >
      <Field label="名前">
        <input className="input" value={name} maxLength={40} placeholder="例: 公民館の駐車場" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="メモ(任意)">
        <input className="input" value={memo} maxLength={100} placeholder="例: 平日昼は空いている" onChange={(e) => setMemo(e.target.value)} />
      </Field>
      <p className="muted small">登録した駐車場は緑の「P★」で地図にいつも出ます。この端末にだけ保存され、JSONバックアップにも入ります。</p>
    </BottomSheet>
  );
}
