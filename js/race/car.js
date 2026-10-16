import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { RACING_STYLES } from '../config.js';
import { createCarVisual } from '../world/car-visual.js';

const UP = new CANNON.Vec3(0, 1, 0);
export const CAR_CENTER_HEIGHT = 0.62;

/** Six compound shapes; wheels are collision spheres, not a vehicle suspension. */
export function createCar(entry, slot, physics, parent, onImpact) {
  const stats = RACING_STYLES[entry.style];
  const body = new CANNON.Body({
    mass: stats.mass, material: physics.materials.car,
    linearDamping: 0.12, angularDamping: 0.52, allowSleep: false,
    collisionFilterGroup: 2, collisionFilterMask: 7,
  });
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.9, 0.25, 1.625)), new CANNON.Vec3(0, 0.06, 0));
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.7, 0.34, 0.775)), new CANNON.Vec3(0, 0.57, -0.26));
  const wheel = new CANNON.Sphere(0.43);
  for (const x of [-0.94, 0.94]) for (const z of [-1.08, 1.08]) {
    body.addShape(wheel, new CANNON.Vec3(x, -0.19, z));
  }
  body.gameKind = 'car';
  body.racerId = entry.id;
  const visual = createCarVisual(entry.color);
  const root = new THREE.Group();
  const targetQuaternion = new THREE.Quaternion();
  root.name = entry.name;
  visual.group.position.y = -CAR_CENTER_HEIGHT;
  root.add(visual.group);
  parent.add(root);
  const impact = (event) => onImpact?.(car, event);
  body.addEventListener('collide', impact);

  const car = {
    entry: { ...entry }, stats, body, root, visual,
    grounded: false, recoveries: 0, recoveryFlash: 0, ai: null, poseRevision: 0,
    place(point, lift = 0.12) {
      car.poseRevision++;
      body.position.set(point.x, point.y + CAR_CENTER_HEIGHT + lift, point.z);
      body.quaternion.setFromAxisAngle(UP, point.heading);
      body.previousPosition.copy(body.position);
      body.interpolatedPosition.copy(body.position);
      body.previousQuaternion.copy(body.quaternion);
      body.interpolatedQuaternion.copy(body.quaternion);
      body.velocity.setZero();
      body.angularVelocity.setZero();
      body.force.setZero();
      body.torque.setZero();
      body.updateAABB();
      if (body.world) body.world.broadphase.dirty = true;
      body.wakeUp();
      car.grounded = false;
    },
    sync(alpha = 1) {
      root.position.set(
        body.previousPosition.x + (body.position.x - body.previousPosition.x) * alpha,
        body.previousPosition.y + (body.position.y - body.previousPosition.y) * alpha,
        body.previousPosition.z + (body.position.z - body.previousPosition.z) * alpha,
      );
      root.quaternion.set(body.previousQuaternion.x, body.previousQuaternion.y, body.previousQuaternion.z, body.previousQuaternion.w);
      targetQuaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      root.quaternion.slerp(targetQuaternion, alpha);
      visual.setRecovering(car.recoveryFlash > 0);
    },
    dispose() {
      body.removeEventListener('collide', impact);
      physics.world.removeBody(body);
      visual.dispose();
      root.removeFromParent();
    },
  };
  car.place(slot);
  physics.world.addBody(body);
  car.sync();
  return car;
}
