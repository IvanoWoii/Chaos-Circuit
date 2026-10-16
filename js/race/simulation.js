import * as THREE from 'three';
import { createCar } from './car.js';
import { createDriverAI } from './ai.js';
import { createRandom } from '../utils/random.js';
import { defaultLayout } from '../world/track-layout.js';
import { createObstacles } from '../world/obstacles.js';
import { createDrivingTactics } from './tactics.js';
import { createRandomObstacles } from '../world/random-obstacles.js';

/** Physical driving sandbox; the race controller adds countdown and scoring. */
export function createSimulation(parent, physics, { hazards = true, layout = defaultLayout, map = null } = {}) {
  const { getGridSlot } = layout;
  const { senseCar } = createDrivingTactics(layout);
  const group = new THREE.Group();
  group.name = 'practice-simulation';
  parent.add(group);
  const obstacles = hazards ? (map ? createRandomObstacles(group,physics,layout,map.obstacles) : createObstacles(group, physics)) : null;
  let cars = [], drivers = [];
  let state = 'ready';
  let elapsed = 0, bumps = 0;
  let latestEvent = 'Choose your drivers, then unleash the chaos.';
  const listeners = new Set();
  const stepListeners = new Set();
  const collisionTimes = new Map();
  const byBody = new Map();

  function snapshot() {
    return { state, elapsed, bumps, recoveries: cars.reduce((sum, car) => sum + car.recoveries, 0),
      fastest: Math.max(0, ...cars.map((car) => Math.hypot(car.body.velocity.x, car.body.velocity.z))), latestEvent };
  }
  function notify() { const data = snapshot(); listeners.forEach((listener) => listener(data)); }
  function onImpact(car, event) {
    const other = event.body;
    if (other.gameKind !== 'car' && other.gameKind !== 'obstacle' && Math.abs(event.contact.ni.y) > 0.7) return;
    if (Math.abs(event.contact.getImpactVelocityAlongNormal()) < 2.2) return;
    const key = [car.body.id, other.id].sort((a, b) => a - b).join(':');
    if (elapsed - (collisionTimes.get(key) ?? -Infinity) < 0.5) return;
    collisionTimes.set(key, elapsed);
    bumps++;
    if (other.gameKind === 'obstacle') latestEvent = `${car.entry.name} just met a very unfriendly obstacle.`;
    else if (other.gameKind === 'car') latestEvent = `${car.entry.name} and ${byBody.get(other.id)?.entry.name || 'another driver'} exchanged paint.`;
    else latestEvent = `${car.entry.name} is getting acquainted with the barriers.`;
  }
  function clearCars() {
    cars.forEach((car) => car.dispose());
    cars = []; drivers = [];
    byBody.clear(); collisionTimes.clear();
  }

  return {
    get state() { return state; },
    get cars() { return cars; },
    get obstacles() { return obstacles; },
    getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeSteps(listener) { stepListeners.add(listener); return () => stepListeners.delete(listener); },
    start(entries, seed = Math.floor(Math.random() * 0x100000000)) {
      if (state !== 'ready' || !entries.length) return;
      const random = createRandom(seed);
      clearCars();
      obstacles?.reset();
      elapsed = 0; bumps = 0;
      try {
        entries.forEach((entry, index) => {
          const car = createCar(entry, getGridSlot(index), physics, group, onImpact);
          cars.push(car); byBody.set(car.body.id, car);
          drivers.push(createDriverAI(car, index, random, layout));
        });
      } catch (error) { clearCars(); throw error; }
      state = 'running';
      latestEvent = 'Eight AI drivers. Absolutely no supervision.';
      physics.resetAccumulator();
      notify();
    },
    pause() {
      if (state !== 'running') return;
      state = 'paused'; physics.resetAccumulator(); notify();
    },
    resume() {
      if (state !== 'paused') return;
      state = 'running'; physics.resetAccumulator(); notify();
    },
    reset() {
      clearCars(); obstacles?.reset();
      state = 'ready'; elapsed = 0; bumps = 0;
      latestEvent = 'Back on the grid. Ready for another questionable outing.';
      physics.resetAccumulator(); notify();
    },
    update(delta) {
      if (state !== 'running') return;
      const alpha = physics.step(delta, (dt) => {
        cars.forEach((car) => { car.grounded = false; });
        for (const contact of physics.world.contacts) {
          if (!contact.enabled) continue;
          const a = byBody.get(contact.bi.id), b = byBody.get(contact.bj.id);
          if (a && contact.ni.y < -0.45) a.grounded = true;
          if (b && contact.ni.y > 0.45) b.grounded = true;
        }
        obstacles?.step(dt, elapsed);
        // Every driver sees the same pre-step traffic snapshot, including locals.
        const perception = { traffic: cars.map(senseCar), hazards: obstacles?.getHazards() || [] };
        drivers.forEach((driver, index) => {
          const previousRecoveries = cars[index].recoveries;
          driver.step(dt, elapsed, cars, perception);
          if (cars[index].recoveries > previousRecoveries) latestEvent = `${cars[index].entry.name} needed a little roadside assistance.`;
        });
        elapsed += dt;
      }, (dt) => {
        stepListeners.forEach((listener) => listener(elapsed, dt, cars));
      });
      cars.forEach((car) => car.sync(alpha));
      obstacles?.sync(alpha);
    },
    dispose() { clearCars(); obstacles?.dispose(); listeners.clear(); stepListeners.clear(); group.removeFromParent(); },
    capture() { return { cars: cars.map(c=>({id:c.entry.id,p:c.body.position.toArray(),q:c.body.quaternion.toArray(),v:c.body.velocity.toArray(),revision:c.poseRevision,flash:c.recoveryFlash})), obstacles: obstacles?.capture?.() || [] }; },
    renderNetwork(a,b,t) {
      cars.forEach((car,i)=>{const next=b.cars[i];if(!next)return;const previous=a.cars[i]||next;const blend=previous.revision===next.revision?t:1;
        car.body.previousPosition.set(...previous.p);car.body.position.set(...next.p);car.body.previousQuaternion.set(...previous.q);car.body.quaternion.set(...next.q);car.body.velocity.set(...next.v);car.recoveryFlash=next.flash;car.sync(blend);
      });
      obstacles?.applyNetwork?.(a.obstacles,b.obstacles,t);
    },
  };
}
