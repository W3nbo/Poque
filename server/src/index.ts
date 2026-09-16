import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketServer } from 'socket.io';
import { Bonjour } from 'bonjour-service';
import { GameEngine } from '../../shared/engine';
import type { FinalResult, LobbyPlayer, LobbyState, RoomBrief } from '../../shared/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '1mb' }));
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' } });

/* ================= DeepSeek 代理（单机模式专用，Key 仅透传不落盘） ================= */

async function callDeepSeek(apiKey: string, model: string, system: string, user: string, maxTokens: number, timeoutMs = 6500) {
  const started = Date.now();
  const mdl = model || 'deepseek-chat';
  // deepseek-reasoner：不支持 JSON Output（response_format 会 400）、temperature 无效、
  // thinking 模式下 max_tokens 包含思维链 token（官方文档：默认 64K）→ 必须给足预算，
  // 否则思维链耗尽额度后 content 为空（finish_reason: length）
  const isReasoner = mdl.includes('reasoner');
  const body: Record<string, unknown> = {
    model: mdl,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: isReasoner ? 8192 : maxTokens,
  };
  if (!isReasoner) {
    body.response_format = { type: 'json_object' };
    body.temperature = 0.7;
  }
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs), // decide 默认 6.5s（与客户端 8s 总预算对齐，避免空耗 token）
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const content = String(data.choices?.[0]?.message?.content ?? '');
  if (!content) {
    throw new Error(
      `模型返回空 content（finish_reason: ${data.choices?.[0]?.finish_reason ?? 'unknown'}，` +
      `reasoner 思维链可能耗尽 token 或超时）`,
    );
  }
  return { content, latency: Date.now() - started };
}

app.post('/api/ai/decide', async (req, res) => {
  const { apiKey, model, system, user } = req.body || {};
  if (!apiKey || !system || !user) return res.status(400).json({ error: 'missing apiKey/system/user' });
  try {
    const r = await callDeepSeek(apiKey, model, system, user, 200);
    res.json({ ok: true, content: r.content });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post('/api/ai/test', async (req, res) => {
  const { apiKey, model } = req.body || {};
  if (!apiKey) return res.status(400).json({ ok: false, error: '缺少 API Key' });
  try {
    const r = await callDeepSeek(apiKey, model, 'You are a test.', 'ping', 8, 30000); // 测试连接允许 reasoner 充分思考
    res.json({ ok: true, latency: r.latency });
  } catch (e: any) {
    res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ================= 房间管理 ================= */

interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  initChips: number;
  blindStart: number;
  status: 'lobby' | 'playing' | 'finished';
  players: LobbyPlayer[];
  engine: GameEngine | null;
  pending: { playerId: string; resolve: (a: { type: string; amount?: number }) => void } | null;
  driverRunning: boolean;
}

const rooms = new Map<string, Room>();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const genCode = () => {
  let code: string;
  do { code = String(1000 + Math.floor(Math.random() * 9000)); } while ([...rooms.values()].some(r => r.code === code));
  return code;
};
const uid = () => Math.random().toString(36).slice(2, 10);

function roomsBrief(): RoomBrief[] {
  return [...rooms.values()]
    .filter(r => r.status === 'lobby')
    .map(r => ({
      code: r.code,
      name: r.name,
      hostNickname: r.players.find(p => p.id === r.hostId)?.nickname ?? '',
      hostEmoji: r.players.find(p => p.id === r.hostId)?.emoji ?? '',
      players: r.players.length,
      maxPlayers: r.maxPlayers,
      blindStart: r.blindStart,
    }));
}

const broadcastRooms = () => io.emit('rooms', roomsBrief());

function lobbyState(r: Room): LobbyState {
  return {
    code: r.code, name: r.name, hostId: r.hostId, maxPlayers: r.maxPlayers,
    status: r.status, players: r.players,
  };
}
const emitRoomState = (r: Room) => io.to(r.id).emit('room:state', lobbyState(r));

/** 按玩家个性化广播对局快照（隐藏他人手牌） */
function broadcastGame(r: Room) {
  if (!r.engine) return;
  for (const pl of r.players) {
    io.to(pl.id).emit('game:state', r.engine.snapshotFor(pl.id));
  }
}

/* ================= 对局驱动（权威引擎 + 15s 限时） ================= */

function waitAction(r: Room, engine: GameEngine, actorId: string, ms: number) {
  return new Promise<{ type: string; amount?: number }>(resolve => {
    const timer = setTimeout(() => {
      if (r.pending?.playerId === actorId) r.pending = null;
      const p = engine.players.find(q => q.id === actorId)!;
      resolve({ type: engine.currentBet === p.roundBet ? 'check' : 'fold' }); // 超时自动 Check/Fold
    }, ms);
    r.pending = {
      playerId: actorId,
      resolve: a => { clearTimeout(timer); resolve(a); },
    };
  });
}

async function driveRoom(r: Room) {
  if (r.driverRunning) return;
  r.driverRunning = true;
  const e = r.engine!;
  try {
    while (!e.over) {
      e.startHand();
      broadcastGame(r);
      if (e.over) break;
      await sleep(800);

      let handDone = false;
      while (!handDone && !e.over) {
        const actor = e.currentActor();
        if (!actor) {
          await sleep(700);
          handDone = e.endRound() === 'hand_done';
          broadcastGame(r);
          await sleep(500);
          continue;
        }
        broadcastGame(r);
        const a = await waitAction(r, e, actor.id, 15000);
        if (e.over) break;
        e.applyAction(actor.id, a.type, a.amount);
        broadcastGame(r);
        await sleep(400);
      }
      if (e.over) break;

      e.checkEliminations();
      broadcastGame(r);
      if (e.isTournamentOver()) break;
      await sleep(1400);
    }
    finishRoom(r);
  } finally {
    r.driverRunning = false;
  }
}

function finishRoom(r: Room) {
  const e = r.engine!;
  r.status = 'finished';
  r.pending = null;
  const result: FinalResult = { name: r.name, hands: e.handNo, ranking: e.ranking() };
  io.to(r.id).emit('game:result', result);
  broadcastRooms();
  broadcastGame(r);
  setTimeout(() => { const rm = rooms.get(r.id); if (rm?.status === 'finished') rooms.delete(r.id); }, 60_000);
}

function startGame(r: Room) {
  if (r.status !== 'lobby' || r.players.length < 2) return;
  r.status = 'playing';
  r.engine = new GameEngine({
    name: r.name,
    mode: 'lan',
    initChips: r.initChips,
    blindStart: r.blindStart,
    handsPerLevel: 8,
    players: r.players.map(p => ({
      id: p.id, nickname: p.nickname, emoji: p.emoji, isAI: false, isHost: p.id === r.hostId,
    })),
  });
  emitRoomState(r);
  broadcastRooms();
  driveRoom(r);
}

/* ================= Socket 协议 ================= */

io.on('connection', socket => {
  socket.emit('rooms', roomsBrief());

  socket.on('room:create', (cfg: any, profile: any, cb: (r: any) => void) => {
    cb = cb || (() => {});
    const nickname = String(profile?.nickname || '').trim();
    if (!nickname) return cb({ ok: false, error: '请先填写昵称' });
    const room: Room = {
      id: `room-${uid()}`,
      code: genCode(),
      name: String(cfg?.name || 'Poque 局').slice(0, 20),
      hostId: socket.id,
      maxPlayers: Math.max(2, Math.min(9, Number(cfg?.maxPlayers) || 6)),
      initChips: Math.max(100, Math.min(100000, Number(cfg?.initChips) || 1000)),
      blindStart: Math.max(0, Math.min(9, Number(cfg?.blindStart) || 0)),
      status: 'lobby',
      players: [{ id: socket.id, nickname, emoji: profile?.emoji || '🐶', isHost: true, isReady: true, connected: true }],
      engine: null, pending: null, driverRunning: false,
    };
    rooms.set(room.id, room);
    socket.join(room.id);
    cb({ ok: true, code: room.code });
    emitRoomState(room);
    broadcastRooms();
  });

  socket.on('room:join', ({ code, nickname, emoji }: any, cb: (r: any) => void) => {
    cb = cb || (() => {});
    const name = String(nickname || '').trim();
    if (!name) return cb({ ok: false, error: '请先填写昵称' });
    const room = [...rooms.values()].find(r => r.code === String(code));
    if (!room) return cb({ ok: false, error: '房间不存在' });
    if (room.status !== 'lobby') return cb({ ok: false, error: '赛事已开始' });
    if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: '房间已满' });
    if (room.players.some(p => p.nickname === name)) return cb({ ok: false, error: '昵称已被使用' });
    room.players.push({ id: socket.id, nickname: name, emoji: emoji || '🐶', isHost: false, isReady: false, connected: true });
    socket.join(room.id);
    cb({ ok: true });
    emitRoomState(room);
    broadcastRooms();
  });

  socket.on('room:ready', () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.status !== 'lobby') return;
    const p = room.players.find(p => p.id === socket.id)!;
    p.isReady = !p.isReady;
    emitRoomState(room);
  });

  socket.on('room:leave', () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room) return;
    socket.leave(room.id);
    removePlayer(room, socket.id);
  });

  socket.on('room:kick', ({ playerId }: { playerId: string }) => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;
    if (playerId === socket.id) return;
    const target = room.players.find(p => p.id === playerId);
    if (!target) return;
    io.sockets.sockets.get(playerId)?.leave(room.id);
    io.to(playerId).emit('kicked');
    removePlayer(room, playerId);
  });

  socket.on('room:start', () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.hostId !== socket.id) return;
    startGame(room);
  });

  socket.on('room:end', () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.hostId !== socket.id || room.status !== 'playing' || !room.engine) return;
    room.engine.over = true; // 提前结束并结算
    room.pending?.resolve({ type: 'fold' });
  });

  socket.on('game:action', ({ type, amount }: { type: string; amount?: number }) => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room?.engine || !room.pending) return;
    if (room.pending.playerId !== socket.id) return;
    room.pending.resolve({ type, amount });
  });

  socket.on('disconnect', () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room) return;
    if (room.status === 'lobby') removePlayer(room, socket.id);
    else {
      // 对局中断线：保留席位，轮到时由 15s 限时自动 Check/Fold
      const p = room.players.find(p => p.id === socket.id);
      if (p) p.connected = false;
    }
  });
});

function removePlayer(room: Room, playerId: string) {
  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx < 0) return;
  room.players.splice(idx, 1);
  if (room.status === 'lobby') {
    if (room.players.length === 0) rooms.delete(room.id);
    else {
      if (room.hostId === playerId) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
        room.players[0].isReady = true;
      }
      emitRoomState(room);
    }
    broadcastRooms();
  }
}

/* ================= 静态托管（生产） + mDNS + 启动 ================= */

const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

try {
  const bonjour = new Bonjour();
  bonjour.publish({ name: `Poque-${PORT}`, type: 'poque', port: PORT });
  console.log(`[poque] mDNS 广播 _poque._tcp 已启动`);
} catch (e) {
  console.warn('[poque] mDNS 广播失败（不影响局域网 IP 直连）:', e);
}

server.listen(PORT, () => {
  console.log(`[poque] server listening on http://localhost:${PORT}`);
});
