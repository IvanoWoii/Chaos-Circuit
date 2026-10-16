import assert from 'node:assert/strict';
import { loadEngineHarness } from './engine-harness.mjs';
import { createLobby } from '../js/race/lobby.js';
import { TRACK_LENGTH, getTrackPoint } from '../js/world/track-layout.js';

const { createPhysics, createTrack, createSimulation, THREE, CANNON } = await loadEngineHarness();
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function setup(hazards = true, entries = createLobby().getEntries()) {
  const physics = createPhysics();
  const scene = new THREE.Scene();
  const track = createTrack(scene, physics);
  const simulation = createSimulation(track.group, physics, { hazards });
  return { physics, scene, track, simulation,
    start(seed = 12345) { simulation.start(entries, seed); },
    advance(seconds, rate = 60) { for (let frame = 0; frame < Math.round(seconds * rate); frame++) simulation.update(1 / rate); },
    dispose() { simulation.dispose(); physics.dispose(); },
  };
}

await test('Cars have real, style-dependent masses and unlocked compound rigid bodies', () => {
  const app = setup(false);
  app.start();
  assert.equal(app.simulation.cars.length, 8);
  assert.deepEqual(app.simulation.cars.slice(0, 3).map((car) => car.body.mass), [150, 90, 240]);
  for (const car of app.simulation.cars) {
    assert.equal(car.body.shapes.length, 6);
    assert.equal(car.body.type, CANNON.Body.DYNAMIC);
    assert.equal(car.body.fixedRotation, false);
  }
  app.dispose();
});

await test('Waypoint AI drives all eight cars around the circuit using physical forces', () => {
  const app = setup(false);
  app.start();
  app.advance(35);
  const distances = app.simulation.cars.map((car) => Math.round(car.ai.furthestDistance));
  console.log('Baseline distances / recoveries:', distances, app.simulation.getSnapshot().recoveries);
  assert.ok(distances.every((distance) => distance > TRACK_LENGTH), `Some cars failed to complete a circuit: ${distances}`);
  assert.ok(app.simulation.getSnapshot().bumps > 0, 'Cars never made physical contact');
  app.dispose();
});

await test('Pause freezes bodies, obstacles, counters and simulation time; resume continues', () => {
  const app = setup();
  app.start(); app.advance(2);
  app.simulation.pause();
  const before = app.simulation.cars.map((car) => car.body.position.toString());
  const spinner = app.simulation.obstacles.spinner.quaternion.toString();
  const stats = app.simulation.getSnapshot();
  app.advance(3);
  assert.deepEqual(app.simulation.cars.map((car) => car.body.position.toString()), before);
  assert.equal(app.simulation.obstacles.spinner.quaternion.toString(), spinner);
  assert.deepEqual(app.simulation.getSnapshot(), stats);
  app.simulation.resume(); app.advance(1);
  assert.ok(app.simulation.getSnapshot().elapsed > stats.elapsed + 0.99);
  app.dispose();
});

await test('Motor spinner and constrained ball move physically and keep their pivots', () => {
  const app = setup();
  app.start();
  let minX = Infinity, maxX = -Infinity, maxAngularSpeed = 0;
  for (let frame = 0; frame < 600; frame++) {
    app.advance(1 / 60);
    const ball = app.simulation.obstacles.ball;
    minX = Math.min(minX, ball.position.x); maxX = Math.max(maxX, ball.position.x);
    maxAngularSpeed = Math.max(maxAngularSpeed, Math.abs(ball.angularVelocity.z));
  }
  const { spinner, ball } = app.simulation.obstacles;
  assert.ok(Math.abs(spinner.angularVelocity.y) > 0.3);
  assert.ok(Math.abs(spinner.position.x + 1) < 0.1 && Math.abs(spinner.position.z + 12) < 0.1);
  const pivot = new CANNON.Vec3();
  ball.pointToWorldFrame(new CANNON.Vec3(0, 5.05, 0), pivot);
  assert.ok(pivot.distanceTo(new CANNON.Vec3(-26, 6.7, 0)) < 0.15, `Ball lost hinge: ${pivot.toString()}`);
  assert.ok(minX < -27 && maxX > -25 && maxAngularSpeed > 0.2, `Ball did not sweep across the road: ${minX}, ${maxX}, ${maxAngularSpeed}`);
  app.dispose();
});

await test('A prolonged chaotic run remains finite and keeps cars making progress', () => {
  const app = setup();
  app.start(9876);
  let hazardContacts = 0, lowestUp = 1;
  for (let frame = 0; frame < 65 * 60; frame++) {
    app.advance(1 / 60);
    for (const contact of app.physics.world.contacts) {
      if ((contact.bi.gameKind === 'car' && contact.bj.gameKind === 'obstacle') || (contact.bi.gameKind === 'obstacle' && contact.bj.gameKind === 'car')) hazardContacts++;
    }
    for (const car of app.simulation.cars) {
      const q = car.body.quaternion;
      lowestUp = Math.min(lowestUp, 1 - 2 * (q.x * q.x + q.z * q.z));
    }
  }
  const distances = app.simulation.cars.map((car) => Math.round(car.ai.furthestDistance));
  const stats = app.simulation.getSnapshot();
  console.log('Chaos distances / stats:', distances, stats);
  assert.ok(distances.filter((distance) => distance > TRACK_LENGTH).length >= 6, 'Too many cars stranded before one circuit');
  assert.ok(stats.bumps > 5, 'Not enough physical interactions');
  assert.ok(hazardContacts > 10, 'Cars never physically hit the hazards');
  assert.ok(lowestUp < 0.2, 'Impacts never tumbled a car');
  for (const car of app.simulation.cars) {
    for (const value of [...car.body.position.toArray(), ...car.body.velocity.toArray(), ...car.body.quaternion.toArray()]) assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(car.body.position.x) < 36 && Math.abs(car.body.position.z) < 22 && car.body.position.y > -3);
  }
  app.dispose();
});

await test('Airborne cars get gravity and collision reactions, not AI traction', () => {
  const app = setup(false);
  app.start();
  const car = app.simulation.cars[0];
  car.place(getTrackPoint(-4), 5);
  const beforeX = car.body.position.x;
  app.advance(0.2);
  assert.ok(Math.abs(car.body.position.x - beforeX) < 1e-8);
  assert.ok(car.body.velocity.y < -1);
  app.dispose();
});

await test('The same seed produces the same driving at 30 and 144 render frames per second', () => {
  const entries = createLobby().getEntries().slice(0, 1);
  function run(rate) {
    const app = setup(false, entries);
    app.start(655);
    app.advance(8, rate);
    const result = app.simulation.cars[0].body.position.clone();
    app.dispose();
    return result;
  }
  assert.ok(run(30).distanceTo(run(144)) < 1e-7);
});

await test('Thrown and upside-down cars recover without gaining waypoint progress', () => {
  const app = setup(false);
  app.start(); app.advance(4);
  const car = app.simulation.cars[0];
  const before = car.ai.furthestDistance;
  car.body.position.set(45, -5, 45);
  car.body.aabbNeedsUpdate = true;
  app.advance(1 / 60);
  assert.equal(car.recoveries, 1);
  assert.equal(car.ai.furthestDistance, before);
  assert.ok(Math.abs(car.body.position.x) < 32);
  const point = getTrackPoint(car.ai.nextDistance - 2);
  car.place(point);
  car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI);
  app.advance(8);
  assert.ok(car.ai.furthestDistance > before || car.recoveries > 1, 'Car stayed stranded');
  app.dispose();
});

await test('Repeated start/reset removes dynamic bodies and constraints without growing the world', () => {
  const app = setup();
  const initialBodies = app.physics.world.bodies.length;
  const initialConstraints = app.physics.world.constraints.length;
  for (let run = 0; run < 8; run++) {
    app.start(run); app.advance(0.2);
    app.simulation.reset();
    assert.equal(app.physics.world.bodies.length, initialBodies);
    assert.equal(app.physics.world.constraints.length, initialConstraints);
    assert.equal(app.simulation.getSnapshot().elapsed, 0);
    assert.equal(app.simulation.cars.length, 0);
  }
  app.simulation.dispose();
  assert.equal(app.physics.world.bodies.length, 133);
  assert.equal(app.physics.world.constraints.length, 0);
  app.physics.dispose();
});

console.log(`\n${passed} Step 3 checks passed.`);
