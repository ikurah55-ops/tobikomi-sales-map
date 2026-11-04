import { useEffect, type ReactNode } from 'react';

export function BottomSheet({
  title, onClose, children, footer, tall,
}: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${tall ? ' sheet-tall' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  tone?: 'good' | 'info' | 'warn' | 'bad' | 'muted';
}

/** 大きなボタンで1つを選ぶ。選択中をもう一度押すと解除(allowClear 時) */
export function Choice<T extends string>({
  options, value, onChange, cols = 3, allowClear, disabled,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
  cols?: number;
  allowClear?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="choice" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          className={`choice-btn${value === o.value ? ' on' : ''}${o.tone ? ` tone-${o.tone}` : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value && allowClear ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
    </label>
  );
}

export const PRIVACY_NOTE = '氏名・電話番号・健康状態など個人情報は記録しないでください';
