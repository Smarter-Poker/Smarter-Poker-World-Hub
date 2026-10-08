import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Achievements from '../../../pages/hub/trivia/achievements.js';
import Settings from '../../../pages/hub/trivia/settings.js';
import Endless from '../../../pages/hub/trivia/endless.js';
import Strategy from '../../../src/components/trivia/StrategyTrivia.jsx';
import '../../../src/styles/worlds/trivia-console-strategy.css';
import Art from '../../../src/components/trivia/console/ResponsiveModeArt.jsx';
import Updater from '../../../src/components/ui/ServiceWorkerUpdater.jsx';
import {
  acquireActiveTriviaRun,
  hasActiveTriviaRun,
} from '../../../src/lib/trivia/activeRunSignal.mjs';
import { identity } from './fixture.jsx';
window.fixtureAccount = {
  id: 'account-a',
  loading: new URLSearchParams(location.search).get('authLoading') === 'true',
};
function App() {
  const [account, setAccount] = useState(window.fixtureAccount);
  const [art, setArt] = useState('broken');
  window.switchAccount = (id) => {
    window.fixtureAccount = { id };
    setAccount(window.fixtureAccount);
  };
  window.switchLoading = (loading) => {
    window.fixtureAccount = { ...window.fixtureAccount, loading };
    setAccount(window.fixtureAccount);
  };
  window.switchArt = setArt;
  const mode = new URLSearchParams(location.search).get('mode');
  if (mode === 'art') {
    const src = '/' + art + '.svg';
    const asset = {
      key: art,
      preview: '/valid.svg',
      mobile: { src, webp: src, width: 640, height: 400 },
      wide: { webp: src, width: 640, height: 400 },
    };
    return <Art art={asset} priority />;
  }
  if (mode === 'sw') {
    window.acquireLease = acquireActiveTriviaRun;
    window.activeLease = hasActiveTriviaRun;
    return <Updater />;
  }
  return (
    <identity.Provider value={account}>
      {mode?.startsWith('strategy-') ? (
        <Strategy mode={mode.slice('strategy-'.length)} />
      ) : mode === 'achievements' ? (
        <Achievements />
      ) : mode === 'settings' ? (
        <Settings />
      ) : (
        <Endless />
      )}
    </identity.Provider>
  );
}
createRoot(document.getElementById('root')).render(<App />);
