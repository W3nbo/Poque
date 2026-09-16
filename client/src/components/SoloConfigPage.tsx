import { useState } from 'react';
import { startSolo } from '../solo';
import { useStore } from '../store';
import Sidebar from './Sidebar';

export default function SoloConfigPage() {
  const setView = useStore(s => s.setView);
  const settings = useStore(s => s.settings);
  const [name, setName] = useState('Poque 局');
  const [aiCount, setAiCount] = useState(3);
  const [initChips, setInitChips] = useState(1000);
  const [blindStart, setBlindStart] = useState(0);

  return (
    <div className="view">
      <Sidebar active="home" />
      <div className="main">
        <div className="topbar">
          <div>🤖 单机 vs AI · <span style={{ color: 'var(--text2)' }}>
            {settings.apiKey ? `DeepSeek 决策（${settings.model}）` : '规则引擎驱动（未配置 API Key）'}
          </span></div>
          <div />
        </div>
        <div className="content">
          <div className="form-wrap">
            <div className="form-card">
              <h3>基本信息</h3>
              <div className="field">
                <label>赛事名称</label>
                <input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>AI 数量<span className="hint">自己 + AI，共 N+1 人入座</span></label>
                <div className="stepper">
                  <button onClick={() => setAiCount(v => Math.max(1, v - 1))}>−</button>
                  <span className="val">{aiCount}</span>
                  <button onClick={() => setAiCount(v => Math.min(8, v + 1))}>＋</button>
                </div>
              </div>
            </div>
            <div className="form-card">
              <h3>积分与盲注</h3>
              <div className="field">
                <label>每人初始积分</label>
                <input type="number" min={100} max={100000} step={100} value={initChips}
                  onChange={e => setInitChips(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>起始盲注级别</label>
                <select value={blindStart} onChange={e => setBlindStart(Number(e.target.value))}>
                  {['Level 1 (10/20)', 'Level 2 (15/30)', 'Level 3 (25/50)', 'Level 4 (50/100)', 'Level 5 (75/150)',
                    'Level 6 (100/200)', 'Level 7 (150/300)', 'Level 8 (250/500)', 'Level 9 (400/800)', 'Level 10 (600/1200)']
                    .map((t, i) => <option key={i} value={i}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>盲注节奏<span className="hint">每 8 手升一级（MTT 自动）</span></label>
                <span className="blind-chip">10/20 → 600/1200</span>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setView('home')}>取消</button>
              <button className="btn btn-primary" onClick={() => startSolo({
                name: name.slice(0, 20) || 'Poque 局',
                aiCount,
                initChips: Math.max(100, Math.min(100000, initChips || 1000)),
                blindStart,
              })}>开始赛事</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
