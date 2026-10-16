import * as CANNON from 'cannon-es';
import { GAME_CONFIG } from '../config.js';

/** A fixed-step rigid-body world, independent of rendering and page frame rate. */
export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.25;
  world.defaultContactMaterial.restitution = 0.15;

  const materials = {
    road: new CANNON.Material('road'),
    wall: new CANNON.Material('wall'),
    car: new CANNON.Material('car'),
    obstacle: new CANNON.Material('obstacle'),
  };
  for (const [a, b, friction, restitution] of [
    // Ground contact supplies low rolling resistance. AI supplies directional tire
    // grip; high isotropic friction would pin a multi-wheel compound to the road.
    [materials.road, materials.car, 0.001, 0.08],
    [materials.wall, materials.car, 0.003, 0.5],
    [materials.car, materials.car, 0.008, 0.35],
    [materials.obstacle, materials.car, 0.003, 0.65],
    [materials.obstacle, materials.wall, 0.002, 0.25],
  ]) world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));

  let accumulator = 0;
  const { fixedTimeStep, maxSubSteps, maxFrameDelta } = GAME_CONFIG.physics;

  function addStaticBox({ size, x = 0, y = 0, z = 0, yaw = 0, material = materials.wall }) {
    const body = new CANNON.Body({ mass: 0, material, shape: new CANNON.Box(new CANNON.Vec3(...size.map((value) => value / 2))) });
    body.position.set(x, y, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    // Static bodies do not refresh their bounds during stepping. Update them after
    // positioning, or the broadphase may cull barriers using their old origin AABB.
    body.updateAABB();
    world.addBody(body);
    return body;
  }

  function step(elapsed, beforeStep, afterStep) {
    if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
    accumulator += Math.min(elapsed, maxFrameDelta);
    let count = 0;
    while (accumulator + 1e-10 >= fixedTimeStep && count < maxSubSteps) {
      beforeStep?.(fixedTimeStep);
      world.step(fixedTimeStep);
      afterStep?.(fixedTimeStep);
      accumulator = Math.max(0, accumulator - fixedTimeStep);
      count++;
    }
    // Discard backlog rather than fast-forwarding the race after a long pause.
    if (count === maxSubSteps) accumulator %= fixedTimeStep;
    return accumulator / fixedTimeStep;
  }

  return {
    world, materials, addStaticBox, step,
    resetAccumulator() { accumulator = 0; },
    dispose() {
      [...world.constraints].forEach((constraint) => world.removeConstraint(constraint));
      [...world.bodies].forEach((body) => world.removeBody(body));
      accumulator = 0;
    },
  };
}
