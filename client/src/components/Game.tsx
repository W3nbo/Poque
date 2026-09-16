import { useEffect, useState } from 'react';
import { rankStr, SUITS, isRed } from '../../../shared/cards';
import type { Card, SnapPlayer, Snapshot } from '../../../shared/types';
import { endLanGameEarly, endSoloEarly, leaveLanGame, performAction } from '../net';
import { useStore } from '../store';

function CardEl({ c, cls = '' }: { c: Card | null; cls?: string }) {
  if (!c) return <div className={'pcard placeholder ' + cls} />;
  return (
    <div className={`pcard ${cls} ${isRed(c.s) ? 'red' : ''}`}>
      <div className="rank">{rankStr(c.r)}</div>
      <div className="suit">{SUITS[c.s]}</div>
    </div>
  );
}

function seatClassName(p: SnapPlayer, snap: Snapshot) {
  let cls = 'seat';
  if (p.folded) cls += ' folded';
  if (snap.toAct === p.id && !snap.over) cls += ' acting';
  return cls;
}

export default function Game() {
  const snap = useStore(s => s.snapshot);
  const myId = useStore(s => s.myId);
  if (!snap) return null;

  const me = snap.players.find(p => p.id === myId);
  const isMyTurn = !!me && me.inHand && !me.folded && !me.allIn && snap.toAct === myId && !snap.over;
  const toCall = me ? snap.currentBet - me.roundBet : 0;
  const maxTo = me ? me.roundBet + me.chips : 0;

  const [amount, setAmount] = useState(0);
  const [pct, setPct] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);

  // 轮到自己时重置默认下注额与倒计时
  useEffect(() => {
    if (isMyTurn) {
      setPct(null);
      setAmount(Math.max(snap.minRaiseTo, Math.min(Math.round(snap.pot * 0.75), maxTo)));
      setTimeLeft(15);
    }
  }, [isMyTurn, snap.handNo, snap.stage, snap.toAct]);

  useEffect(() => {
    if (!isMyTurn) return;
    const iv = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(iv);
  }, [isMyTurn, snap.toAct, snap.handNo, snap.stage]);

  const setPctAmount = (p: number) => {
    setPct(p);
    if (!me) return;
    if (p === 99) { setAmount(maxTo); return; }
    const target = Math.round(snap.pot * p);
    setAmount(Math.max(snap.minRaiseTo, Math.min(target, maxTo)));
  };

  const total = Math.max(snap.players.length, 2);
  const seatPos = (i: number) => {
    const ang = Math.PI / 2 + (i / total) * Math.PI * 2;
    return { left: `${50 + 38 * Math.cos(ang)}%`, top: `${50 + 37 * Math.sin(ang)}%` };
  };
  const betPos = (i: number) => {
    const ang = Math.PI / 2 + (i / total) * Math.PI * 2;
    return { left: `${50 + 27 * Math.cos(ang)}%`, top: `${50 + 24 * Math.sin(ang)}%` };
  };

  const acting = snap.players.find(p => p.id === snap.toAct);
  const waitNote = snap.over ? '' : isMyTurn ? '轮到你行动'
    : acting?.isAI ? `${acting.nickname}（AI）思考中…`
    : acting ? `等待 ${acting.nickname} 行动…` : '';

  const banner = snap.lastResult && snap.stage === 'ended' ? snap.lastResult : null;

  return (
    <div className="view game-screen">
      <div className="game-top">
        <div className="info">
          <b>{snap.name}</b>
          <span>第 <b>{snap.handNo}</b> 手</span>
          <span className="blind-chip">Lv.{snap.blindLv + 1} {snap.sb}/{snap.bb}{snap.ante ? ` (ante ${snap.ante})` : ''}</span>
        </div>
        <div className="info">
          <span>{snap.mode === 'solo' ? '单机 vs AI' : '局域网联机'}</span>
          {snap.mode === 'solo' ? (
            <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={() => { if (confirm('确定提前结束赛事并结算？')) endSoloEarly(); }}>结束赛事</button>
          ) : (
            <>
              {(me?.isHost) && (
                <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}
                  onClick={() => { if (confirm('确定提前结束赛事并结算？')) endLanGameEarly(); }}>结束赛事</button>
              )}
              <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => { if (confirm('离开赛事？断线期间将自动过牌/弃牌')) leaveLanGame(); }}>离开</button>
            </>
          )}
        </div>
      </div>

      <div className="table-area">
        <div className="table-oval" />
        <div className="table-rail" />
        <div className="table-name">{snap.name.toUpperCase()}</div>
        <div className="hand-log">{snap.log.map((l, i) => <div key={i}>{l}</div>)}</div>
        <div className="stage-tag">{snap.stage === 'ended' ? '' : ({ preflop: '翻前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌' } as Record<string, string>)[snap.stage] ?? ''}</div>
        <div className="board">
          {snap.community.map((c, i) => <CardEl key={i} c={c} />)}
        </div>
        <div className="pot-label">底池 {snap.pot}</div>
        <div className={'banner' + (banner ? ' show' : '')}>
          <div className="who">{banner?.winners.map(w => `${w.emoji} ${w.nickname}`).join(' & ')}</div>
          <div className="what">{banner ? (banner.showdownMode ? `赢得底池 · ${banner.handName}` : '其他玩家全部弃牌，直接收池') : ''}</div>
        </div>

        {snap.players.map((p, i) => !p.eliminated && (
          <div key={p.id} className={seatClassName(p, snap)} style={seatPos(i)}>
            <div className="avatar">
              {p.emoji}
              {snap.dealerId === p.id && <span className="dealer-btn">D</span>}
              {p.id !== myId && <span className="badge">{p.isAI ? '🤖' : p.isHost ? '👑' : ''}</span>}
            </div>
            <div className="name">{p.nickname}{p.allIn && p.inHand && !p.folded ? ' 🔥' : ''}</div>
            <div className="chips">{p.chips} <span style={{ opacity: .6 }}>chip</span></div>
            {p.id !== myId && (
              <div className="cards">
                {p.inHand && !p.folded && p.hole.map((c, j) => <CardEl key={j} c={c} cls="sm" />)}
              </div>
            )}
          </div>
        ))}

        {snap.players.map((p, i) => p.inHand && !p.folded && p.roundBet > 0 && (
          <div key={`bet-${p.id}`} className="bet-chip" style={betPos(i)}>{p.roundBet}</div>
        ))}
      </div>

      <div className="action-zone">
        <div className="my-hand">
          {me && me.inHand && !me.folded && me.hole.map((c, i) => <CardEl key={i} c={c} />)}
        </div>
        {isMyTurn && (
          <div className="timer-bar"><i style={{ width: `${timeLeft / 15 * 100}%` }} /></div>
        )}
        <div className={'action-bar' + (isMyTurn ? '' : ' disabled')}>
          <div className="pct-group">
            {[[0.25, '25%'], [0.33, '33%'], [0.75, '75%'], [1.33, '133'], [99, 'ALL']].map(([p, label]) => (
              <button key={label as string} className={'pct-btn' + (pct === p ? ' active' : '')}
                onClick={() => setPctAmount(p as number)}>{label as string}</button>
            ))}
          </div>
          <button className="btn-fold" onClick={() => performAction('fold')}>Fold</button>
          <button className="btn-call" onClick={() => performAction(toCall <= 0 ? 'check' : 'call')}>
            {toCall <= 0 ? 'Check' : toCall >= (me?.chips ?? 0) ? `All-in Call ${me?.chips}` : `Call ${toCall}`}
          </button>
          <button className="btn-bet" onClick={() => performAction(snap.currentBet === 0 ? 'bet' : 'raise', amount)}>
            {snap.currentBet === 0 ? 'Bet' : 'Raise to'} {amount}
          </button>
        </div>
        <div className="wait-note">{waitNote}</div>
      </div>
    </div>
  );
}
