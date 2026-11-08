import { createRoot } from 'react-dom/client';
import { cineScrambleFixture, whatHappensFixture } from '../src/__tests__/player-fixtures.js';
import { InteractiveActivityPlayer } from '../src/player/InteractiveActivityPlayer.js';

const activity =
  new URLSearchParams(location.search).get('template') === 'cine-scramble'
    ? cineScrambleFixture()
    : whatHappensFixture();
createRoot(document.getElementById('root') as HTMLElement).render(
  <InteractiveActivityPlayer activity={activity} />,
);
