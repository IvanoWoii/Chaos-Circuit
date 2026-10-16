import assert from 'node:assert/strict';
import { createRaceProgress } from '../js/race/progress.js';
import { createProfileStore, defaultPreferences } from '../js/data/profiles.js';
import { getTrackPoint, TRACK_LENGTH, projectTrackDistance } from '../js/world/track-layout.js';
import { createLobby } from '../js/race/lobby.js';
import { loadEngineHarness } from './engine-harness.mjs';

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const entry = (id = 'test') => ({ id, name: `Driver ${id}`, color: '#fb673e', style: 'balanced', isBot: false });
const sample = (distance, id = 'test', revision = 0, lane = 0, y = 0.62) => ({ id, ...getTrackPoint(distance, lane), y, revision });
const memoryStorage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

await test('Centerline projection wraps correctly on both straights and bends', () => {
  for (let index = 0; index < 200; index++) {
    const distance = index / 200 * TRACK_LENGTH;
    const point = getTrackPoint(distance);
    const projected = projectTrackDistance(point.x, point.z);
    assert.ok(Math.min(Math.abs(projected - distance), Math.abs(projected - distance - TRACK_LENGTH)) < 1e-8);
  }
});

await test('The starting-line crossing arms lap one; three complete circuits finish the race', () => {
  const progress = createRaceProgress([entry()]);
  let time = 0;
  progress.step([sample(-4)], time);
  for (let distance = -3.75; distance <= TRACK_LENGTH * 3 + 0.5; distance += 0.25) progress.step([sample(distance)], time += 1 / 60);
  const row = progress.getStandings()[0];
  assert.equal(row.finished, true);
  assert.equal(row.completedLaps, 3);
  assert.ok(row.finishTime > 0);
});

await test('Reverse crossings, line oscillation, shortcuts and high flyovers cannot award laps', () => {
  const progress = createRaceProgress([entry()]);
  progress.step([sample(-1)], 0);
  progress.step([sample(1)], 0.1);
  for (let index = 0; index < 10; index++) {
    progress.step([sample(-1)], index + 1);
    progress.step([sample(1)], index + 1.1);
  }
  assert.equal(progress.getStandings()[0].completedLaps, 0);
  assert.equal(progress.getStandings()[0].finished, false);
  const airborne = createRaceProgress([entry()]);
  airborne.step([sample(-1, 'test', 0, 0, 8)], 0);
  airborne.step([sample(1, 'test', 0, 0, 8)], 0.1);
  assert.ok(airborne.getStandings()[0].progress < 0);
  const offRoad = createRaceProgress([entry()]);
  offRoad.step([sample(-1, 'test', 0, 7)], 0);
  offRoad.step([sample(1, 'test', 0, 7)], 0.1);
  assert.ok(offRoad.getStandings()[0].progress < 0);
});

await test('A short recovery teleport across the finish line receives no gate credit', () => {
  const progress = createRaceProgress([entry()]);
  progress.step([sample(-0.2)], 0);
  progress.step([sample(0.2, 'test', 1)], 0.1);
  assert.ok(progress.getStandings()[0].progress < 0);
  assert.ok(progress.getRecoveryLimit('test') < 0);
});

await test('Finish times interpolate within one physics step and order simultaneous finishers', () => {
  const progress = createRaceProgress([entry('a'), entry('b')], { laps: 1 });
  let time = 0;
  for (let distance = -1; distance < TRACK_LENGTH - 1; distance += 0.5) {
    progress.step([sample(distance, 'a'), sample(distance, 'b')], time += 0.1);
  }
  progress.step([sample(TRACK_LENGTH - 0.4, 'a'), sample(TRACK_LENGTH - 0.2, 'b')], time += 0.1);
  progress.step([sample(TRACK_LENGTH + 0.4, 'a'), sample(TRACK_LENGTH + 0.6, 'b')], time += 0.1);
  const rows = progress.getStandings();
  assert.equal(rows[0].id, 'b');
  assert.ok(rows[0].finished && rows[1].finished);
  assert.ok(rows[0].finishTime < rows[1].finishTime);
});

await test('Race scores persist once, award only the actual winner, and retain preferences', () => {
  const storage = memoryStorage();
  const store = createProfileStore(storage);
  const a = store.saveProfile({ ...defaultPreferences(), name: 'Alice' });
  const b = store.saveProfile({ ...defaultPreferences(), name: 'Bob', style: 'bruiser' });
  const rows = [{ ...a, isBot: false, finished: true, finishTime: 50, position: 1 }, { ...b, isBot: false, finished: false, finishTime: null, position: 2 }];
  assert.equal(store.recordRace('race-1', rows), true);
  assert.equal(store.recordRace('race-1', rows), false);
  const reloaded = createProfileStore(storage);
  assert.equal(reloaded.recordRace('race-1', rows), false);
  assert.equal(reloaded.getProfile(a.id).wins, 1);
  assert.equal(reloaded.getProfile(a.id).races, 1);
  assert.equal(reloaded.getProfile(b.id).wins, 0);
  assert.equal(reloaded.getProfile(b.id).races, 1);
  assert.equal(reloaded.getProfile(b.id).style, 'bruiser');
  reloaded.recordRace('race-2', [{ id: 'bot', isBot: true, finished: true, finishTime: 40, position: 1 }, ...rows]);
  assert.equal(reloaded.getProfile(a.id).wins, 1);
  reloaded.recordRace('race-3', rows.map((row) => ({ ...row, finished: false, finishTime: null })));
  assert.equal(reloaded.getProfile(a.id).wins, 1);
});

const { createPhysics, createTrack, createSimulation, createRaceController, THREE } = await loadEngineHarness();
function setup({ hazards = true, ...options } = {}) {
  const physics = createPhysics();
  const track = createTrack(new THREE.Scene(), physics);
  const simulation = createSimulation(track.group, physics, { hazards });
  const profiles = createProfileStore(memoryStorage());
  const race = createRaceController(simulation, profiles, options);
  return { physics, simulation, profiles, race,
    start(entries = createLobby().getEntries(), seed = 451) { race.start(entries, seed); },
    advance(seconds) { for (let frame = 0; frame < Math.round(seconds * 60); frame++) race.update(1 / 60); },
    dispose() { race.dispose(); simulation.dispose(); physics.dispose(); },
  };
}

await test('Countdown locks car motion and race time; pause also freezes the countdown', () => {
  const app = setup(); app.start();
  const position = app.simulation.cars[0].body.position.toString();
  app.advance(1); app.race.pause(); app.advance(5);
  assert.equal(app.race.getSnapshot().countdown, 2);
  assert.equal(app.race.getSnapshot().elapsed, 0);
  assert.equal(app.simulation.cars[0].body.position.toString(), position);
  app.race.resume(); app.advance(2.5);
  assert.equal(app.race.state, 'racing');
  assert.ok(app.race.getSnapshot().elapsed > 0.45);
  const time = app.race.getSnapshot().elapsed;
  app.race.pause(); app.advance(10);
  assert.equal(app.race.getSnapshot().elapsed, time);
  assert.equal(app.race.state, 'paused');
  app.race.resume(); app.advance(1);
  assert.ok(app.race.getSnapshot().elapsed > time + 0.99);
  app.dispose();
});

await test('A race timeout produces explicit DNFs and awards no unearned win', () => {
  const app = setup({ maxSeconds: 0.2, hazards: false });
  const profile = app.profiles.saveProfile({ ...defaultPreferences(), name: 'No finisher' });
  app.start([{ ...profile, isBot: false }]); app.advance(4);
  const snapshot = app.race.getSnapshot();
  assert.equal(snapshot.state, 'results');
  assert.equal(snapshot.results[0].status, 'dnf');
  assert.equal(snapshot.results[0].finishTime, null);
  assert.equal(app.profiles.getProfile(profile.id).wins, 0);
  assert.equal(app.profiles.getProfile(profile.id).races, 1);
  app.dispose();
});

await test('A real three-lap race produces ordered results and saves a local winner', () => {
  const app = setup({ hazards: false });
  const profile = app.profiles.saveProfile({ ...defaultPreferences(), name: 'Local winner' });
  app.start([{ ...profile, isBot: false }]);
  app.advance(100);
  const snapshot = app.race.getSnapshot();
  assert.equal(snapshot.state, 'results');
  assert.equal(snapshot.results[0].finished, true);
  assert.equal(snapshot.results[0].completedLaps, 3);
  assert.equal(app.profiles.getProfile(profile.id).wins, 1);
  app.advance(10);
  assert.equal(app.profiles.getProfile(profile.id).wins, 1);
  app.dispose();
});

await test('The full eight-car chaotic race reaches results without inventing DNF finishes', () => {
  const app = setup(); app.start(); app.advance(185);
  const snapshot = app.race.getSnapshot();
  console.log('Three-lap results:', snapshot.results?.map((row) => ({ name: row.name, lap: row.completedLaps, time: row.finishTime, status: row.status })));
  assert.equal(snapshot.state, 'results');
  assert.equal(snapshot.results.length, 8);
  const finishers = snapshot.results.filter((row) => row.finished);
  assert.ok(finishers.length >= 3, 'Race did not produce a podium');
  for (let index = 1; index < finishers.length; index++) assert.ok(finishers[index].finishTime >= finishers[index - 1].finishTime);
  snapshot.results.filter((row) => !row.finished).forEach((row) => { assert.equal(row.status, 'dnf'); assert.equal(row.finishTime, null); });
  app.dispose();
});

await test('Resetting an aborted race returns to the lobby and never awards scores', () => {
  const app = setup();
  const profile = app.profiles.saveProfile({ ...defaultPreferences(), name: 'Reset me' });
  app.start([{ ...profile, isBot: false }]); app.advance(5);
  app.race.reset();
  assert.equal(app.race.state, 'lobby');
  assert.equal(app.race.getSnapshot().results, null);
  assert.equal(app.profiles.getProfile(profile.id).races, 0);
  assert.equal(app.simulation.cars.length, 0);
  app.dispose();
});

console.log(`\n${passed} Step 4 checks passed.`);
