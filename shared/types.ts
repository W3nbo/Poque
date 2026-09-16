export interface Card { r: number; s: number } // s: 0♠ 1♥ 2♦ 3♣

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
export type Stage = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

export interface PlayerInit {
  id: string;
  nickname: string;
  emoji: string;
  isAI: boolean;
  isHost: boolean;
}

export interface EnginePlayer extends PlayerInit {
  chips: number;
  hole: Card[];
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  roundBet: number;
  acted: boolean;
  eliminated: boolean;
}

export interface HandResultInfo {
  winners: { id: string; nickname: string; emoji: string }[];
  amount: number; // 每人分得
  showdownMode: boolean;
  handName?: string;
}

export interface SnapPlayer {
  id: string;
  nickname: string;
  emoji: string;
  isAI: boolean;
  isHost: boolean;
  chips: number;
  roundBet: number;
  folded: boolean;
  allIn: boolean;
  inHand: boolean;
  eliminated: boolean;
  hole: Card[]; // 仅自己或摊牌时有值
}

export interface Snapshot {
  name: string;
  mode: 'solo' | 'lan';
  handNo: number;
  stage: Stage;
  blindLv: number;
  sb: number;
  bb: number;
  ante: number;
  community: (Card | null)[];
  pot: number; // 含本轮未收入池的下注
  currentBet: number;
  minRaiseTo: number;
  revealAll: boolean;
  over: boolean;
  players: SnapPlayer[];
  toAct: string | null;
  dealerId: string | null;
  log: string[];
  lastResult: HandResultInfo | null;
}

export interface RankRow {
  id: string;
  nickname: string;
  emoji: string;
  isAI: boolean;
  chips: number;
  net: number;
}

export interface FinalResult {
  name: string;
  hands: number;
  ranking: RankRow[];
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  emoji: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  status: 'lobby' | 'playing' | 'finished';
  players: LobbyPlayer[];
}

export interface RoomBrief {
  code: string;
  name: string;
  hostNickname: string;
  hostEmoji: string;
  players: number;
  maxPlayers: number;
  blindStart: number;
}
