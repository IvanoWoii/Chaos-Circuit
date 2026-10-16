import { GAME_CONFIG } from '../config.js';
import { defaultLayout } from '../world/track-layout.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Race authority: ordered physical gate crossings, independent of steering waypoints. */
export function createRaceProgress(entries, { laps = GAME_CONFIG.laps, checkpoints = GAME_CONFIG.race.checkpoints, layout = defaultLayout } = {}) {
  const { TRACK, TRACK_LENGTH, getTrackPoint, isOnRoad, projectTrackDistance } = layout;
  const signedDistance = (value) => ((value + TRACK_LENGTH * 1.5) % TRACK_LENGTH) - TRACK_LENGTH / 2;
  const spacing = TRACK_LENGTH / checkpoints;
  const records = new Map(entries.map((entry, index) => [entry.id, {
    entry: { ...entry }, gridIndex: index, nextGate: 0, started: false,
    completedLaps: 0, finishTime: null, dnf: false, previous: null,
    progress: -4 - Math.floor(index / 2) * 4.3, missedTime: 0,
  }]));

  function step(samples, time) {
    const finishers = [];
    for (const sample of samples) {
      const record = records.get(sample.id);
      if (!record || record.finishTime !== null || record.dnf) continue;
      const previous = record.previous;
      record.previous = { ...sample, time };
      if (![sample.x, sample.y, sample.z].every(Number.isFinite)) continue;
      const nextDistance = record.nextGate * spacing;
      const gate = getTrackPoint(nextDistance);
      const tx = Math.sin(gate.heading), tz = Math.cos(gate.heading);
      const dt = previous ? Math.max(0, time - previous.time) : 0;
      // Explicit pose revisions reject recovery teleports, even very short ones.
      const continuous = previous && previous.revision === sample.revision
        && Math.hypot(sample.x - previous.x, sample.y - previous.y, sample.z - previous.z) < 3;
      if (continuous) {
        const from = (previous.x - gate.x) * tx + (previous.z - gate.z) * tz;
        const to = (sample.x - gate.x) * tx + (sample.z - gate.z) * tz;
        if (from < 0 && to >= 0) {
          const fraction = from / (from - to);
          const x = previous.x + (sample.x - previous.x) * fraction;
          const y = previous.y + (sample.y - previous.y) * fraction;
          const z = previous.z + (sample.z - previous.z) * fraction;
          const lateral = Math.abs((x - gate.x) * tz - (z - gate.z) * tx);
          if (lateral <= TRACK.width / 2 + 0.1 && y >= 0.05 && y <= 2.5 && isOnRoad(x, z, -0.1)) {
            record.started = true;
            record.completedLaps = Math.floor(record.nextGate / checkpoints);
            record.nextGate++;
            record.missedTime = 0;
            if (record.completedLaps >= laps) {
              record.completedLaps = laps;
              record.finishTime = previous.time + dt * fraction;
              record.progress = laps * TRACK_LENGTH;
              finishers.push(record.entry.id);
            }
          }
        }
      }
      if (record.finishTime !== null) continue;
      const projected = projectTrackDistance(sample.x, sample.z);
      const validated = record.started ? (record.nextGate - 1) * spacing : 0;
      // Physical interpolation is bounded by the NEXT required gate. A shortcut
      // can never improve standings by skipping a checkpoint or an entire lap.
      record.progress = validated + clamp(signedDistance(projected - validated % TRACK_LENGTH), -spacing * 4, record.started ? spacing - 0.001 : -0.001);
      const aheadOfGate = signedDistance(projected - (record.nextGate * spacing) % TRACK_LENGTH);
      record.missedTime = aheadOfGate > 1.2 && aheadOfGate < TRACK_LENGTH / 2 && isOnRoad(sample.x, sample.z, -0.4)
        ? record.missedTime + dt : 0;
    }
    return finishers;
  }

  function getStandings() {
    const rows = [...records.values()].map((record) => ({
      ...record.entry, gridIndex: record.gridIndex, completedLaps: record.completedLaps,
      lap: Math.min(laps, record.completedLaps + 1), progress: record.progress,
      finished: record.finishTime !== null, finishTime: record.finishTime,
      status: record.finishTime !== null ? 'finished' : record.dnf ? 'dnf' : 'racing',
    }));
    rows.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime || a.gridIndex - b.gridIndex;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress || a.gridIndex - b.gridIndex;
    });
    return rows.map((row, index) => ({ ...row, position: index + 1 }));
  }

  return {
    step, getStandings,
    getRecoveryLimit(id) { const record = records.get(id); return !record || record.finishTime !== null ? Infinity : record.nextGate * spacing - 1.25; },
    needsRecovery(id) { return (records.get(id)?.missedTime || 0) > 0.8; },
    finalize() { records.forEach((record) => { if (record.finishTime === null) record.dnf = true; }); return getStandings(); },
  };
}
