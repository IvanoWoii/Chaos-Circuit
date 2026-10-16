import { createTrackLayout } from './track-layout.js';
import { createRandom } from '../utils/random.js';

export const MAPS = Object.freeze([
  { id: 'rookie', name: 'Rookie Ring', straightHalf: 14, radius: 12, width: 8, startX: 8, grass: '#becaa4' },
  { id: 'speedway', name: 'Sunset Speedway', straightHalf: 22, radius: 10, width: 9, startX: 12, grass: '#d3bd96' },
  { id: 'bowl', name: 'Mint Motor Bowl', straightHalf: 5, radius: 17, width: 9, startX: 3, grass: '#a9cbbb' },
  { id: 'sprint', name: 'Canyon Sprint', straightHalf: 10, radius: 10, width: 8, startX: 6, grass: '#c9b2a1' },
].map(Object.freeze));

/** Send this small seeded description to clients; physics still runs only on the server. */
export function chooseMap(seed, previousId = null) {
  const random = createRandom(seed);
  const choices = MAPS.filter(map => map.id !== previousId);
  const selected = choices[Math.floor(random() * choices.length)];
  return describeMap(selected.id, seed);
}
export function describeMap(id, seed) {
  const map = MAPS.find(item => item.id === id);
  if (!map) throw new Error('Unknown circuit.');
  const random = createRandom(seed ^ 0x741ba);
  const layout = createTrackLayout(map);
  const obstacles = [0.27, 0.52, 0.76].map((fraction, index) => ({
    kind: index === 0 ? 'ramp' : index === 1 ? 'ball' : random() < 0.5 ? 'ramp' : 'ball',
    distance: (fraction + (random() - 0.5) * 0.07) * layout.TRACK_LENGTH,
    speed: (0.9 + random() * 0.8) * (random() < 0.5 ? -1 : 1),
    phase: random() * Math.PI * 2,
    size: 2.4 + random() * 0.6,
    amplitude: 0.35 + random() * 0.25,
  }));
  return { ...map, seed: seed >>> 0, obstacles };
}
export const layoutForMap = map => createTrackLayout(map);
