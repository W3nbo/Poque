import { useState } from 'react';
import { socket } from '../net';
import { toast, useStore } from '../store';
import Sidebar from './Sidebar';

const genCode = () => String(1000 + Math.floor(Math.random() * 9000));

export default function LanConfigPage() {
  const setView = useStore(s => s.setView);
  const profile = useStore(s => s.profile);
  const [name, setName] = useState('Poque 局');
  const [code, setCode] = useState(genCode);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [initChips, setInitChips] = useState(1000);
  const [blindStart, setBlindStart] = useState(0);

  const create = () => {
    if (!profile.nickname.trim()) return toast('请先填写昵称');
    useStore.getState().setMyId(socket.id || ''); // 联机模式以 socket.id 标识自己
    socket.emit('room:create', {
      name: name.slice(0, 20) || 'Poque 局',
      maxPlayers,
      initChips: Math.max(100, Math.min(100000, initChips || 1000)),
      blindStart,
    }, { nickname: profile.nickname, emoji: profile.emoji }, (res: { ok: boolean; code?: string; error?: string }) => {
      if (!res.ok) toast(res.error || '创建失败');
      else toast(`房间已创建，房间码 ${res.code}`);
    });
  };

  return (
    <div className="view">
      <Sidebar active="home" />
      <div className="main">
        <div className="topbar">
          <div>🌐 创建赛事（联机）· <span style={{ color: 'var(--text2)' }}>同一网络的朋友可通过房间码或房间列表加入</span></div>
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
                <label>房间码<span className="hint">朋友输入 4 位房间码即可加入</span></label>
                <div className="code-gen">
                  <span className="code">{code}</span>
                  <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setCode(genCode)}>🔄</button>
                </div>
              </div>
              <div className="field">
                <label>玩家上限</label>
                <div className="stepper">
                  <button onClick={() => setMaxPlayers(v => Math.max(2, v - 1))}>−</button>
                  <span className="val">{maxPlayers}</span>
                  <button onClick={() => setMaxPlayers(v => Math.min(9, v + 1))}>＋</button>
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
              <button className="btn btn-primary" onClick={create}>创建赛事</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
