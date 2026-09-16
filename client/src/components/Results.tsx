import { useStore } from '../store';

export default function Results() {
  const result = useStore(s => s.result);
  const setView = useStore(s => s.setView);
  const setResult = useStore(s => s.setResult);
  if (!result) return null;

  const maxAbs = Math.max(...result.ranking.map(r => Math.abs(r.net)), 1);
  const champion = result.ranking[0];

  return (
    <div className="view">
      <div className="main">
        <div className="topbar">
          <div>Poque · 赛事结算</div>
          <button className="btn btn-ghost" onClick={() => { setResult(null); setView('home'); }}>返回首页</button>
        </div>
        <div className="content">
          <div className="results-wrap">
            <div className="trophy">🏆</div>
            <h1>赛事结束 — {result.name}</h1>
            <div className="sub">共 {result.hands} 手 · 冠军 {champion.emoji} {champion.nickname}</div>
            <div className="chart">
              {result.ranking.map((p, i) => {
                const net = p.net;
                const h = Math.max(6, (Math.abs(net) / maxAbs) * 210);
                return (
                  <div key={p.id} className="bar-col">
                    <div className="bar-val" style={{ color: net >= 0 ? 'var(--accent)' : '#ef4444' }}>
                      {net >= 0 ? '+' : ''}{net}
                    </div>
                    <div className={'bar' + (net < 0 ? ' neg' : '')} style={{ height: h }}>
                      {i === 0 && <div className="bar-crown">🏆</div>}
                    </div>
                    <div className="bar-label">
                      <span className="e">{p.emoji}</span>{p.nickname}
                      <div className="bar-sub">剩余 {p.chips}{p.isAI ? ' · AI' : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setView('solo-config')}>再开一局（单机）</button>
              <button className="btn btn-secondary" onClick={() => setView('lan-config')}>再开一局（联机）</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
