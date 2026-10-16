import { GAME_CONFIG, RACING_STYLES } from '../config.js';

export const PROFILE_STORAGE_KEY = 'chaos-circuit.profiles.v1';
export const cleanName = (name) => typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
const validColor = (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
const emptyData = () => ({ version: 1, activeProfileId: null, profiles: [], recentRaceIds: [] });
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function validatePreferences({ name, color, style } = {}) {
  if (!cleanName(name)) throw new Error('Give your driver a name first.');
  if (!validColor(color)) throw new Error('Choose a valid car color.');
  if (!Object.hasOwn(RACING_STYLES, style)) throw new Error('Choose a racing style.');
  return { name: cleanName(name), color: color.toLowerCase(), style };
}

/** Storage access is injectable, so corruption and blocked storage can be tested. */
export function createProfileStore(providedStorage) {
  let storage;
  let status = 'saved';
  let data = emptyData();
  const listeners = new Set();
  let readCompleted = false;
  try {
    storage = providedStorage === undefined ? globalThis.localStorage : providedStorage;
    if (!storage) throw new Error('Storage unavailable');
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    readCompleted = true;
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !Array.isArray(parsed.profiles)) throw new Error('Invalid profile data');
      const ids = new Set();
      const names = new Set();
      for (const profile of parsed.profiles.slice(0, 64)) {
        if (!profile || typeof profile.id !== 'string' || !profile.id || profile.id.length > 80 || ids.has(profile.id)) continue;
        try {
          const preferences = validatePreferences(profile);
          const nameKey = preferences.name.toLowerCase();
          if (names.has(nameKey)) continue;
          ids.add(profile.id);
          names.add(nameKey);
          data.profiles.push({ id: profile.id, ...preferences, wins: count(profile.wins), races: count(profile.races) });
        } catch { /* Skip one broken record without losing other saved drivers. */ }
      }
      if (ids.has(parsed.activeProfileId)) data.activeProfileId = parsed.activeProfileId;
      if (Array.isArray(parsed.recentRaceIds)) data.recentRaceIds = [...new Set(parsed.recentRaceIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 100))].slice(-64);
    }
  } catch {
    status = readCompleted ? 'recovered' : 'unavailable';
  }

  function snapshot() {
    return { ...data, profiles: data.profiles.map((profile) => ({ ...profile })), recentRaceIds: [...data.recentRaceIds] };
  }
  function persist() {
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data));
      status = 'saved';
    } catch {
      status = 'unavailable';
    }
    listeners.forEach((listener) => listener(status));
  }

  return {
    get status() { return status; },
    getData: snapshot,
    getProfile(id) { const profile = data.profiles.find((entry) => entry.id === id); return profile ? { ...profile } : null; },
    saveProfile(preferences, id = null) {
      const valid = validatePreferences(preferences);
      const existing = data.profiles.find((profile) => profile.id === id);
      if (data.profiles.some((profile) => profile.id !== existing?.id && profile.name.toLowerCase() === valid.name.toLowerCase())) {
        throw new Error('That name is already saved. Select that driver or choose another name.');
      }
      if (!existing && data.profiles.length >= 64) throw new Error('You have reached the limit of 64 saved drivers. Select an existing driver.');
      // UUIDs are preferred; the fallback also supports plain-HTTP LAN previews.
      const profile = existing || { id: globalThis.crypto?.randomUUID?.() || `driver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, wins: 0, races: 0 };
      Object.assign(profile, valid);
      if (!existing) data.profiles.push(profile);
      data.activeProfileId = profile.id;
      persist();
      return { ...profile };
    },
    setActive(id) {
      data.activeProfileId = data.profiles.some((profile) => profile.id === id) ? id : null;
      persist();
    },
    recordRace(raceId, results) {
      if (typeof raceId !== 'string' || !raceId || raceId.length > 100 || !Array.isArray(results) || !results.length) throw new Error('Invalid race results.');
      if (data.recentRaceIds.includes(raceId)) return false;
      if (new Set(results.map((row) => row.id)).size !== results.length) throw new Error('Duplicate racers in results.');
      const finishers = results.filter((row) => row.finished && Number.isFinite(row.finishTime) && row.finishTime >= 0)
        .sort((a, b) => a.finishTime - b.finishTime || a.position - b.position);
      const winner = finishers[0];
      data.profiles.forEach((profile) => {
        if (!results.some((row) => row.id === profile.id && row.isBot === false)) return;
        profile.races = Math.min(Number.MAX_SAFE_INTEGER, profile.races + 1);
        if (winner?.id === profile.id && winner.isBot === false) profile.wins = Math.min(Number.MAX_SAFE_INTEGER, profile.wins + 1);
      });
      // One atomic storage write includes both scores and the de-duplication key.
      data.recentRaceIds = [...data.recentRaceIds, raceId].slice(-64);
      persist();
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const defaultPreferences = () => ({ name: '', color: GAME_CONFIG.defaultPaint, style: 'balanced' });
