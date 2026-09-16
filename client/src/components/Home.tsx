import { useRef, useState } from 'react';
import { socket } from '../net';
import { toast, useStore } from '../store';
import Sidebar from './Sidebar';

export default function Home() {
  const rooms = useStore(s => s.rooms);
  const connected = useStore(s => s.connected);
  const profile = useStore(s => s.profile);
  const settings = useStore(s => s.settings);
  const setView = useStore(s => s.setView);
  const setProfileOpen = useStore(s => s.setProfileOpen);

  const [code, setCode] = useState(['', '', '', '']);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const joinCode = code.join('');

  const onCodeInput = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 3) inputs.current[i + 1]?.focus();
  };

  const requireProfile = (fn: () => void) => {
    if (!profile.nickname.trim()) {
      toast('请先填写昵称');
      setProfileOpen(true);
      return;
    }
    fn();
  };

  const join = (roomCode: string) => {
    requireProfile(() => {
      if (!/^\d{4}$/.test(roomCode)) return toast('请输入 4 位数字房间码');
      useStore.getState().setMyId(socket.id || ''); // 联机模式以 socket.id 标识自己
      socket.emit('room:join', { code: roomCode, nickname: profile.nickname, emoji: profile.emoji }, (res: { ok: boolean; error?: string }) => {
        if (!res.ok) toast(res.error || '加入失败');
      });
    });
  };

  return (
    <div className="view">
      <Sidebar active="home" />
      <div className="main">
        <div className="topbar">
          <div><span className={'dot' + (connected ? '' : ' off')} />{connected ? '局域网在线' : '连接中…'}</div>
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>桌面端 · 1440px+</div>
        </div>
        <div className="content">
          <div className="home-hero">
            <h1>Poque</h1>
            <p>朋友消遣向德州扑克 · 每局独立 · 淘汰制 · 积分结算</p>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => requireProfile(() => setView('lan-config'))}>
              ＋ 创建赛事（联机）
            </button>
            <button className="btn btn-secondary" onClick={() => {
              setView('solo-config');
              if (!settings.apiKey) toast('未配置 DeepSeek API Key，AI 将由规则引擎驱动（可在 Settings 中配置）');
            }}>
              🤖 单机 vs AI
            </button>
          </div>
          <div className="join-card">
            {code.map((c, i) => (
              <input
                key={i}
                ref={el => { inputs.current[i] = el; }}
                className="code-input"
                inputMode="numeric"
                value={c}
                onChange={e => onCodeInput(i, e.target.value)}
                onKeyDown={e => { if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus(); }}
              />
            ))}
            <button className="btn btn-secondary" disabled={joinCode.length !== 4} onClick={() => join(joinCode)}>加入</button>
            <span style={{ color: 'var(--text2)', fontSize: 12, marginLeft: 8 }}>输入 4 位房间码</span>
          </div>

          <div className="room-list-title">局域网可见房间</div>
          {rooms.length === 0 && (
            <div className="empty-note">暂无可见房间 — 同一网络的朋友创建赛事后，房间会自动出现在这里</div>
          )}
          {rooms.map(r => (
            <div key={r.code} className="room-card" onClick={() => join(r.code)}>
              <div><b>{r.name}</b> <span className="meta">· 房主 {r.hostEmoji} {r.hostNickname}</span></div>
              <div className="meta">{r.players} / {r.maxPlayers} · Level {r.blindStart + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
