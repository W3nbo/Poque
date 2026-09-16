import { useStore } from '../store';
import Sidebar from './Sidebar';

export default function Recent() {
  const recent = useStore(s => s.recent);
  return (
    <div className="view">
      <Sidebar active="recent" />
      <div className="main">
        <div className="topbar">
          <div>📜 Recent · 最近玩过的赛事（仅本地缓存）</div>
        </div>
        <div className="content">
          <div className="room-list-title" style={{ maxWidth: 640 }}>最近赛事</div>
          {recent.length === 0 && <div className="empty-note">还没有记录，开一局吧</div>}
          {recent.map((r, i) => (
            <div key={i} className="recent-item">
              <div>
                <b>{r.mode === 'solo' ? '🤖' : '🌐'} {r.name}</b>
                <div className="meta">{r.date} · {r.hands} 手 · 冠军 {r.champion}</div>
              </div>
              <div style={{ fontWeight: 800, color: r.myNet >= 0 ? 'var(--accent)' : '#ef4444' }}>
                {r.myNet >= 0 ? '+' : ''}{r.myNet}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
