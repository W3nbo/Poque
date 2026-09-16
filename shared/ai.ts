import { best7, cardStr, chen } from './cards';
import type { GameEngine } from './engine';
import type { ActionType, EnginePlayer } from './types';

/** AI 玩家预设池（PRD §4.9.2） */
export const AI_POOL = [
  { nickname: 'Finn', emoji: '🦊' }, { nickname: 'Panda', emoji: '🐼' },
  { nickname: 'Ink', emoji: '🐙' }, { nickname: 'Wade', emoji: '🐳' },
  { nickname: 'Rex', emoji: '🦖' }, { nickname: 'Buzz', emoji: '🐝' },
  { nickname: 'Hopper', emoji: '🐸' }, { nickname: 'Pip', emoji: '🐧' },
];

export interface AiDecision { type: ActionType; amount?: number }

function betOrRaise(e: GameEngine, p: EnginePlayer, amt: number): AiDecision {
  const minTo = e.currentBet === 0 ? e.bb : e.currentBet + e.lastRaise;
  const to = Math.max(amt, minTo);
  if (to >= p.roundBet + p.chips) return { type: 'all_in' };
  return { type: e.currentBet === 0 ? 'bet' : 'raise', amount: to };
}

/** 规则兜底引擎：Chen 起手牌 + 牌力 + 位置无关的简单三段式（PRD §4.9.4） */
export function rulesDecide(e: GameEngine, p: EnginePlayer): AiDecision {
  const toCall = e.currentBet - p.roundBet;

  if (e.stage === 'preflop') {
    const c = chen(p.hole[0], p.hole[1]);
    const r = Math.random();
    if (c >= 9 && r < 0.75) return betOrRaise(e, p, e.currentBet * 2 + (e.currentBet <= e.bb ? 0 : e.lastRaise));
    if (c >= 7 && r < 0.35) return betOrRaise(e, p, e.currentBet * 2);
    if (c >= 5.5 || toCall === 0) return { type: 'call' };
    if (c >= 4.5 && toCall <= e.bb * 2) return { type: 'call' };
    return { type: toCall === 0 ? 'check' : 'fold' };
  }

  const strength = best7([...p.hole, ...e.community]) / 15 ** 5 + Math.random() * 1.2;
  if (strength > 2.6 && Math.random() < 0.7) return betOrRaise(e, p, Math.round((e.potTotal() + toCall * 2) * (0.5 + Math.random() * 0.35)));
  if (strength > 1.3 || toCall === 0) return { type: toCall === 0 ? 'check' : 'call' };
  if (Math.random() < 0.12 && toCall === 0) return betOrRaise(e, p, Math.round(e.potTotal() * 0.6));
  return { type: toCall === 0 ? 'check' : 'fold' };
}

/** 构造 LLM 决策 prompt（PRD §6.3）：只含当前手信息，严格 JSON 输出 */
export function buildAiPrompt(e: GameEngine, p: EnginePlayer): { system: string; user: string } {
  const legal = e.legalInfo(p.id);
  const state = {
    yourCards: p.hole.map(cardStr),
    community: e.community.map(cardStr),
    stage: e.stage,
    pot: e.potTotal(),
    toCall: legal.toCall,
    yourChips: p.chips,
    yourBetThisRound: p.roundBet,
    blindLevel: e.blindLv + 1,
    blinds: `${e.sb}/${e.bb}`,
    players: e.players.filter(q => !q.eliminated).map(q => ({
      name: q.nickname, chips: q.chips, betThisRound: q.roundBet,
      folded: q.folded, allIn: q.allIn, isYou: q.id === p.id,
    })),
    actionHistory: e.log.slice(-20),
    legalActions: legal.toCall <= 0 ? ['check', 'bet', 'all_in'] : ['fold', 'call', 'raise', 'all_in'],
    minRaiseTo: legal.minTo,
    maxRaiseTo: legal.maxTo,
  };
  const system =
    `你是一名德州扑克（No-Limit Hold'em）锦标赛玩家，目标是积累筹码。根据当前局面决策。` +
    `只输出一个 JSON 对象，格式：{"action":"fold|check|call|bet|raise|all_in","amount":<数字>}。` +
    `amount 仅 bet/raise 需要，表示加注到的总额，范围 [minRaiseTo, maxRaiseTo]。禁止输出任何解释文字。`;
  return { system, user: JSON.stringify(state) };
}
