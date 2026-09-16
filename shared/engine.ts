import { BLINDS, best7, catOf, HAND_NAMES, newDeck } from './cards';
import type { Card, EnginePlayer, HandResultInfo, PlayerInit, Snapshot, SnapPlayer, Stage } from './types';

export interface EngineOpts {
  name: string;
  mode: 'solo' | 'lan';
  initChips: number;
  blindStart: number; // 0-based
  handsPerLevel?: number;
  players: PlayerInit[];
}

/**
 * 纯状态机德州引擎（无 DOM / 无 IO），单机模式跑在浏览器、联机模式跑在服务端。
 * 节奏（AI 延迟、15s 限时、街牌过渡）由外部驱动器控制：
 *   驱动循环: startHand → 循环 { currentActor()==null ? endRound() : applyAction() }
 */
export class GameEngine {
  name: string;
  mode: 'solo' | 'lan';
  initChips: number;
  handsPerLevel: number;
  players: EnginePlayer[];

  deck: Card[] = [];
  community: Card[] = [];
  pot = 0;
  stage: Stage = 'idle';
  handNo = 0;
  dealerIdx = -1;
  blindLv = 0;
  sb = 0;
  bb = 0;
  ante = 0;
  currentBet = 0;
  lastRaise = 0;
  toActIdx = -1;
  over = false;
  revealAll = false;
  log: string[] = [];
  lastResult: HandResultInfo | null = null;

  constructor(o: EngineOpts) {
    this.name = o.name;
    this.mode = o.mode;
    this.initChips = o.initChips;
    this.handsPerLevel = o.handsPerLevel ?? 8;
    this.blindLv = Math.max(0, Math.min(BLINDS.length - 1, o.blindStart));
    this.players = o.players.map(p => ({
      ...p,
      chips: o.initChips,
      hole: [],
      inHand: false,
      folded: false,
      allIn: false,
      roundBet: 0,
      acted: false,
      eliminated: false,
    }));
  }

  alive(): EnginePlayer[] { return this.players.filter(p => !p.eliminated); }
  activeInHand(): EnginePlayer[] { return this.players.filter(p => p.inHand && !p.folded); }
  canActPlayers(): EnginePlayer[] { return this.players.filter(p => p.inHand && !p.folded && !p.allIn); }
  potTotal(): number { return this.pot + this.players.reduce((s, p) => s + p.roundBet, 0); }
  private addLog(s: string) { this.log.push(s); }
  private idxOf(id: string) { return this.players.findIndex(p => p.id === id); }

  /** 当前应行动玩家；null = 本轮下注结束（驱动器应调用 endRound） */
  currentActor(): EnginePlayer | null {
    if (this.stage === 'ended' || this.stage === 'idle' || this.over) return null;
    const n = this.players.length;
    for (let k = 0; k < n; k++) {
      const p = this.players[(this.toActIdx + k) % n];
      if (!p.eliminated && p.inHand && !p.folded && !p.allIn && (!p.acted || p.roundBet < this.currentBet)) return p;
    }
    return null;
  }

  legalInfo(pId: string) {
    const p = this.players[this.idxOf(pId)];
    const toCall = this.currentBet - p.roundBet;
    const maxTo = p.roundBet + p.chips;
    const minTo = this.currentBet === 0 ? Math.min(this.bb, maxTo) : Math.min(this.currentBet + this.lastRaise, maxTo);
    return { toCall, canCheck: toCall <= 0, minTo, maxTo };
  }

  startHand() {
    if (this.over) return;
    const alive = this.alive();
    if (alive.length <= 1) { this.over = true; return; }
    if (this.handNo > 0 && this.handNo % this.handsPerLevel === 0 && this.blindLv < BLINDS.length - 1) this.blindLv++;
    const [sb, bb, ante] = BLINDS[this.blindLv];
    this.sb = sb; this.bb = bb; this.ante = ante;

    this.handNo++;
    this.deck = newDeck();
    this.community = [];
    this.pot = 0;
    this.stage = 'preflop';
    this.currentBet = bb;
    this.lastRaise = bb;
    this.revealAll = false;
    this.log = [];
    this.lastResult = null;

    this.players.forEach(p => {
      if (p.eliminated) return;
      p.inHand = true; p.folded = false; p.allIn = false; p.roundBet = 0; p.acted = false; p.hole = [];
    });
    if (ante) this.players.forEach(p => {
      if (p.eliminated) return;
      const a = Math.min(ante, p.chips);
      p.chips -= a; this.pot += a;
      if (p.chips === 0) p.allIn = true;
    });

    do { this.dealerIdx = (this.dealerIdx + 1) % this.players.length; } while (this.players[this.dealerIdx].eliminated);
    const aliveIdx = this.players.map((p, i) => ({ p, i })).filter(x => !x.p.eliminated).map(x => x.i);
    const dPos = aliveIdx.indexOf(this.dealerIdx);
    let sbIdx: number, bbIdx: number;
    if (aliveIdx.length === 2) { sbIdx = this.dealerIdx; bbIdx = aliveIdx[(dPos + 1) % 2]; }
    else { sbIdx = aliveIdx[(dPos + 1) % aliveIdx.length]; bbIdx = aliveIdx[(dPos + 2) % aliveIdx.length]; }

    this.players.forEach(p => { if (!p.eliminated) p.hole = [this.deck.pop()!, this.deck.pop()!]; });
    this.postBlind(this.players[sbIdx], sb);
    this.postBlind(this.players[bbIdx], bb);

    this.addLog(`— 第 ${this.handNo} 手 · 盲注 ${sb}/${bb}${ante ? ` · ante ${ante}` : ''} —`);
    this.toActIdx = (bbIdx + 1) % this.players.length;
  }

  private postBlind(p: EnginePlayer, amt: number) {
    const a = Math.min(amt, p.chips);
    p.chips -= a; p.roundBet += a;
    if (p.chips === 0) p.allIn = true;
  }

  /** amount 为 bet/raise "加注到的总额"；非法动作返回 false */
  applyAction(pId: string, type: string, amount?: number): boolean {
    const actor = this.currentActor();
    if (!actor || actor.id !== pId) return false;
    const p = actor;
    const toCall = this.currentBet - p.roundBet;

    if (type === 'fold') {
      if (toCall <= 0) return this.applyAction(pId, 'check');
      p.folded = true; p.acted = true;
      this.addLog(`${p.nickname} 弃牌`);
    } else if (type === 'check') {
      if (toCall > 0) return false;
      p.acted = true;
      this.addLog(`${p.nickname} 过牌`);
    } else if (type === 'call') {
      if (toCall <= 0) return this.applyAction(pId, 'check');
      const need = Math.min(toCall, p.chips);
      p.chips -= need; p.roundBet += need; p.acted = true;
      if (p.chips === 0) p.allIn = true;
      this.addLog(`${p.nickname} 跟注 ${need}${p.allIn ? '（全押）' : ''}`);
    } else if (type === 'bet' || type === 'raise' || type === 'all_in') {
      const maxTo = p.roundBet + p.chips;
      let to: number;
      if (type === 'all_in') to = maxTo;
      else {
        const minTo = this.currentBet === 0 ? Math.min(this.bb, maxTo) : Math.min(this.currentBet + this.lastRaise, maxTo);
        to = Math.max(minTo, Math.min(Math.round(amount ?? minTo), maxTo));
      }
      if (to <= this.currentBet) return this.applyAction(pId, 'call'); // 短码全押视作跟注
      const wasZero = this.currentBet === 0;
      const add = to - p.roundBet;
      p.chips -= add; p.roundBet = to;
      this.lastRaise = Math.max(this.bb, to - this.currentBet);
      this.currentBet = to; p.acted = true;
      if (p.chips === 0) p.allIn = true;
      this.players.forEach(q => { if (q !== p && q.inHand && !q.folded && !q.allIn) q.acted = false; });
      this.addLog(`${p.nickname} ${wasZero ? '下注' : '加注到'} ${to}${p.allIn ? '（全押）' : ''}`);
    } else {
      return false;
    }

    this.toActIdx = (this.idxOf(p.id) + 1) % this.players.length;
    return true;
  }

  /** 结束当前下注轮：收注入池 → 翻街或摊牌。返回 'hand_done' 表示本手结束 */
  endRound(): 'street' | 'hand_done' {
    this.players.forEach(p => { this.pot += p.roundBet; p.roundBet = 0; p.acted = false; });
    this.currentBet = 0;
    this.lastRaise = this.bb;

    const act = this.activeInHand();
    if (act.length === 1) { this.settleHand([act[0]], false); return 'hand_done'; }
    if (this.canActPlayers().length <= 1) this.revealAll = true; // 全押摊牌 runout

    if (this.stage === 'preflop') { this.stage = 'flop'; this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!); }
    else if (this.stage === 'flop') { this.stage = 'turn'; this.community.push(this.deck.pop()!); }
    else if (this.stage === 'turn') { this.stage = 'river'; this.community.push(this.deck.pop()!); }
    else if (this.stage === 'river') { this.showdown(); return 'hand_done'; }
    else { this.showdown(); return 'hand_done'; }

    this.addLog(`— ${this.stageCN()} —`);
    this.toActIdx = (this.dealerIdx + 1) % this.players.length;
    return 'street';
  }

  stageCN(): string {
    return ({ preflop: '翻前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌' } as Record<string, string>)[this.stage] || '';
  }

  private showdown() {
    this.stage = 'showdown';
    this.revealAll = true;
    const act = this.activeInHand();
    let best = -1;
    const winners: EnginePlayer[] = [];
    act.forEach(p => {
      const score = best7([...p.hole, ...this.community]);
      if (score > best) { best = score; winners.length = 0; winners.push(p); }
      else if (score === best) winners.push(p);
    });
    const handName = HAND_NAMES[catOf(best)];
    this.settleHand(winners, true, handName);
  }

  private settleHand(winners: EnginePlayer[], showdownMode: boolean, handName?: string) {
    this.players.forEach(p => { this.pot += p.roundBet; p.roundBet = 0; });
    const share = Math.floor(this.pot / winners.length);
    winners.forEach((w, i) => { w.chips += share + (i === 0 ? this.pot - share * winners.length : 0); });
    this.pot = 0;
    this.stage = 'ended';
    this.lastResult = {
      winners: winners.map(w => ({ id: w.id, nickname: w.nickname, emoji: w.emoji })),
      amount: share,
      showdownMode,
      handName,
    };
    this.addLog(`🏆 ${winners.map(w => `${w.emoji} ${w.nickname}`).join(' & ')} ${showdownMode ? `以 ${handName} 赢得底池` : '收池'}`);
  }

  checkEliminations() {
    this.players.forEach(p => {
      if (!p.eliminated && p.chips <= 0) {
        p.eliminated = true; p.inHand = false;
        this.addLog(`${p.nickname} 被淘汰`);
      }
    });
  }

  isTournamentOver(): boolean {
    if (this.alive().length <= 1) { this.over = true; return true; }
    return false;
  }

  ranking() {
    return [...this.players]
      .sort((a, b) => b.chips - a.chips)
      .map(p => ({ id: p.id, nickname: p.nickname, emoji: p.emoji, isAI: p.isAI, chips: p.chips, net: p.chips - this.initChips }));
  }

  snapshotFor(viewerId?: string): Snapshot {
    const actor = this.currentActor();
    const players: SnapPlayer[] = this.players.map(p => ({
      id: p.id, nickname: p.nickname, emoji: p.emoji, isAI: p.isAI, isHost: p.isHost,
      chips: p.chips, roundBet: p.roundBet, folded: p.folded, allIn: p.allIn,
      inHand: p.inHand, eliminated: p.eliminated,
      hole: this.revealAll || p.id === viewerId ? p.hole : [],
    }));
    return {
      name: this.name,
      mode: this.mode,
      handNo: this.handNo,
      stage: this.stage,
      blindLv: this.blindLv,
      sb: this.sb, bb: this.bb, ante: this.ante,
      community: [0, 1, 2, 3, 4].map(i => this.community[i] ?? null),
      pot: this.potTotal(),
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet === 0 ? this.bb : this.currentBet + this.lastRaise,
      revealAll: this.revealAll,
      over: this.over,
      players,
      toAct: actor?.id ?? null,
      dealerId: this.players[this.dealerIdx]?.id ?? null,
      log: this.log.slice(-14),
      lastResult: this.lastResult,
    };
  }
}
