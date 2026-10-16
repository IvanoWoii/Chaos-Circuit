import { GAME_CONFIG, PAINTS } from '../config.js';
import { validatePreferences } from '../data/profiles.js';

const BOT_NAMES = ['Clutch Issues', 'Sir Spins-a-Lot', 'Cone Collector', 'Wrong Turn', 'Bumper Buddy', 'Oops Again', 'Captain Curb', 'Slow Motion'];
const BOT_STYLES = ['balanced', 'speedster', 'bruiser'];

/** Saved profiles are durable; the current grid is deliberately session-only. */
export function createLobby() {
  let players = [];
  const listeners = new Set();

  function getEntries() {
    const entries = players.map((player) => ({ ...player, isBot: false }));
    for (let index = 0; entries.length < GAME_CONFIG.maxRacers; index++) {
      // A human may pick an AI name; keep the visible roster unambiguous.
      const base = BOT_NAMES[index];
      const name = players.some((player) => player.name.toLowerCase() === base.toLowerCase()) ? `${base} (AI)` : base;
      entries.push({ id: `bot-${index + 1}`, name, color: PAINTS[index % PAINTS.length].color, style: BOT_STYLES[index % 3], isBot: true, wins: 0, races: 0 });
    }
    return entries;
  }
  const notify = () => listeners.forEach((listener) => listener(getEntries()));
  function assertCanJoin(id) {
    if (players.length >= GAME_CONFIG.maxRacers && !players.some((player) => player.id === id)) {
      throw new Error('The grid is full. Remove a driver before adding another.');
    }
  }

  return {
    getEntries,
    get playerCount() { return players.length; },
    has(id) { return players.some((player) => player.id === id); },
    assertCanJoin,
    join(profile) {
      if (typeof profile?.id !== 'string' || !profile.id) throw new Error('Save a driver before joining.');
      const valid = validatePreferences(profile);
      assertCanJoin(profile.id);
      if (players.some((player) => player.id !== profile.id && player.name.toLowerCase() === valid.name.toLowerCase())) throw new Error('That driver name is already on the grid.');
      const existing = players.findIndex((player) => player.id === profile.id);
      const entry = { ...profile, ...valid };
      if (existing < 0) players.push(entry);
      else players[existing] = entry;
      notify();
    },
    remove(id) { players = players.filter((player) => player.id !== id); notify(); },
    clear() { players = []; notify(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
