import { socket } from '../net';
import { useStore } from '../store';

export default function Lobby() {
  const lobby = useStore(s => s.lobby);
  const myId = useStore(s => s.myId);
  if (!lobby) return null;

  const isHost = lobby.hostId === myId;
  const me = lobby.players.find(p => p.id === myId);
  const total = Math.max(lobby.players.length, 2);

  const seatPos = (i: number) => {
    const ang = Math.PI / 2 + (i / total) * Math.PI * 2;
    return { left: `${50 + 38 * Math.cos(ang)}%`, top: `${50 + 37 * Math.sin(ang)}%` };
  };

  return (
    <div className="view game-screen">
      <div className="game-top">
        <div className="info">
          <b>{lobby.name}</b>
          <span>房间码 <b>{lobby.code}</b></span>
          <button className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: 12 }}
            onClick={() => { navigator.clipboard?.writeText(lobby.code); useStore.getState().showToast('房间码已复制'); }}>
            复制
          </button>
        </div>
        <div className="info">
          <span>{lobby.players.length} / {lobby.maxPlayers} 人</span>
          <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => socket.emit('room:leave')}>离开</button>
        </div>
      </div>
      <div className="table-area">
        <div className="table-oval" />
        <div className="table-rail" />
        <div className="table-name">{lobby.name.toUpperCase()}</div>
        {lobby.players.map((p, i) => (
          <div key={p.id} className={'seat' + (p.connected ? '' : ' disconnected')} style={seatPos(i)}>
            <div className="avatar">
              {p.emoji}
              {p.isHost && <span className="badge">👑</span>}
            </div>
            <div className="name">{p.nickname}</div>
            <div className="ready-tag ok">{p.isReady ? '就绪 ✓' : '未就绪…'}</div>
          </div>
        ))}
        <div className="side-panel">
          <h4>玩家（{lobby.players.length}/{lobby.maxPlayers}）</h4>
          {lobby.players.map(p => (
            <div key={p.id} className="row">
              <span>{p.emoji} {p.nickname}{p.id === myId ? '（我）' : ''}{p.isHost ? ' 👑' : ''}</span>
              {isHost && p.id !== myId && (
                <button className="kick" onClick={() => socket.emit('room:kick', { playerId: p.id })}>踢出</button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="lobby-foot">
        <button
          className="btn btn-secondary"
          onClick={() => socket.emit('room:ready')}
          disabled={me?.isReady}
        >
          {me?.isReady ? '已就绪 ✓' : '准备'}
        </button>
        {isHost && (
          <button className="btn btn-primary" disabled={lobby.players.length < 2} onClick={() => socket.emit('room:start')}>
            开始赛事{lobby.players.length < 2 ? '（至少 2 人）' : ''}
          </button>
        )}
        {!isHost && <span style={{ color: 'var(--text2)', fontSize: 13, alignSelf: 'center' }}>等待房主开始…</span>}
      </div>
    </div>
  );
}
