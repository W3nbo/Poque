import { useState } from 'react';
import { toast, useStore } from '../store';

export const EMOJI_POOL = ['🐶', '🐱', '🦊', '🐼', '🐯', '🐸', '🐵', '🐔', '🐧', '🦄',
  '🐝', '🐢', '🦖', '🐳', '🐬', '🦈', '🐙', '🦀', '🌵', '🌹',
  '🌻', '🍀', '⭐️', '🎈', '🎲', '🎮', '🎯', '🎨', '🎭', '🎪'];

export default function ProfileModal() {
  const open = useStore(s => s.profileOpen);
  const setOpen = useStore(s => s.setProfileOpen);
  const profile = useStore(s => s.profile);
  const setProfile = useStore(s => s.setProfile);

  const [nickname, setNickname] = useState(profile.nickname);
  const [emoji, setEmoji] = useState(profile.emoji);

  if (!open) return null;

  const save = () => {
    const name = nickname.trim();
    if (name.length < 2 || name.length > 12) return toast('昵称需 2–12 个字符');
    setProfile({ nickname: name, emoji });
    toast('昵称已保存，下次进房自动预填');
    setOpen(false);
  };

  return (
    <div className="modal-mask" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="modal">
        <h2>👋 你的身份</h2>
        <div className="field">
          <label>昵称<span className="hint" style={{ display: 'block' }}>2–12 字符，支持中文/英文/emoji</span></label>
          <input value={nickname} maxLength={12} onChange={e => setNickname(e.target.value)} />
        </div>
        <div className="field" style={{ display: 'block' }}>
          <label>头像</label>
          <div className="emoji-grid">
            {EMOJI_POOL.map(e => (
              <button key={e} className={e === emoji ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>
            ))}
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
