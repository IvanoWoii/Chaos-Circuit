import { GAME_CONFIG } from '../config.js';
import { createRaceProgress } from './progress.js';

const sampleCar = (car) => ({ id: car.entry.id, x: car.body.position.x, y: car.body.position.y, z: car.body.position.z, revision: car.poseRevision });

/** Owns the full race lifecycle. Only a completed race may update durable scores. */
export function createRaceController(simulation, profiles, options = {}) {
  const settings = { ...GAME_CONFIG.race, laps: GAME_CONFIG.laps, ...options };
  let state = 'lobby', pausedFrom = null, countdown = settings.countdownSeconds;
  let tracker = null, results = null, raceId = null;
  let deadline = settings.maxSeconds;
  let raceMessage = '', messageUntil = 0;
  const listeners = new Set();

  function getSnapshot() {
    const stats = simulation.getSnapshot();
    const standings = tracker?.getStandings() || [];
    return { ...stats, state, pausedFrom, countdown: Math.max(0, Math.ceil(countdown - 1e-8)),
      laps: settings.laps, standings, results: results?.map((row) => ({ ...row })) || null,
      raceId, finishedCount: standings.filter((row) => row.finished).length,
      remainingSeconds: Math.max(0, deadline - stats.elapsed),
      latestEvent: stats.elapsed < messageUntil ? raceMessage : stats.latestEvent };
  }
  function notify() { const snapshot = getSnapshot(); listeners.forEach((listener) => listener(snapshot)); }
  function finish() {
    if (state !== 'racing') return;
    results = tracker.finalize();
    simulation.pause();
    state = 'results';
    profiles.recordRace(raceId, results);
    notify();
  }
  const unsubscribeSteps = simulation.subscribeSteps((time, dt, cars) => {
    if (state !== 'racing') return;
    const newFinishers = tracker.step(cars.map(sampleCar), time);
    cars.forEach((car) => {
      car.raceRecoveryLimit = tracker.getRecoveryLimit(car.entry.id);
      if (tracker.needsRecovery(car.entry.id)) car.requestRecovery = true;
    });
    if (newFinishers.length) {
      const standings = tracker.getStandings();
      const winner = standings.find((row) => row.finished);
      deadline = Math.min(deadline, winner.finishTime + settings.finishGraceSeconds);
      const latest = standings.filter((row) => newFinishers.includes(row.id)).at(-1);
      raceMessage = `${latest.name} finishes in position ${latest.position}!`;
      messageUntil = time + 4;
    }
    if (tracker.getStandings().every((row) => row.finished) || time + 1e-8 >= deadline) finish();
  });

  return {
    get state() { return state; },
    getSnapshot,
    getFocusCar() {
      const standings = tracker?.getStandings() || [];
      const target = standings.find((row) => !row.finished) || standings[0];
      return simulation.cars.find((car) => car.entry.id === target?.id) || null;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start(entries, seed) {
      if (state !== 'lobby' || !entries.length) return;
      raceId = globalThis.crypto?.randomUUID?.() || `race-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      tracker = createRaceProgress(entries, settings);
      results = null; deadline = settings.maxSeconds;
      countdown = settings.countdownSeconds;
      simulation.start(entries, seed);
      tracker.step(simulation.cars.map(sampleCar), 0);
      simulation.cars.forEach((car) => { car.raceRecoveryLimit = tracker.getRecoveryLimit(car.entry.id); });
      state = 'countdown'; raceMessage = 'On your marks. Hands off the wheel.'; messageUntil = 4;
      notify();
    },
    pause() {
      if (state !== 'countdown' && state !== 'racing') return;
      pausedFrom = state; state = 'paused'; simulation.pause(); notify();
    },
    resume() {
      if (state !== 'paused') return;
      state = pausedFrom; pausedFrom = null; simulation.resume(); notify();
    },
    reset() {
      simulation.reset();
      state = 'lobby'; pausedFrom = null; tracker = null; results = null; raceId = null;
      countdown = settings.countdownSeconds; raceMessage = ''; messageUntil = 0;
      notify();
    },
    update(delta) {
      if (!Number.isFinite(delta) || delta < 0) return;
      let elapsed = Math.min(delta, GAME_CONFIG.physics.maxFrameDelta);
      if (state === 'countdown') {
        const consumed = Math.min(elapsed, countdown);
        countdown -= consumed; elapsed -= consumed;
        if (countdown > 1e-8) return;
        countdown = 0; state = 'racing';
        raceMessage = 'GO! Three laps. Zero sensible decisions.'; messageUntil = 3;
        notify();
      }
      if (state === 'racing') simulation.update(elapsed);
    },
    dispose() { unsubscribeSteps(); listeners.clear(); },
  };
}
