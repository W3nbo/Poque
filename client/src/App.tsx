import { useEffect } from 'react';
import { useStore } from './store';
import Home from './components/Home';
import Recent from './components/Recent';
import SoloConfigPage from './components/SoloConfigPage';
import LanConfigPage from './components/LanConfigPage';
import Lobby from './components/Lobby';
import Game from './components/Game';
import Results from './components/Results';
import SettingsModal from './components/SettingsModal';
import ProfileModal from './components/ProfileModal';
import Toast from './components/Toast';

export default function App() {
  const view = useStore(s => s.view);
  const theme = useStore(s => s.theme);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  return (
    <>
      {view === 'home' && <Home />}
      {view === 'recent' && <Recent />}
      {view === 'solo-config' && <SoloConfigPage />}
      {view === 'lan-config' && <LanConfigPage />}
      {view === 'lobby' && <Lobby />}
      {view === 'game' && <Game />}
      {view === 'results' && <Results />}
      <SettingsModal />
      <ProfileModal />
      <Toast />
    </>
  );
}
