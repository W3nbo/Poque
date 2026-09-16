import { create } from 'zustand';
import type { FinalResult, LobbyState, RoomBrief, Snapshot } from '../../shared/types';

export type View = 'home' | 'recent' | 'solo-config' | 'lan-config' | 'lobby' | 'game' | 'results';

export interface Profile { nickname: string; emoji: string }
export interface Settings { apiKey: string; model: string }
export interface RecentItem { name: string; mode: 'solo' | 'lan'; date: string; hands: number; champion: string; myNet: number }

export interface AppState {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;

  profile: Profile;
  setProfile: (p: Profile) => void;

  settings: Settings;
  setSettings: (s: Settings) => void;

  view: View;
  setView: (v: View) => void;

  connected: boolean;
  setConnected: (c: boolean) => void;
  myId: string;
  setMyId: (id: string) => void;

  rooms: RoomBrief[];
  setRooms: (r: RoomBrief[]) => void;

  lobby: LobbyState | null;
  setLobby: (l: LobbyState | null) => void;

  snapshot: Snapshot | null;
  setSnapshot: (s: Snapshot | null) => void;

  result: FinalResult | null;
  setResult: (r: FinalResult | null) => void;

  recent: RecentItem[];
  addRecent: (r: RecentItem) => void;

  toast: { msg: string; key: number } | null;
  showToast: (msg: string) => void;

  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (b: boolean) => void;
}

const load = <T>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
};

export const useStore = create<AppState>((set, get) => ({
  theme: load('poque.theme', 'light'),
  setTheme: t => { localStorage.setItem('poque.theme', JSON.stringify(t)); set({ theme: t }); },

  profile: load('poque.profile', { nickname: '', emoji: '🐶' }),
  setProfile: p => { localStorage.setItem('poque.profile', JSON.stringify(p)); set({ profile: p }); },

  settings: load('poque.settings', { apiKey: '', model: 'deepseek-chat' }),
  setSettings: s => { localStorage.setItem('poque.settings', JSON.stringify(s)); set({ settings: s }); },

  view: 'home',
  setView: v => set({ view: v }),

  connected: false,
  setConnected: c => set({ connected: c }),
  myId: '',
  setMyId: id => set({ myId: id }),

  rooms: [],
  setRooms: r => set({ rooms: r }),

  lobby: null,
  setLobby: l => set({ lobby: l }),

  snapshot: null,
  setSnapshot: s => set({ snapshot: s }),

  result: null,
  setResult: r => set({ result: r }),

  recent: load('poque.recent', [] as RecentItem[]),
  addRecent: r => {
    const list = [r, ...get().recent].slice(0, 20);
    localStorage.setItem('poque.recent', JSON.stringify(list));
    set({ recent: list });
  },

  toast: null,
  showToast: msg => set({ toast: { msg, key: Date.now() } }),

  settingsOpen: false,
  setSettingsOpen: b => set({ settingsOpen: b }),
  profileOpen: false,
  setProfileOpen: b => set({ profileOpen: b }),
}));

export const toast = (msg: string) => useStore.getState().showToast(msg);
