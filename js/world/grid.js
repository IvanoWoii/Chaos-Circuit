import * as THREE from 'three';
import { createCarVisual } from './car-visual.js';
import { getGridSlot } from './track-layout.js';

/** Parked grid only: roster changes repaint existing meshes without allocating anew. */
export function createStartingGrid(parent) {
  const group = new THREE.Group();
  group.name = 'starting-grid';
  parent.add(group);
  const cars = [];
  let labelTargets = [];
  return {
    group,
    getLabelTargets() { return labelTargets; },
    update(entries) {
      labelTargets = [];
      entries.forEach((entry, index) => {
        const car = cars[index] ||= createCarVisual(entry.color);
        if (!car.group.parent) group.add(car.group);
        const slot = getGridSlot(index);
        car.group.position.set(slot.x, slot.y + 0.015, slot.z);
        car.group.rotation.y = slot.heading;
        car.group.name = entry.name;
        car.group.userData = { racerId: entry.id, isBot: entry.isBot, style: entry.style };
        car.setPaint(entry.color);
        labelTargets.push({ entry: { ...entry }, root: car.group });
      });
    },
    dispose() { cars.forEach((car) => car.dispose()); group.removeFromParent(); },
  };
}
