import { io } from 'socket.io-client';
import type { FinalResult, LobbyState, RoomBrief, Snapshot } from '../../shared/types';
import { soloHumanAct } from './solo';
import { useStore } from './store';

export const socket = io({ autoConnect: true });

socket.on('connect', () => {
  useStore.getState().setConnected(true);
  useStore.getState().setMyId(socket.id || '');
});
socket.on('disconnect', () => useStore.getState().setConnected(false));

socket.on('rooms', (rooms: RoomBrief[]) => useStore.getState().setRooms(rooms));
socket.on('room:state', (l: LobbyState) => {
  const st = useStore.getState();
  st.setLobby(l);
  if (l.status === 'lobby') st.setView('lobby');
});
socket.on('game:state', (s: Snapshot) => {
  const st = useStore.getState();
  st.setSnapshot(s);
  if (!s.over) st.setView('game');
});
socket.on('game:result', (r: FinalResult) => {
  const st = useStore.getState();
  st.setResult(r);
  st.addRecent({
    name: r.name, mode: 'lan', date: new Date().toLocaleString('zh-CN'),
    hands: r.hands, champion: `${r.ranking[0]?.emoji ?? ''} ${r.ranking[0]?.nickname ?? ''}`,
    myNet: r.ranking.find(x => x.id === st.myId)?.net ?? 0,
  });
  st.setView('results');
});
socket.on('kicked', () => {
  const st = useStore.getState();
  st.setLobby(null);
  st.setSnapshot(null);
  st.setView('home');
  st.showToast('你已被房主移出房间');
});
socket.on('error', ({ msg }: { msg: string }) => useStore.getState().showToast(msg));

/** 统一操作入口：按当前对局模式分发 */
export function performAction(type: string, amount?: number) {
  const snap = useStore.getState().snapshot;
  if (!snap) return;
  if (snap.mode === 'solo') {
    soloHumanAct(type, amount);
  } else {
    socket.emit('game:action', { type, amount });
  }
}

export { endSoloEarly } from './solo';

export function leaveLanGame() {
  socket.emit('room:leave');
  useStore.getState().setLobby(null);
  useStore.getState().setSnapshot(null);
  useStore.getState().setView('home');
}

export function endLanGameEarly() {
  socket.emit('room:end');
}
