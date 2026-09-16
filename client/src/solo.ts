import { AI_POOL, buildAiPrompt, rulesDecide, type AiDecision } from '../../shared/ai';
import { GameEngine } from '../../shared/engine';
import type { ActionType, FinalResult } from '../../shared/types';
import { toast, useStore, type Profile, type Settings } from './store';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface SoloConfig {
  name: string;
  aiCount: number;
  initChips: number;
  blindStart: number;
}

/** 单机模式驱动器：引擎跑在浏览器内（PRD §4.9.7），AI 决策经本地 Node 代理转发 DeepSeek */
class SoloDriver {
  engine: GameEngine;
  settings: Settings;
  private humanWait: { resolve: (a: { type: string; amount?: number }) => void } | null = null;

  constructor(cfg: SoloConfig, profile: Profile, settings: Settings) {
    this.settings = settings;
    const pool = [...AI_POOL].sort(() => Math.random() - 0.5);
    const players = [
      { id: 'me', nickname: profile.nickname || '你', emoji: profile.emoji || '😎', isAI: false, isHost: true },
      ...Array.from({ length: cfg.aiCount }, (_, i) => ({
        id: `ai-${i}`, nickname: pool[i % pool.length].nickname, emoji: pool[i % pool.length].emoji,
        isAI: true, isHost: false,
      })),
    ];
    this.engine = new GameEngine({
      name: cfg.name, mode: 'solo', initChips: cfg.initChips,
      blindStart: cfg.blindStart, handsPerLevel: 8, players,
    });
  }

  private push() {
    useStore.getState().setSnapshot(this.engine.snapshotFor('me'));
  }

  async run() {
    const e = this.engine;
    toast(`赛事「${e.name}」开始！${e.players.length} 人入座`);
    while (!e.over) {
      e.startHand();
      this.push();
      if (e.over) break;
      await sleep(800);

      let handDone = false;
      while (!handDone && !e.over) {
        const actor = e.currentActor();
        if (!actor) {
          await sleep(700);
          handDone = e.endRound() === 'hand_done';
          this.push();
          await sleep(500);
          continue;
        }
        this.push();
        if (actor.isAI) {
          await sleep(400 + Math.random() * 800); // 模拟思考 0.4-1.2s
          const d = await this.aiDecide(actor); // LLM 限时 6.8s → AI 总思考时长 ≤ 8s
          if (!e.applyAction(actor.id, d.type, d.amount)) {
            const fb = rulesDecide(e, actor); // 兜底规则引擎
            e.applyAction(actor.id, fb.type, fb.amount);
          }
          this.push();
          await sleep(350);
        } else {
          const a = await this.waitHuman(actor, 15000);
          if (e.over) break;
          if (a.type === 'check' && e.currentBet > actor.roundBet) a.type = 'fold';
          e.applyAction(actor.id, a.type, a.amount);
          this.push();
          await sleep(300);
        }
      }
      if (e.over) break;

      e.checkEliminations();
      this.push();
      if (e.isTournamentOver()) break;
      await sleep(1400);
    }
    this.finish();
  }

  private waitHuman(p: { id: string; roundBet: number }, ms: number) {
    return new Promise<{ type: string; amount?: number }>(resolve => {
      const timer = setTimeout(() => {
        if (this.humanWait) this.humanWait = null;
        const canCheck = this.engine.currentBet === p.roundBet;
        if (canCheck) toast('超时：自动过牌'); else toast('超时：自动弃牌');
        resolve({ type: canCheck ? 'check' : 'fold' });
      }, ms);
      this.humanWait = {
        resolve: a => { clearTimeout(timer); resolve(a); },
      };
    });
  }

  humanAct(type: string, amount?: number) {
    if (!this.humanWait) return;
    const w = this.humanWait;
    this.humanWait = null;
    w.resolve({ type, amount });
  }

  endEarly() {
    this.engine.over = true;
    this.humanWait?.resolve({ type: 'fold' });
    this.humanWait = null;
  }

  /** LLM 决策（经代理），失败重试 1 次后回退规则引擎（PRD §6.4） */
  private llmWarned = false; // 失败提示只弹一次，避免每手牌刷屏

  /** 从 LLM 输出中提取决策 JSON：容忍 markdown 围栏 / 前后解释文字 */
  private parseDecision(raw: string): AiDecision | null {
    const text = String(raw || '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const j = JSON.parse(text.slice(start, end + 1));
      const t = j.action;
      if (typeof t === 'string' && ['fold', 'check', 'call', 'bet', 'raise', 'all_in'].includes(t)) {
        return { type: t as ActionType, amount: typeof j.amount === 'number' ? j.amount : undefined };
      }
    } catch { /* 格式不符 */ }
    return null;
  }

  private async aiDecide(p: (typeof this.engine.players)[number]): Promise<AiDecision> {
    if (!this.settings.apiKey) return rulesDecide(this.engine, p);
    const deadline = Date.now() + 6800; // LLM 预算 6.8s（+ 模拟思考 ≤1.2s ≈ 8s 内必须行动）
    let lastErr = '未知错误';
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left < 300) { lastErr = '思考超时'; break; }
      try {
        const { system, user } = buildAiPrompt(this.engine, p);
        const res = await fetch('/api/ai/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: this.settings.apiKey, model: this.settings.model, system, user }),
          signal: AbortSignal.timeout(left),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: res.statusText }));
          lastErr = String((d as any).error || res.statusText);
          break; // 4xx/5xx（Key 无效/额度不足等）重试无意义
        }
        const data = await res.json();
        const d = this.parseDecision(data.content);
        if (d) return d;
        lastErr = '模型未返回合法决策 JSON';
      } catch (e: any) {
        lastErr = e?.name === 'TimeoutError' || e?.name === 'AbortError'
          ? '思考超时（>8s），已回退规则引擎'
          : String(e?.message || e);
        break; // 超时/网络错误不再重试
      }
    }
    if (!this.llmWarned) {
      this.llmWarned = true;
      toast(`DeepSeek 调用失败，AI 已回退规则引擎：${lastErr}`);
    }
    return rulesDecide(this.engine, p);
  }

  private finish() {
    const e = this.engine;
    const result: FinalResult = { name: e.name, hands: e.handNo, ranking: e.ranking() };
    const st = useStore.getState();
    st.setResult(result);
    st.addRecent({
      name: e.name, mode: 'solo', date: new Date().toLocaleString('zh-CN'),
      hands: e.handNo, champion: `${result.ranking[0]?.emoji ?? ''} ${result.ranking[0]?.nickname ?? ''}`,
      myNet: result.ranking.find(r => r.id === 'me')?.net ?? 0,
    });
    st.setView('results');
  }
}

export let soloDriver: SoloDriver | null = null;

export function startSolo(cfg: SoloConfig) {
  const st = useStore.getState();
  st.setMyId('me'); // 单机模式人类玩家固定 id 为 'me'（联机模式则为 socket.id）
  soloDriver = new SoloDriver(cfg, st.profile, st.settings);
  st.setView('game');
  soloDriver.run();
}

export function soloHumanAct(type: string, amount?: number) {
  soloDriver?.humanAct(type, amount);
}

export function endSoloEarly() {
  soloDriver?.endEarly();
}
