import { currentHand, useStore } from '../game/store';
import { HoleScreen } from './HoleScreen';
import { Play } from './Play';
import { Setup } from './Setup';
import { Showdown } from './Showdown';

export function App() {
  const s = useStore();
  const h = currentHand(s);
  if (s.screen === 'setup' || !h) return <Setup />;
  if (h.phase === 'hole') return <HoleScreen key={`h${h.no}`} />;
  if (h.phase === 'showdown' || h.phase === 'done') return <Showdown key={`s${h.no}-${s.events.length}`} />;
  return <Play key={`p${h.no}`} />;
}
