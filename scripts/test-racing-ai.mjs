import assert from 'node:assert/strict';
import { chooseDrivingPlan, trackGap, senseCar } from '../js/race/tactics.js';
import { getTrackPoint, projectTrackDistance, TRACK_LENGTH } from '../js/world/track-layout.js';
import { loadEngineHarness } from './engine-harness.mjs';

let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const driver = (distance, lane, speed, id = 'driver') => ({ id, distance, lane, speed, lateralSpeed: 0, height: 0.62 });
const personality = (lane = 0) => ({ preferredLane: lane, passingSide: -1, patience: 0.3 });
const previous = (lane = 0) => ({ lane, speedCap: 18, holdUntil: 0 });

await test('An unobstructed driver keeps an individual preferred line on either side', () => {
  for (const lane of [-2.2, 2.2]) {
    const own = driver(60, lane, 15);
    const plan = chooseDrivingPlan(own, [own], [], personality(lane), previous(lane), 18, 10);
    assert.ok(Math.abs(plan.lane - lane) < 0.001);
    assert.equal(plan.intent, 'holding');
  }
});

await test('A slower car ahead prompts a passing corridor instead of a central queue', () => {
  const own = driver(60, 0, 14);
  const blocker = driver(68, 0, 5, 'slow');
  const plan = chooseDrivingPlan(own, [own, blocker], [], personality(), previous(), 20, 10);
  assert.ok(Math.abs(plan.lane) >= 2.2);
  assert.equal(plan.intent, 'passing');
  assert.ok(plan.holdUntil > 11);
});

await test('Passing avoids cutting into a fast car alongside or approaching behind', () => {
  const own = driver(60, 0, 14);
  const blocker = driver(68, 0, 5, 'slow');
  const rear = driver(57, -2.35, 22, 'rear');
  const plan = chooseDrivingPlan(own, [own, blocker, rear], [], personality(), previous(), 20, 10);
  assert.ok(plan.lane > 2, `Unsafe passing corridor: ${plan.lane}`);
});

await test('Traffic sensing handles bends and the finish-line wrap', () => {
  assert.ok(Math.abs(trackGap(1, TRACK_LENGTH - 5) - 6) < 1e-8);
  const own = driver(TRACK_LENGTH - 5, 0, 14);
  const plan = chooseDrivingPlan(own, [own, driver(1, 0, 5, 'slow')], [], personality(), previous(), 20, 10);
  assert.ok(Math.abs(plan.lane) > 2);
  const point = getTrackPoint(23, 2.2);
  const sensed = senseCar({ entry: { id: 'bend' }, body: { position: point, velocity: { x: Math.sin(point.heading) * 10, y: 0, z: Math.cos(point.heading) * 10 } } });
  assert.ok(Math.abs(sensed.lane - 2.2) < 1e-8);
  assert.ok(Math.abs(sensed.speed - 10) < 1e-8);
});

await test('A blocked spinner pedestal causes an independent route around its center', () => {
  const distance = projectTrackDistance(-1, -12);
  const own = driver(distance - 10, 0, 12);
  const post = { kind: 'post', x: -1, z: -12, distance, yaw: 0, angularSpeed: 0, halfLength: 0.35, halfWidth: 0.35 };
  const plan = chooseDrivingPlan(own, [own], [post], personality(), previous(), 18, 10);
  assert.ok(Math.abs(plan.lane) > 2, `Still targeting the pedestal: ${plan.lane}`);
  assert.equal(plan.intent, 'avoiding');
});

const { createPhysics, createTrack, createSimulation, layoutCarLabels, THREE } = await loadEngineHarness();
await test('A faster local car physically passes a slower AI car without recovery assistance', () => {
  const physics = createPhysics();
  const track = createTrack(new THREE.Scene(), physics);
  const simulation = createSimulation(track.group, physics, { hazards: false });
  simulation.start([
    { id: 'slow', name: 'Slow AI', color: '#fb673e', style: 'bruiser', isBot: true },
    { id: 'fast', name: 'Fast local', color: '#648ed8', style: 'speedster', isBot: false },
  ], 887);
  for (const [index, distance] of [-12, -19].entries()) {
    const car = simulation.cars[index];
    car.place(getTrackPoint(distance));
    car.ai.nextDistance = Math.ceil(distance / (TRACK_LENGTH / 40)) * (TRACK_LENGTH / 40);
    car.ai.furthestDistance = distance;
    car.ai.personality.preferredLane = 0;
    car.ai.lane = car.ai.laneTarget = car.ai.plan.lane = 0;
    car.ai.planTimer = 0; car.ai.decisionTimer = 100;
    car.ai.speedBias = 1; car.ai.throttleNoise = 1;
  }
  let overtaken = false, largestLaneChange = 0;
  for (let frame = 0; frame < 18 * 60; frame++) {
    simulation.update(1 / 60);
    const [slow, fast] = simulation.cars.map(senseCar);
    largestLaneChange = Math.max(largestLaneChange, Math.abs(fast.lane));
    if (trackGap(fast.distance, slow.distance) > 3.5) { overtaken = true; break; }
  }
  console.log('Overtaking fixture:', { overtaken, largestLaneChange, recoveries: simulation.getSnapshot().recoveries });
  assert.ok(overtaken, 'Faster car never passed');
  assert.ok(largestLaneChange > 2, 'Faster car never actually used a passing lane');
  assert.equal(simulation.getSnapshot().recoveries, 0);
  simulation.dispose(); physics.dispose();
});

await test('Eight clustered nameplates fit without overlapping on desktop and mobile', () => {
  for (const width of [800, 350]) for (const anchorY of [60, 300, 490]) {
    const labels = layoutCarLabels(Array.from({ length: 8 }, (_, index) => ({ id: String(index), x: width / 2 + index, y: anchorY + index })), width, 500);
    for (let index = 0; index < labels.length; index++) {
      const a = labels[index];
      assert.ok(a.x >= 0 && a.x + a.width <= width && a.y >= 0 && a.y + a.height <= 500);
      for (const b of labels.slice(index + 1)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Cluster labels overlapped');
    }
  }
});
console.log(`\n${passed} racing AI / label checks passed.`);
