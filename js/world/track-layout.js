/** Engine-independent circuit data, shared by rendering, colliders and later AI. */
export const TRACK = Object.freeze({
  straightHalf: 14,
  radius: 12,
  width: 8,
  surfaceY: 0,
  wallHeight: 1.4,
  wallThickness: 0.55,
  arcSegments: 32,
  startX: 8,
});

export const TRACK_LENGTH = 4 * TRACK.straightHalf + 2 * Math.PI * TRACK.radius;
const wrap = (value, length) => ((value % length) + length) % length;

/** Distance zero is the finish line. Local +Z on a car points along heading. */
export function getTrackPoint(distance, laneOffset = 0) {
  const { straightHalf: half, radius } = TRACK;
  let along = wrap(distance + half + TRACK.startX, TRACK_LENGTH);
  let x, z, tx, tz;
  if (along < 2 * half) {
    x = -half + along; z = radius; tx = 1; tz = 0;
  } else if ((along -= 2 * half) < Math.PI * radius) {
    const angle = Math.PI / 2 - along / radius;
    x = half + radius * Math.cos(angle); z = radius * Math.sin(angle);
    tx = Math.sin(angle); tz = -Math.cos(angle);
  } else if ((along -= Math.PI * radius) < 2 * half) {
    x = half - along; z = -radius; tx = -1; tz = 0;
  } else {
    along -= 2 * half;
    const angle = -Math.PI / 2 - along / radius;
    x = -half + radius * Math.cos(angle); z = radius * Math.sin(angle);
    tx = Math.sin(angle); tz = -Math.cos(angle);
  }
  // The right-hand normal points toward the outside of this clockwise circuit.
  return { x: x - tz * laneOffset, y: TRACK.surfaceY, z: z + tx * laneOffset, heading: Math.atan2(tx, tz) };
}

export function getGridSlot(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 8) throw new RangeError('Grid slot must be between 0 and 7.');
  return getTrackPoint(-4 - Math.floor(index / 2) * 4.3, index % 2 === 0 ? -1.85 : 1.85);
}

export function isOnRoad(x, z, margin = 0) {
  const dx = Math.max(Math.abs(x) - TRACK.straightHalf, 0);
  const distance = Math.hypot(dx, z);
  return distance >= TRACK.radius - TRACK.width / 2 + margin && distance <= TRACK.radius + TRACK.width / 2 - margin;
}

export function createWaypoints(count = 40) {
  return Array.from({ length: count }, (_, index) => getTrackPoint(index / count * TRACK_LENGTH));
}

/** Closest road distance for AI sensing and interpolation, never checkpoint credit. */
export function projectTrackDistance(x, z) {
  const { straightHalf: half, radius, startX } = TRACK;
  let raw;
  if (x > half) raw = 2 * half + (Math.PI / 2 - Math.atan2(z, x - half)) * radius;
  else if (x < -half) raw = 4 * half + Math.PI * radius + (Math.atan2(z, -x - half) + Math.PI / 2) * radius;
  else raw = z >= 0 ? x + half : 3 * half + Math.PI * radius - x;
  return wrap(raw - half - startX, TRACK_LENGTH);
}

/** Every visible barrier uses this same descriptor for its Cannon Box collider. */
export function getWallSegments() {
  const segments = [];
  const { straightHalf: half, wallThickness: thickness, wallHeight: height, arcSegments } = TRACK;
  const add = (x, z, length, yaw, boundary) => segments.push({
    x, y: height / 2, z, size: [length, height, thickness], yaw, boundary,
  });
  for (const boundary of ['inner', 'outer']) {
    const radius = TRACK.radius + (boundary === 'outer' ? 1 : -1) * (TRACK.width / 2 + thickness / 2);
    add(0, radius, 2 * half + thickness, 0, boundary);
    add(0, -radius, 2 * half + thickness, 0, boundary);
    for (const side of [-1, 1]) {
      for (let index = 0; index < arcSegments; index++) {
        const a = -Math.PI / 2 + index / arcSegments * Math.PI;
        const b = -Math.PI / 2 + (index + 1) / arcSegments * Math.PI;
        const x1 = side * (half + radius * Math.cos(a));
        const z1 = radius * Math.sin(a);
        const x2 = side * (half + radius * Math.cos(b));
        const z2 = radius * Math.sin(b);
        // Slight overlap prevents tiny gaps at the joins between box colliders.
        add((x1 + x2) / 2, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1) + thickness * 0.2,
          -Math.atan2(z2 - z1, x2 - x1), boundary);
      }
    }
  }
  return segments;
}
