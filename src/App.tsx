import { lazy, Suspense } from 'react';
import { MapPage } from './pages/MapPage';
import { RankingPage } from './pages/RankingPage';
import { SettingsPage } from './pages/SettingsPage';
import { useStore, type Tab } from './store';
import { DesktopModeHint } from './components/DesktopModeHint';

// グラフ(Recharts)は分析画面を開いたときだけ読み込む
const AnalysisPage = lazy(() => import('./pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })));

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: '地図', icon: 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' },
  { id: 'ranking', label: 'ランキング', icon: 'M4 20h4V10H4v10zm6 0h4V4h-4v16zm6 0h4v-7h-4v7z' },
  { id: 'analysis', label: '分析', icon: 'M3 3v18h18v-2H5V3H3zm4 12 3.5-4 3 3L19 7.5 17.6 6l-4.1 4.6-3-3L5.6 13.6 7 15z' },
  { id: 'settings', label: '設定', icon: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.9c-.6.3-1.2.6-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.2-1.6zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z' },
];

export default function App() {
  const { tab, setTab, toastMsg } = useStore();
  return (
    <div className="app">
      <main className="app-main">
        {/* 地図は消さずに隠す(位置・拡大率を保つため) */}
        <div className="tab-pane" hidden={tab !== 'map'}><MapPage /></div>
        {tab === 'ranking' && <div className="tab-pane scroll"><RankingPage /></div>}
        {tab === 'analysis' && <div className="tab-pane scroll"><Suspense fallback={<p className="muted empty">読み込み中…</p>}><AnalysisPage /></Suspense></div>}
        {tab === 'settings' && <div className="tab-pane scroll"><SettingsPage /></div>}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" aria-hidden><path d={t.icon} /></svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      <DesktopModeHint />
    </div>
  );
}
