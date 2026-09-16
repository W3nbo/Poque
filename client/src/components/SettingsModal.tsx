import { useState } from 'react';
import { useStore } from '../store';

export default function SettingsModal() {
  const open = useStore(s => s.settingsOpen);
  const setOpen = useStore(s => s.setSettingsOpen);
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const showToast = useStore(s => s.showToast);

  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!open) return null;

  const save = () => {
    setSettings({ apiKey: apiKey.trim(), model });
    showToast('设置已保存（仅本机 localStorage）');
    setOpen(false);
  };

  const test = async () => {
    if (!apiKey.trim()) return setTestResult('请先填写 API Key');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), model }),
      });
      const data = await res.json();
      setTestResult(data.ok ? `连接成功 · ${data.latency}ms` : `失败：${data.error}`);
    } catch (e: any) {
      setTestResult(`失败：${e?.message || e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-mask" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="modal">
        <h2>⚙️ Settings</h2>
        <div className="form-card" style={{ boxShadow: 'none', border: 'none', padding: 0 }}>
          <h3>DeepSeek API</h3>
          <div className="field">
            <label>API Key</label>
            <input type="password" placeholder="sk-..." value={apiKey} onChange={e => setApiKey(e.target.value)} />
          </div>
          <div className="field">
            <label>模型</label>
            <select value={model} onChange={e => setModel(e.target.value)}>
              <option value="deepseek-chat">deepseek-chat</option>
              <option value="deepseek-reasoner">deepseek-reasoner</option>
            </select>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }} disabled={testing} onClick={test}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          {testResult && (
            <div style={{ fontSize: 12, marginTop: 8, color: testResult.startsWith('连接成功') ? '#4ECCA3' : '#ef4444' }}>
              {testResult}
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={save}>完成</button>
        </div>
      </div>
    </div>
  );
}
