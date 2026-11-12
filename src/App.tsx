import { MapPage } from './pages/MapPage';
import { HistoryPage } from './pages/HistoryPage';
import { RankingPage } from './pages/RankingPage';
import { SettingsPage } from './pages/SettingsPage';
import { useStore, type Tab } from './store';
import { DesktopModeHint } from './components/DesktopModeHint';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: '地図', icon: 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z' },
  { id: 'ranking', label: 'ランキング', icon: 'M4 20h4V10H4v10zm6 0h4V4h-4v16zm6 0h4v-7h-4v7z' },
  { id: 'history', label: '履歴', icon: 'M13 3a9 9 0 0 0-9 9H1l3.9 3.9L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z' },
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
        {tab === 'history' && <div className="tab-pane scroll"><HistoryPage /></div>}
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
