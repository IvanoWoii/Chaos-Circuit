import * as THREE from 'three';
import { defaultLayout } from './track-layout.js';

/** A physical slab carries the asphalt and infield; the barriers enclose the road. */
export function createTrack(scene, physics, { layout = defaultLayout, map = null } = {}) {
  const { TRACK, TRACK_LENGTH, getTrackPoint, getGridSlot, getWallSegments, createWaypoints } = layout;
  const group = new THREE.Group();
  group.name = map?.name || 'rookie-ring';
  scene.add(group);
  const bodies = [];
  const surface = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const grass = surface(map?.grass || '#becaa4');
  const asphalt = surface('#64705f');
  const cream = surface('#f4efd9');
  const orange = surface('#ed7955');
  const dark = surface('#3a5140');
  const pale = surface('#d2d7b9');
  const boxBatches = new Map();

  function box(size, material, x, y, z, yaw = 0) {
    const transform = new THREE.Object3D();
    transform.position.set(x, y, z);
    transform.rotation.y = yaw;
    transform.scale.set(...size);
    transform.updateMatrix();
    if (!boxBatches.has(material)) boxBatches.set(material, []);
    boxBatches.get(material).push(transform.matrix);
  }

  // One robust Box foundation supports the complete circuit, including the infield.
  // Asphalt is painted onto its top. No fragile thin Trimesh collision surface is used.
  const floor = { size: [Math.max(64, 2 * (TRACK.straightHalf + TRACK.radius + TRACK.width / 2 + 4)), 0.8, Math.max(40, 2 * (TRACK.radius + TRACK.width / 2 + 4))], x: 0, y: -0.4, z: 0, material: physics.materials.road };
  box(floor.size, grass, floor.x, floor.y, floor.z);
  bodies.push(physics.addStaticBox(floor));

  function boundaryPath(offset, reverse = false) {
    const points = Array.from({ length: 192 }, (_, index) => {
      const point = getTrackPoint(index / 192 * TRACK_LENGTH, offset);
      return new THREE.Vector2(point.x, -point.z);
    });
    return reverse ? points.reverse() : points;
  }
  const roadShape = new THREE.Shape(boundaryPath(TRACK.width / 2));
  roadShape.holes.push(new THREE.Path(boundaryPath(-TRACK.width / 2, true)));
  const road = new THREE.Mesh(new THREE.ShapeGeometry(roadShape), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.012;
  road.receiveShadow = true;
  group.add(road);

  const walls = getWallSegments();
  walls.forEach((wall, index) => {
    box(wall.size, index % 5 < 2 ? orange : cream, wall.x, wall.y, wall.z, wall.yaw);
    bodies.push(physics.addStaticBox(wall));
  });

  // Low painted rumble strips never obstruct cars. Only the taller walls collide.
  for (let index = 0; index < 112; index++) {
    for (const offset of [-TRACK.width / 2 + 0.28, TRACK.width / 2 - 0.28]) {
      const point = getTrackPoint(index / 112 * TRACK_LENGTH, offset);
      box([0.4, 0.025, 1.2], index % 2 ? cream : orange, point.x, 0.027, point.z, point.heading);
    }
  }
  for (let distance = 2; distance < TRACK_LENGTH; distance += 5.2) {
    const point = getTrackPoint(distance);
    box([0.1, 0.015, 1.5], pale, point.x, 0.025, point.z, point.heading);
  }

  // Finish line is at distance zero. Four staggered rows sit behind it.
  for (let row = 0; row < 2; row++) for (let column = 0; column < TRACK.width / 0.5; column++) {
    box([0.5, 0.02, 0.5], (row + column) % 2 ? dark : cream, TRACK.startX + row * 0.5, 0.03,
      TRACK.radius - TRACK.width / 2 + 0.25 + column * 0.5);
  }
  for (let index = 0; index < 8; index++) {
    const slot = getGridSlot(index);
    const tx = Math.sin(slot.heading), tz = Math.cos(slot.heading);
    for (const side of [-1,1]) box([0.065,0.015,3.7],cream,slot.x+tz*side*1.4,.035,slot.z-tx*side*1.4,slot.heading);
    box([2.8,0.015,.065],cream,slot.x-tx*1.85,.035,slot.z-tz*1.85,slot.heading);
  }

  // Raised infield planters stay behind the inner wall and remain out of the race.
  box([12, 0.25, 5.5], pale, -4.5, 0.13, -0.3);
  box([10.5, 0.32, 4], grass, -4.5, 0.25, -0.3);
  for (const [x, z, scale] of [[-11, -3, 1], [-8, -2, 1.4], [-5, -2.5, 1.1], [17, 0, 1.3], [19, -2, 0.9]].filter(([x,z]) => !layout.isOnRoad(x,z,-2))) {
    box([0.3, 2 * scale, 0.3], dark, x, scale, z);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.1 * scale, 2.7 * scale, 5), surface('#8da477'));
    leaves.position.set(x, 2.6 * scale, z);
    leaves.castShadow = true;
    group.add(leaves);
  }

  // Hundreds of static curb / wall pieces become a handful of GPU draw calls.
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const [material, matrices] of boxBatches) {
    const batch = new THREE.InstancedMesh(boxGeometry, material, matrices.length);
    matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
    batch.instanceMatrix.needsUpdate = true;
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.computeBoundingSphere();
    group.add(batch);
  }

  return {
    group,
    waypoints: createWaypoints(),
    staticBodyCount: bodies.length,
    dispose() {
      bodies.forEach((body) => physics.world.removeBody(body));
      const geometries = new Set(), materials = new Set();
      group.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); });
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); group.removeFromParent();
    },
  };
}
