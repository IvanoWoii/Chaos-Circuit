import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { projectTrackDistance } from './track-layout.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Both hazards are constrained dynamic bodies. Motors / torque drive the physics. */
export function createObstacles(parent, physics) {
  const group = new THREE.Group();
  group.name = 'chaos-obstacles';
  parent.add(group);
  const { world, materials } = physics;
  const bodies = [], constraints = [], poses = [];
  const orange = new THREE.MeshStandardMaterial({ color: '#f2643d', roughness: 0.65 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#efbd42', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#293e36', roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: '#f6efd6', roughness: 0.8 });

  function mesh(geometry, material, parentNode = group) {
    const node = new THREE.Mesh(geometry, material);
    node.castShadow = true;
    node.receiveShadow = true;
    parentNode.add(node);
    return node;
  }
  function box(size, material, position, parentNode = group) {
    const node = mesh(new THREE.BoxGeometry(...size), material, parentNode);
    node.position.set(...position);
    return node;
  }
  function addBody(body) {
    body.gameKind = 'obstacle';
    body.updateAABB();
    world.addBody(body);
    bodies.push(body);
    poses.push({ body, position: body.position.clone(), quaternion: body.quaternion.clone() });
    return body;
  }
  function addConstraint(constraint) { constraints.push(constraint); world.addConstraint(constraint); return constraint; }

  // The Sweeper: a physical bar on a motorized vertical hinge.
  const spinnerAnchor = addBody(new CANNON.Body({ mass: 0, material: materials.obstacle,
    position: new CANNON.Vec3(-1, 0.5, -12), shape: new CANNON.Box(new CANNON.Vec3(0.35, 0.5, 0.35)) }));
  box([0.7, 1, 0.7], dark, [-1, 0.5, -12]);
  const spinner = addBody(new CANNON.Body({ mass: 320, material: materials.obstacle,
    position: new CANNON.Vec3(-1, 1, -12), shape: new CANNON.Box(new CANNON.Vec3(3.5, 0.4, 0.45)),
    angularDamping: 0.03, allowSleep: false, collisionFilterGroup: 4, collisionFilterMask: 7 }));
  const spinnerHinge = addConstraint(new CANNON.HingeConstraint(spinnerAnchor, spinner, {
    pivotA: new CANNON.Vec3(0, 0.5, 0), pivotB: new CANNON.Vec3(),
    axisA: new CANNON.Vec3(0, 1, 0), axisB: new CANNON.Vec3(0, 1, 0), maxForce: 1e6,
  }));
  spinnerHinge.enableMotor();
  spinnerHinge.setMotorSpeed(1.8);
  spinnerHinge.setMotorMaxForce(14000);
  const spinnerRoot = new THREE.Group();
  group.add(spinnerRoot);
  box([7, 0.8, 0.9], orange, [0, 0, 0], spinnerRoot);
  for (const x of [-2.7, -1.5, 1.5, 2.7]) box([0.3, 0.82, 0.92], cream, [x, 0, 0], spinnerRoot);
  box([0.65, 0.95, 1], dark, [-3.2, 0, 0], spinnerRoot);
  box([0.65, 0.95, 1], dark, [3.2, 0, 0], spinnerRoot);

  // The Wrecking Ball: a bob hanging from a real hinge, sweeping across the bend.
  const anchorPoint = new CANNON.Vec3(-26, 6.7, 0);
  const length = 5.05;
  const initialAngle = 0.6;
  const ballAnchor = addBody(new CANNON.Body({ mass: 0, position: anchorPoint, collisionFilterGroup: 0 }));
  const ball = new CANNON.Body({ mass: 230, material: materials.obstacle,
    shape: new CANNON.Sphere(1.15), position: new CANNON.Vec3(anchorPoint.x + Math.sin(initialAngle) * length, anchorPoint.y - Math.cos(initialAngle) * length, 0),
    angularDamping: 0.03, linearDamping: 0.01, allowSleep: false, collisionFilterGroup: 4, collisionFilterMask: 7 });
  ball.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), initialAngle);
  addBody(ball);
  addConstraint(new CANNON.HingeConstraint(ballAnchor, ball, {
    pivotA: new CANNON.Vec3(), pivotB: new CANNON.Vec3(0, length, 0),
    axisA: new CANNON.Vec3(0, 0, 1), axisB: new CANNON.Vec3(0, 0, 1), maxForce: 1e6,
  }));
  box([0.4, 6.8, 0.5], dark, [-31.4, 3.4, 0]);
  box([0.4, 6.8, 0.5], dark, [-20.6, 3.4, 0]);
  box([11.4, 0.45, 0.6], orange, [-26, 6.7, 0]);
  const ballRoot = new THREE.Group();
  group.add(ballRoot);
  mesh(new THREE.SphereGeometry(1.15, 16, 12), yellow, ballRoot);
  const ballBand = mesh(new THREE.TorusGeometry(1.155, 0.065, 6, 24), dark, ballRoot);
  ballBand.rotation.x = Math.PI / 2;
  const cable = mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 8), dark);
  const targetQuaternion = new THREE.Quaternion();
  const ballPosition = new THREE.Vector3();
  const anchorVector = new THREE.Vector3(anchorPoint.x, anchorPoint.y, anchorPoint.z);
  const cableDirection = new THREE.Vector3();

  function syncBody(body, node, alpha) {
    node.position.set(
      body.previousPosition.x + (body.position.x - body.previousPosition.x) * alpha,
      body.previousPosition.y + (body.position.y - body.previousPosition.y) * alpha,
      body.previousPosition.z + (body.position.z - body.previousPosition.z) * alpha,
    );
    node.quaternion.set(body.previousQuaternion.x, body.previousQuaternion.y, body.previousQuaternion.z, body.previousQuaternion.w);
    targetQuaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    node.quaternion.slerp(targetQuaternion, alpha);
  }
  function sync(alpha = 1) {
    syncBody(spinner, spinnerRoot, alpha);
    syncBody(ball, ballRoot, alpha);
    ballPosition.copy(ballRoot.position);
    cable.position.copy(anchorVector).add(ballPosition).multiplyScalar(0.5);
    cableDirection.copy(anchorVector).sub(ballPosition);
    cable.scale.y = cableDirection.length();
    cable.quaternion.setFromUnitVectors(Y, cableDirection.normalize());
  }
  function reset() {
    poses.forEach(({ body, position, quaternion }) => {
      body.position.copy(position);
      body.previousPosition.copy(position);
      body.interpolatedPosition.copy(position);
      body.quaternion.copy(quaternion);
      body.previousQuaternion.copy(quaternion);
      body.interpolatedQuaternion.copy(quaternion);
      body.velocity.setZero(); body.angularVelocity.setZero();
      body.force.setZero(); body.torque.setZero();
      body.updateAABB(); body.wakeUp();
    });
    world.broadphase.dirty = true;
    sync();
  }
  reset();

  return {
    group, spinner, ball,
    getHazards() {
      const q = spinner.quaternion;
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      return [
        { kind: 'post', x: -1, z: -12, distance: projectTrackDistance(-1, -12), yaw: 0, angularSpeed: 0, halfLength: 0.35, halfWidth: 0.35 },
        { kind: 'spinner', x: spinner.position.x, z: spinner.position.z, distance: projectTrackDistance(spinner.position.x, spinner.position.z), yaw,
          angularSpeed: spinner.angularVelocity.y, halfLength: 3.5, halfWidth: 0.45 },
        { kind: 'ball', distance: projectTrackDistance(-26, 0), anchorX: -26, anchorY: 6.7, z: 0, length,
          angle: 2 * Math.atan2(ball.quaternion.z, ball.quaternion.w), angularSpeed: ball.angularVelocity.z, radius: 1.15 },
      ];
    },
    step(dt, time) {
      // A finite torque keeps the pendulum moving without setting its pose.
      const angle = 2 * Math.atan2(ball.quaternion.z, ball.quaternion.w);
      const target = Math.cos(time * 1.35) * 0.6;
      const targetRate = -Math.sin(time * 1.35) * 0.81;
      const drive = clamp((target - angle) * 3 + (targetRate - ball.angularVelocity.z) * 1.8, -2, 2);
      ball.torque.z += ball.mass * length * length * drive + ball.mass * 9.82 * length * Math.sin(angle);
    },
    sync, reset,
    dispose() {
      constraints.forEach((constraint) => world.removeConstraint(constraint));
      bodies.forEach((body) => world.removeBody(body));
      const geometries = new Set();
      group.traverse((node) => { if (node.geometry) geometries.add(node.geometry); });
      geometries.forEach((geometry) => geometry.dispose());
      [orange, yellow, dark, cream].forEach((material) => material.dispose());
      group.removeFromParent();
    },
  };
}
