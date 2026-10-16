import { defaultLayout } from '../world/track-layout.js';
export const MAX_LANE_OFFSET = 2.4;
export function createDrivingTactics(layout = defaultLayout) {
const { TRACK_LENGTH, getTrackPoint, projectTrackDistance } = layout;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const trackGap = (ahead, behind) => ((ahead - behind + TRACK_LENGTH * 1.5) % TRACK_LENGTH) - TRACK_LENGTH / 2;

/** Road-relative sensing works on both bends and across the start/finish seam. */
function senseCar(car) {
  const { position, velocity } = car.body;
  const distance = projectTrackDistance(position.x, position.z);
  const center = getTrackPoint(distance);
  const tx = Math.sin(center.heading), tz = Math.cos(center.heading);
  return { id: car.entry.id, distance, lane: -(position.x - center.x) * tz + (position.z - center.z) * tx,
    speed: velocity.x * tx + velocity.z * tz, lateralSpeed: -velocity.x * tz + velocity.z * tx,
    height: position.y };
}

/** Oriented box overlap, using both vehicles' axes (rather than a huge sphere). */
function boxesOverlap(point, heading, hazard, time) {
  const yaw = hazard.yaw + hazard.angularSpeed * time;
  const dx = point.x - hazard.x, dz = point.z - hazard.z;
  const axes = [[Math.sin(heading), Math.cos(heading)], [-Math.cos(heading), Math.sin(heading)],
    [Math.cos(yaw), -Math.sin(yaw)], [Math.sin(yaw), Math.cos(yaw)]];
  const carForward = axes[0], carSide = axes[1], barLong = axes[2], barSide = axes[3];
  for (const [ax, az] of axes) {
    const carExtent = Math.abs(carForward[0] * ax + carForward[1] * az) * 1.65 + Math.abs(carSide[0] * ax + carSide[1] * az) * 1.37;
    const barExtent = Math.abs(barLong[0] * ax + barLong[1] * az) * hazard.halfLength + Math.abs(barSide[0] * ax + barSide[1] * az) * hazard.halfWidth;
    if (Math.abs(dx * ax + dz * az) > carExtent + barExtent + 0.12) return false;
  }
  return true;
}

function hazardRisk(own, lane, speed, hazards) {
  let risk = 0, nearest = Infinity;
  const travelSpeed = Math.max(5, (Math.max(0, own.speed) + speed) * 0.5);
  for (const hazard of hazards) {
    const distance = trackGap(hazard.distance, own.distance);
    if (distance < -5 || distance > 25) continue;
    nearest = Math.min(nearest, distance);
    if (hazard.kind === 'post') {
      // Plan the whole corridor around a permanent obstruction, even when a
      // short-horizon sample would stop just before or after its actual center.
      const center = getTrackPoint(hazard.distance);
      const postLane = -(hazard.x - center.x) * Math.cos(center.heading) + (hazard.z - center.z) * Math.sin(center.heading);
      risk += Math.max(0, 1.9 - Math.abs(lane - postLane)) * 160;
    }
    const arrival = clamp(distance / travelSpeed, 0, 2.4);
    for (const offset of [-0.25, 0, 0.25]) {
      const time = Math.max(0, arrival + offset);
      const futureLane = own.lane + (lane - own.lane) * Math.min(1, time * 1.5);
      const point = getTrackPoint(own.distance + travelSpeed * time, futureLane);
      if (hazard.kind === 'spinner' || hazard.kind === 'post') {
        if (boxesOverlap(point, point.heading, hazard, time)) risk += hazard.kind === 'post' ? 65 : 24;
      } else {
        // Predict the actual pendulum's current angular motion, not its controller.
        const angle = hazard.angle + hazard.angularSpeed * time;
        const x = hazard.anchorX + (hazard.normalX ?? 1) * Math.sin(angle) * hazard.length;
        const z = hazard.z + (hazard.normalZ ?? 0) * Math.sin(angle) * hazard.length;
        const y = hazard.anchorY - Math.cos(angle) * hazard.length;
        if (y - hazard.radius > 1.7) continue;
        const dx = x - point.x, dz = z - point.z;
        const along = Math.abs(dx * Math.sin(point.heading) + dz * Math.cos(point.heading));
        const across = Math.abs(-dx * Math.cos(point.heading) + dz * Math.sin(point.heading));
        if (Math.hypot(Math.max(0, along - 1.65), Math.max(0, across - 1.37)) < hazard.radius + 0.1) risk += 25;
      }
    }
  }
  return { risk, nearest };
}

/** Choose and hold a corridor. This changes goals and forces, never body poses. */
function chooseDrivingPlan(own, traffic, hazards, personality, previous, desiredSpeed, time) {
  const nearby = traffic.filter((other) => other.id !== own.id && Math.abs(trackGap(other.distance, own.distance)) < 25 && other.height < 2.8);
  const lanes = [...new Set([-2.35, 0, 2.35, personality.preferredLane, previous.lane].map((lane) => clamp(lane, -MAX_LANE_OFFSET, MAX_LANE_OFFSET)))];
  const blocker = nearby.find((other) => {
    const gap = trackGap(other.distance, own.distance);
    return gap > 0 && gap < 17 && Math.abs(other.lane - own.lane) < 2.25 && (other.speed < desiredSpeed - 1 || gap < 8);
  });
  let best = null;
  for (const lane of lanes) for (const speedFactor of [1, 0.7]) {
    const speed = desiredSpeed * speedFactor;
    let cost = Math.abs(lane - personality.preferredLane) * 0.7 + Math.abs(lane - own.lane) * 0.15 + (1 - speedFactor) * 13;
    cost += Math.abs(lane - previous.lane) * (time < previous.holdUntil ? 2.5 : 0.35);
    cost += (lane * personality.passingSide) * -0.08;
    for (const other of nearby) {
      const gap = trackGap(other.distance, own.distance);
      const separation = Math.abs(lane - other.lane);
      if (gap > 0 && gap < 17 && separation < 2.3 && other.speed < speed + 1) cost += (17 - gap) * (2.3 - separation) * 1.8;
      // Penalize merging into an alongside car or a fast car approaching behind.
      for (const t of [0.3, 0.7, 1.2]) {
        const candidateLane = own.lane + (lane - own.lane) * Math.min(1, t * 1.4);
        const otherLane = other.lane + clamp(other.lateralSpeed * t, -0.7, 0.7);
        const closingGap = gap + (other.speed - (own.speed + speed) * 0.5) * t;
        if (Math.abs(closingGap) < 4 && Math.abs(candidateLane - otherLane) < 2.2) {
          cost += (4 - Math.abs(closingGap)) * (2.2 - Math.abs(candidateLane - otherLane)) * 7;
        }
      }
    }
    const hazard = hazardRisk(own, lane, speed, hazards);
    cost += hazard.risk;
    if (!best || cost < best.cost) best = { lane, speedCap: speed, cost, hazard };
  }
  const changedLane = Math.abs(best.lane - previous.lane) > 0.6;
  let intent = blocker && Math.abs(best.lane - blocker.lane) > 2.2 ? 'passing' : 'holding';
  if (best.hazard.nearest < 22) intent = 'avoiding';
  // The chosen speed is part of the collision prediction. Braking again here
  // changes the arrival time and can strand the car inside a spinner's sweep.
  // If a blocker is already very close, leave space while steering into the gap.
  for (const other of nearby) {
    const gap = trackGap(other.distance, own.distance);
    if (gap > 0 && gap < 5 && Math.abs(own.lane - other.lane) < 2.1) {
      best.speedCap = Math.min(best.speedCap, Math.max(8.5, other.speed + Math.max(0, gap - 3) * 1.5));
    }
  }
  return { lane: best.lane, speedCap: best.speedCap, intent,
    holdUntil: changedLane ? time + 1.8 + personality.patience : previous.holdUntil };
}

return { senseCar, trackGap, chooseDrivingPlan };
}
export const { senseCar, trackGap, chooseDrivingPlan } = createDrivingTactics();
