import assert from 'node:assert/strict';
import { loadEngineHarness } from './engine-harness.mjs';
import { createProfileStore, PROFILE_STORAGE_KEY, defaultPreferences } from '../js/data/profiles.js';
import { createLobby } from '../js/race/lobby.js';
import { TRACK, TRACK_LENGTH, getTrackPoint, getGridSlot, isOnRoad, getWallSegments } from '../js/world/track-layout.js';

// No test runner subprocess, dependency install or browser is required.
let passed = 0;
async function test(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
const memoryStorage = (initial = null) => {
  const values = new Map(initial === null ? [] : [[PROFILE_STORAGE_KEY, initial]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const preferences = (name = 'Captain Curb') => ({ ...defaultPreferences(), name });

await test('Profiles, active driver and preferences survive a fresh store instance', () => {
  const storage = memoryStorage();
  const first = createProfileStore(storage);
  const profile = first.saveProfile({ name: '  Captain   Curb  ', color: '#ABCDEF', style: 'speedster' });
  const second = createProfileStore(storage);
  assert.equal(second.getData().activeProfileId, profile.id);
  assert.deepEqual(second.getProfile(profile.id), { id: profile.id, name: 'Captain Curb', color: '#abcdef', style: 'speedster', wins: 0, races: 0 });
  second.saveProfile({ name: 'Captain Curb', color: '#f5ca53', style: 'bruiser' }, profile.id);
  assert.equal(second.getData().profiles.length, 1);
});

await test('Validation rejects blank / duplicate names and invalid preferences', () => {
  const store = createProfileStore(memoryStorage());
  store.saveProfile(preferences());
  for (const invalid of [preferences('   '), preferences('captain curb'), { ...preferences('New'), color: 'red' }, { ...preferences('New'), style: '__proto__' }]) {
    assert.throws(() => store.saveProfile(invalid));
  }
  assert.equal(store.getData().profiles.length, 1);
});

await test('Corrupt storage recovers and broken individual records are skipped', () => {
  const broken = createProfileStore(memoryStorage('{bad json'));
  assert.equal(broken.status, 'recovered');
  broken.saveProfile(preferences());
  assert.equal(broken.status, 'saved');
  const valid = { id: 'keep', ...preferences(), wins: 7, races: 12 };
  const store = createProfileStore(memoryStorage(JSON.stringify({ version: 1, activeProfileId: 'missing', profiles: [null, {}, valid, { ...valid, id: 'duplicate-name' }] })));
  assert.equal(store.getData().profiles.length, 1);
  assert.equal(store.getProfile('keep').wins, 7);
  assert.equal(store.getData().activeProfileId, null);
});

await test('Denied reads and quota failures keep usable profiles in memory', () => {
  const denied = createProfileStore({ getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } });
  assert.equal(denied.status, 'unavailable');
  const profile = denied.saveProfile(preferences());
  assert.equal(denied.getProfile(profile.id).name, 'Captain Curb');
  const quota = createProfileStore({ getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } });
  quota.saveProfile(preferences());
  assert.equal(quota.status, 'unavailable');
  assert.equal(quota.getData().profiles.length, 1);
});

await test('Profile snapshots cannot mutate saved stats or preferences', () => {
  const store = createProfileStore(memoryStorage());
  const profile = store.saveProfile(preferences());
  profile.wins = 999;
  store.getData().profiles[0].color = '#000000';
  assert.equal(store.getProfile(profile.id).wins, 0);
  assert.equal(store.getProfile(profile.id).color, '#fb673e');
});

await test('Eight-slot lobby fills with bots, updates in place, rejects overflow', () => {
  const lobby = createLobby();
  assert.equal(lobby.getEntries().filter((entry) => entry.isBot).length, 8);
  for (let index = 0; index < 8; index++) lobby.join({ id: `player-${index}`, ...preferences(`Player ${index}`) });
  lobby.join({ id: 'player-0', ...preferences('Edited driver'), style: 'bruiser' });
  assert.equal(lobby.getEntries()[0].name, 'Edited driver');
  assert.equal(lobby.playerCount, 8);
  assert.throws(() => lobby.join({ id: 'overflow', ...preferences('Overflow') }));
  lobby.remove('player-2');
  assert.equal(lobby.getEntries().length, 8);
  assert.equal(lobby.getEntries().filter((entry) => entry.isBot).length, 1);
  lobby.clear();
  assert.equal(lobby.playerCount, 0);
  assert.equal(lobby.getEntries().length, 8);
});

await test('Circuit wraps continuously; all grid footprints fit inside its road', () => {
  const start = getTrackPoint(0);
  assert.ok(Math.abs(start.x - TRACK.startX) < 1e-9);
  assert.ok(Math.abs(getTrackPoint(TRACK_LENGTH).z - start.z) < 1e-9);
  for (let index = 0; index < 1000; index++) {
    const point = getTrackPoint(index / 1000 * TRACK_LENGTH);
    const next = getTrackPoint(index / 1000 * TRACK_LENGTH + 0.001);
    assert.ok(isOnRoad(point.x, point.z, 3.9));
    assert.ok(Math.hypot(next.x - point.x, next.z - point.z) < 0.00101);
  }
  for (let index = 0; index < 8; index++) {
    const slot = getGridSlot(index);
    for (const x of [-1.75, 1.75]) for (const z of [-1.15, 1.15]) assert.ok(isOnRoad(slot.x + x, slot.z + z, 0.1));
    assert.ok(Math.abs(slot.heading - Math.PI / 2) < 1e-9);
  }
});

const { createPhysics, createTrack, createStartingGrid, CANNON, THREE } = await loadEngineHarness();

await test('Track meshes and static colliders build with the real engines', () => {
  const physics = createPhysics();
  const scene = new THREE.Scene();
  const track = createTrack(scene, physics);
  assert.equal(track.staticBodyCount, getWallSegments().length + 1);
  assert.equal(physics.world.bodies.length, 133);
  assert.ok(physics.world.bodies.every((body) => body.mass === 0));
  assert.equal(track.waypoints.length, 40);
  const road = track.group.children.find((node) => node.geometry?.type === 'ShapeGeometry');
  const positions = road.geometry.attributes.position;
  const triangles = road.geometry.index.array;
  for (let index = 0; index < triangles.length; index += 3) {
    const a = triangles[index], b = triangles[index + 1], c = triangles[index + 2];
    const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
    const z = -(positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
    assert.ok(isOnRoad(x, z, -0.03), 'Asphalt triangulation crossed the infield');
  }
  const grid = createStartingGrid(track.group);
  grid.update(createLobby().getEntries());
  assert.equal(track.group.getObjectByName('starting-grid').children.length, 8);
  grid.update(createLobby().getEntries());
  assert.equal(track.group.getObjectByName('starting-grid').children.length, 8);
  grid.dispose();
  track.dispose();
  assert.equal(physics.world.bodies.length, 0);
});

await test('A real rigid body lands on the track surface without falling through', () => {
  const physics = createPhysics();
  createTrack(new THREE.Scene(), physics);
  const body = new CANNON.Body({ mass: 1, material: physics.materials.car, shape: new CANNON.Sphere(0.5), position: new CANNON.Vec3(0, 4, 12) });
  physics.world.addBody(body);
  for (let frame = 0; frame < 240; frame++) physics.step(1 / 60);
  assert.ok(Math.abs(body.position.y - 0.5) < 0.03, `Final height: ${body.position.y}`);
  physics.dispose();
});

await test('Inner and outer walls bounce bodies on both straights and bends', () => {
  for (const [x, z, vx, vz, axis, sign] of [
    [0, 12, 0, 10, 'z', -1], [0, 12, 0, -10, 'z', 1],
    [26, 0, 10, 0, 'x', -1], [26, 0, -10, 0, 'x', 1],
    [-26, 0, -10, 0, 'x', 1], [-26, 0, 10, 0, 'x', -1],
  ]) {
    const physics = createPhysics();
    createTrack(new THREE.Scene(), physics);
    const body = new CANNON.Body({ mass: 1, material: physics.materials.car, shape: new CANNON.Sphere(0.45), position: new CANNON.Vec3(x, 0.48, z), linearDamping: 0 });
    body.velocity.set(vx, 0, vz);
    physics.world.addBody(body);
    let bounced = false;
    for (let frame = 0; frame < 120; frame++) {
      physics.step(1 / 120);
      if (body.velocity[axis] * sign > 0.1) bounced = true;
      assert.ok(isOnRoad(body.position.x, body.position.z, -0.15), `Body escaped its barriers for ${[x, z, vx, vz]} at frame ${frame}: position=${body.position.toString()}, velocity=${body.velocity.toString()}`);
    }
    assert.ok(bounced, `No bounce for ${[x, z, vx, vz]}: position=${body.position.toString()}, velocity=${body.velocity.toString()}`);
    physics.dispose();
  }
});

await test('Fixed-step results agree across render rates and long gaps stay bounded', () => {
  function simulate(frameRate) {
    const physics = createPhysics();
    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(0.5), position: new CANNON.Vec3(0, 20, 0) });
    physics.world.addBody(body);
    for (let frame = 0; frame < frameRate; frame++) physics.step(1 / frameRate);
    return { y: body.position.y, steps: physics.world.stepnumber };
  }
  const slow = simulate(30);
  const fast = simulate(144);
  assert.equal(slow.steps, 60);
  assert.equal(fast.steps, 60);
  assert.ok(Math.abs(slow.y - fast.y) < 1e-9);
  const physics = createPhysics();
  physics.step(10);
  assert.equal(physics.world.stepnumber, 6);
  physics.resetAccumulator();
  physics.step(0);
  assert.equal(physics.world.stepnumber, 6);
});

console.log(`\n${passed} Step 2 checks passed.`);
