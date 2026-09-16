import type { Card } from './types';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const isRed = (s: number) => s === 1 || s === 2;
export const rankStr = (r: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[r] || String(r);
export const cardStr = (c: Card) => `${SUITS[c.s]}${rankStr(c.r)}`;

/** 标准盲注表（MTT 预设，PRD §4.6） */
export const BLINDS: [number, number, number][] = [
  [10, 20, 0], [15, 30, 0], [25, 50, 0], [50, 100, 0], [75, 150, 0],
  [100, 200, 25], [150, 300, 25], [250, 500, 50], [400, 800, 50], [600, 1200, 100],
];

export const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '皇家/同花顺'];

export function newDeck(): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** 5 张牌力评分：类别 + kicker 依次编码 */
export function eval5(cs: Card[]): number {
  const rs = cs.map(c => c.r).sort((a, b) => b - a);
  const flush = cs.every(c => c.s === cs[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
  }
  const cnt: Record<number, number> = {};
  rs.forEach(r => (cnt[r] = (cnt[r] || 0) + 1));
  const g = Object.entries(cnt).map(([r, c]) => ({ r: +r, c })).sort((a, b) => b.c - a.c || b.r - a.r);
  let cat: number, tie: number[];
  if (straightHigh && flush) { cat = 8; tie = [straightHigh]; }
  else if (g[0].c === 4) { cat = 7; tie = [g[0].r, g[1].r]; }
  else if (g[0].c === 3 && g[1] && g[1].c === 2) { cat = 6; tie = [g[0].r, g[1].r]; }
  else if (flush) { cat = 5; tie = rs; }
  else if (straightHigh) { cat = 4; tie = [straightHigh]; }
  else if (g[0].c === 3) { cat = 3; tie = [g[0].r, ...g.slice(1).map(x => x.r)]; }
  else if (g[0].c === 2 && g[1] && g[1].c === 2) { cat = 2; tie = [g[0].r, g[1].r, g[2].r]; }
  else if (g[0].c === 2) { cat = 1; tie = [g[0].r, ...g.slice(1).map(x => x.r)]; }
  else { cat = 0; tie = rs; }
  let sc = cat;
  for (let i = 0; i < 5; i++) sc = sc * 15 + (tie[i] || 0);
  return sc;
}

/** 从 5/6/7 张牌中取最优 5 张组合的评分 */
export function best7(cards: Card[]): number {
  const n = cards.length;
  if (n < 5) return -1;
  let best = -1;
  for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
    for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
      const s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
      if (s > best) best = s;
    }
  return best;
}

export const catOf = (score: number) => Math.floor(score / 15 ** 5);

/** Chen 起手牌强度 */
export function chen(c1: Card, c2: Card): number {
  const v = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let sc = Math.max(v(c1.r), v(c2.r));
  if (c1.r === c2.r) sc = Math.max(5, sc * 2);
  if (c1.s === c2.s) sc += 2;
  const gap = Math.abs(c1.r - c2.r);
  if (c1.r !== c2.r) sc += gap === 1 ? 0 : gap === 2 ? -1 : gap === 3 ? -2 : gap === 4 ? -4 : -5;
  if (gap <= 2 && Math.max(c1.r, c2.r) < 12) sc += 1;
  return sc;
}
