import { useStore } from '../store';

export default function Sidebar({ active }: { active: 'home' | 'recent' | string }) {
  const setView = useStore(s => s.setView);
  const theme = useStore(s => s.theme);
  const setTheme = useStore(s => s.setTheme);
  const setSettingsOpen = useStore(s => s.setSettingsOpen);

  return (
    <div className="sidebar">
      <div className="logo">
        <div className="logo-mark">P</div>
        <div className="logo-name">Poque</div>
      </div>
      <div className={'nav-item' + (active === 'home' ? ' on' : '')} onClick={() => setView('home')}>🏠 Home</div>
      <div className={'nav-item' + (active === 'recent' ? ' on' : '')} onClick={() => setView('recent')}>📜 Recent</div>
      <div className="nav-item" onClick={() => setSettingsOpen(true)}>⚙️ Settings</div>
      <div className="sidebar-foot">
        <div className="theme-label">主题</div>
        <select className="theme-select" value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark')}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <div className="ver">Poque v0.1 · 桌面端 1440px+</div>
      </div>
    </div>
  );
}
