import * as CANNON from 'cannon-es';
import { defaultLayout } from '../world/track-layout.js';
import { createDrivingTactics, MAX_LANE_OFFSET } from './tactics.js';

const UP = new CANNON.Vec3(0, 1, 0);
const FORWARD = new CANNON.Vec3(0, 0, 1);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrapAngle = (value) => Math.atan2(Math.sin(value), Math.cos(value));

export function createDriverAI(car, gridIndex, random, layout = defaultLayout) {
  const { TRACK_LENGTH, getTrackPoint, isOnRoad } = layout;
  const { chooseDrivingPlan, senseCar } = createDrivingTactics(layout);
  const spacing = TRACK_LENGTH / 40;
  const startDistance = -4 - Math.floor(gridIndex / 2) * 4.3;
  const lines = [-2.2, 2.2, -0.65, 0.65, -2.35, 2.35, -1.45, 1.45];
  const personality = { preferredLane: clamp(lines[gridIndex % lines.length] + (random() - 0.5) * 0.25, -MAX_LANE_OFFSET, MAX_LANE_OFFSET),
    passingSide: random() < 0.5 ? -1 : 1, patience: random() * 0.8 };
  car.ai = {
    nextDistance: Math.ceil(startDistance / spacing) * spacing,
    furthestDistance: startDistance, passedWaypoints: 0,
    lane: (gridIndex % 2 === 0 ? -1 : 1) * 1.55,
    laneTarget: personality.preferredLane, speedBias: 0.91 + random() * 0.15,
    phase: random() * Math.PI * 2, decisionTimer: 1 + random() * 2,
    steeringNoise: 0, throttleNoise: 1,
    stuckTime: 0, invertedTime: 0, offRoadTime: 0, noProgressTime: 0,
    reverseTime: 0, hasReversed: false,
    personality, plan: { lane: personality.preferredLane, speedCap: car.stats.maxSpeed, holdUntil: 0, intent: 'holding' },
    planTimer: gridIndex * 0.015,
  };
  const forward = new CANNON.Vec3();
  const up = new CANNON.Vec3();
  const force = new CANNON.Vec3();

  function rescue(fleet) {
    const ai = car.ai;
    // Stay behind the last waypoint; recovery must not award forward progress.
    let distance = Math.min(ai.nextDistance - spacing - 1, car.raceRecoveryLimit ?? Infinity);
    let point, lane;
    for (let attempt = 0; attempt < 5; attempt++) {
      lane = (attempt % 2 ? -1 : 1) * (car.recoveries % 2 ? -1 : 1) * 2.1;
      point = getTrackPoint(distance, lane);
      if (attempt === 4 || !fleet.some((other) => other !== car && Math.hypot(other.body.position.x - point.x, other.body.position.z - point.z) < 3.8)) break;
      distance -= 3.8;
    }
    car.place(point, 0.35);
    ai.nextDistance = Math.ceil(distance / spacing) * spacing;
    // Start steering from the recovered corridor, rather than immediately
    // cutting across traffic toward a stale lane on the opposite shoulder.
    ai.lane = ai.laneTarget = lane;
    ai.plan = { lane, speedCap: car.stats.maxSpeed, holdUntil: 0, intent: 'recovering' };
    ai.planTimer = 0;
    ai.stuckTime = ai.invertedTime = ai.offRoadTime = ai.reverseTime = ai.noProgressTime = 0;
    ai.hasReversed = false;
    car.recoveries++;
    car.recoveryFlash = 1.1;
    car.requestRecovery = false;
  }

  return {
    rescue,
    step(dt, time, fleet, perception) {
      const { body, ai, stats } = car;
      const { position, velocity, angularVelocity } = body;
      car.recoveryFlash = Math.max(0, car.recoveryFlash - dt);
      if (![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z, body.quaternion.w].every(Number.isFinite)) {
        rescue(fleet);
        return;
      }
      body.quaternion.vmult(UP, up);
      body.quaternion.vmult(FORWARD, forward);
      const speed = Math.hypot(velocity.x, velocity.z);
      const onRoad = isOnRoad(position.x, position.z, -0.4);
      ai.offRoadTime = onRoad ? 0 : ai.offRoadTime + dt;
      ai.invertedTime = up.y < 0.35 ? ai.invertedTime + dt : 0;
      ai.stuckTime = speed < 1.1 ? ai.stuckTime + dt : Math.max(0, ai.stuckTime - dt * 0.5);
      ai.noProgressTime += dt;
      if (car.requestRecovery || position.y < -3 || ai.offRoadTime > 1.6 || ai.invertedTime > 3.5 || ai.stuckTime > 7 || ai.noProgressTime > 8) {
        rescue(fleet);
        return;
      }

      // Let impacts tumble for a moment, then apply a modest self-righting torque.
      if (ai.invertedTime > 0.8 && position.y < 2.5) {
        const axisX = Math.abs(up.z) + Math.abs(up.x) < 0.05 ? 0.7 : -up.z;
        body.torque.x += body.inertia.x * (axisX * 12 - angularVelocity.x * 2.5);
        body.torque.z += body.inertia.z * (up.x * 12 - angularVelocity.z * 2.5);
      }

      // These waypoints guide steering. progress.js independently validates race laps.
      for (let attempt = 0; attempt < 2; attempt++) {
        const waypoint = getTrackPoint(ai.nextDistance, ai.lane);
        const dx = position.x - waypoint.x, dz = position.z - waypoint.z;
        const passed = dx * Math.sin(waypoint.heading) + dz * Math.cos(waypoint.heading);
        const lateral = Math.abs(dx * Math.cos(waypoint.heading) - dz * Math.sin(waypoint.heading));
        if (!onRoad || position.y > 2.5 || !(Math.hypot(dx, dz) < 2.3 || (passed > 0 && passed < 8 && lateral < 6))) break;
        ai.furthestDistance = Math.max(ai.furthestDistance, ai.nextDistance);
        ai.nextDistance += spacing;
        ai.passedWaypoints++;
        ai.noProgressTime = 0;
      }

      ai.decisionTimer -= dt;
      if (ai.decisionTimer <= 0) {
        ai.decisionTimer = 1.4 + random() * 2.3;
        ai.steeringNoise = (random() - 0.5) * 0.065;
        ai.throttleNoise = 0.88 + random() * 0.22;
      }
      const sensed = perception?.traffic || fleet.map(senseCar);
      const own = sensed.find((other) => other.id === car.entry.id) || senseCar(car);
      const curve = Math.abs(wrapAngle(getTrackPoint(own.distance + 9).heading - getTrackPoint(own.distance + 1).heading));
      const cornerSpeed = stats.maxSpeed > 20 ? 12.6 : stats.maxSpeed < 16 ? 10.5 : 11.7;
      const desiredSpeed = (curve > 0.22 ? cornerSpeed : stats.maxSpeed) * ai.speedBias * ai.throttleNoise;
      ai.planTimer -= dt;
      if (ai.planTimer <= 0) {
        ai.planTimer = 0.22 + personality.patience * 0.1;
        ai.plan = chooseDrivingPlan(own, sensed, perception?.hazards || [], personality, ai.plan, desiredSpeed, time);
        ai.laneTarget = ai.plan.lane;
      }
      // Rate-limited lane changes preserve a passing decision instead of averaging
      // fresh random targets back toward the middle of the road every few seconds.
      ai.lane += clamp(ai.laneTarget - ai.lane, -dt * 2, dt * 2);
      const lane = clamp(ai.lane + Math.sin(time * 1.7 + ai.phase) * 0.12, -MAX_LANE_OFFSET, MAX_LANE_OFFSET);
      const target = getTrackPoint(own.distance + 3.5 + Math.min(speed * 0.22, 3.2), lane);
      const desiredHeading = Math.atan2(target.x - position.x, target.z - position.z) + ai.steeringNoise;
      const forwardLength = Math.hypot(forward.x, forward.z);
      if (!car.grounded || up.y < 0.35 || forwardLength < 0.1) return;
      forward.x /= forwardLength;
      forward.z /= forwardLength;
      const headingError = wrapAngle(desiredHeading - Math.atan2(forward.x, forward.z));
      let targetSpeed = Math.min(desiredSpeed, ai.plan.speedCap);
      targetSpeed *= clamp(1 - Math.abs(headingError) * 0.36, 0.25, 1);
      if ((ai.stuckTime > 2.2 || ai.noProgressTime > 3.2) && !ai.hasReversed) {
        ai.reverseTime = 0.9;
        ai.hasReversed = true;
      }
      if (speed > 3) ai.hasReversed = false;
      const reversing = ai.reverseTime > 0;
      ai.reverseTime = Math.max(0, ai.reverseTime - dt);
      if (reversing) targetSpeed = -4;

      const forwardSpeed = velocity.x * forward.x + velocity.z * forward.z;
      const acceleration = clamp((targetSpeed - forwardSpeed) * 2.3, -11, 10);
      const lateralSpeed = velocity.x * forward.z - velocity.z * forward.x;
      const grip = clamp(-lateralSpeed * 5, -22, 22);
      force.set((forward.x * acceleration + forward.z * grip) * stats.mass, 0,
        (forward.z * acceleration - forward.x * grip) * stats.mass);
      body.applyForce(force);
      const yawRate = clamp(headingError * (reversing ? -1.4 : 3.1), -2.8, 2.8);
      body.torque.y += body.inertia.y * clamp((yawRate - angularVelocity.y) * 7, -18, 18);
      // Mild upright damping keeps regular cornering stable without locking rotation.
      body.torque.x += body.inertia.x * (-up.z * 3 - angularVelocity.x * 1.5);
      body.torque.z += body.inertia.z * (up.x * 3 - angularVelocity.z * 1.5);
    },
  };
}
