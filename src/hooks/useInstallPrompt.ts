import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// beforeinstallprompt は設定画面を開く前に届くことがあるので、読み込み時から受け取っておく
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Chrome がインストール可能と判断したときだけ install() が使える */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferred);
  useEffect(() => {
    const l = () => setCanInstall(!!deferred);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);

  const install = async () => {
    if (!deferred) return false;
    const ev = deferred;
    deferred = null;
    notify();
    await ev.prompt();
    return (await ev.userChoice).outcome === 'accepted';
  };

  return { canInstall, install };
}
