import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/** Seeded placement, real hinges and finite motor/drive forces. No pose animation in physics. */
export function createRandomObstacles(parent, physics, layout, definitions) {
  const group = new THREE.Group(); parent.add(group);
  const bodies = [], constraints = [], moving = [], sensors = [], drives = [];
  const paint = new THREE.MeshStandardMaterial({ color: '#f2643d', roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#efbd42' });
  const dark = new THREE.MeshStandardMaterial({ color: '#293e36' });
  const up = new THREE.Vector3(0,1,0);
  const q = new THREE.Quaternion();
  function mesh(geometry, material, position) {
    const node = new THREE.Mesh(geometry, material); node.castShadow = true; node.receiveShadow = true;
    if (position) node.position.set(...position); group.add(node); return node;
  }
  function body(options) {
    const result = new CANNON.Body({ material: physics.materials.obstacle, allowSleep: false, ...options });
    result.gameKind = 'obstacle'; result.updateAABB(); physics.world.addBody(result); bodies.push(result); return result;
  }
  for (const spec of definitions) {
    const point = layout.getTrackPoint(spec.distance);
    if (spec.kind === 'ramp' || spec.kind === 'spinner') {
      const rampWidth = Math.min(layout.TRACK.width * 0.85, Math.max(5.2, (spec.size || 2.5) * 2));
      const visibleLength = 6.0, lipHeight = 1.15;
      const pitch = Math.atan2(lipHeight, visibleLength);
      const qYaw = new CANNON.Quaternion();
      qYaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), point.heading);
      const qPitch = new CANNON.Quaternion();
      qPitch.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -pitch);
      const rampQ = qYaw.mult(qPitch);

      // The physics box is extended backwards underground:
      // Front of box is at s = -4.8 (top edge at y = -0.345m, so front face is completely underground)
      // Back of box is at s = +3.0 (top surface at y = 1.15m lip)
      // At s = -3.0 (entry), top surface emerges flush through the road floor (y = 0.00m) with zero ledge
      const zBoxBack = visibleLength / 2;
      const zBoxFront = -4.8;
      const boxLength = zBoxBack - zBoxFront;
      const sBoxCenter = (zBoxBack + zBoxFront) / 2;
      const halfThickness = 0.2;

      const ySurfCenter = ((sBoxCenter + visibleLength / 2) / visibleLength) * lipHeight;
      const boxCenterY = ySurfCenter - halfThickness * Math.cos(pitch);
      const boxCenterX = point.x + sBoxCenter * Math.sin(point.heading);
      const boxCenterZ = point.z + sBoxCenter * Math.cos(point.heading);

      const ramp = body({
        mass: 0,
        type: CANNON.Body.STATIC,
        position: new CANNON.Vec3(boxCenterX, boxCenterY, boxCenterZ),
        shape: new CANNON.Box(new CANNON.Vec3(rampWidth / 2, halfThickness, boxLength / 2)),
      });
      ramp.obstacleKind = 'ramp';
      ramp.quaternion.copy(rampQ);
      ramp.previousQuaternion.copy(rampQ);
      ramp.velocity.setZero();
      ramp.angularVelocity.setZero();
      ramp.updateAABB();

      // Three.js visual: A smooth wedge starting flush at y = 0
      const visual = new THREE.Group();
      visual.position.set(point.x, 0, point.z);
      visual.quaternion.set(qYaw.x, qYaw.y, qYaw.z, qYaw.w);
      group.add(visual);

      // Custom wedge geometry for the ramp deck and body
      const hw = rampWidth / 2, hl = visibleLength / 2, sunk = 0.25;
      const wedgeGeom = new THREE.BufferGeometry();
      const vertices = [], normals = [], uvs = [];
      const addQuad = (p1, p2, p3, p4, n) => {
        vertices.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
        normals.push(...n, ...n, ...n, ...n, ...n, ...n);
        uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      };
      const addTri = (p1, p2, p3, n) => {
        vertices.push(...p1, ...p2, ...p3);
        normals.push(...n, ...n, ...n);
        uvs.push(0, 0, 1, 0, 1, 1);
      };
      const pTL_top = [-hw, lipHeight, hl], pTR_top = [hw, lipHeight, hl];
      const pBL_top = [-hw, 0, -hl], pBR_top = [hw, 0, -hl];
      const pTL_bot = [-hw, -sunk, hl], pTR_bot = [hw, -sunk, hl];
      const pBL_bot = [-hw, -sunk, -hl], pBR_bot = [hw, -sunk, -hl];
      const deckNormal = [0, Math.cos(pitch), -Math.sin(pitch)];

      addQuad(pBL_top, pBR_top, pTR_top, pTL_top, deckNormal); // Top inclined deck
      addQuad(pTL_top, pTR_top, pTR_bot, pTL_bot, [0, 0, 1]); // Back lip wall
      addTri(pBL_bot, pBL_top, pTL_top, [-1, 0, 0]); // Left side wall
      addTri(pBL_bot, pTL_top, pTL_bot, [-1, 0, 0]);
      addTri(pBR_bot, pTR_top, pBR_top, [1, 0, 0]); // Right side wall
      addTri(pBR_bot, pTR_bot, pTR_top, [1, 0, 0]);
      addQuad(pBL_bot, pBR_bot, pBR_top, pBL_top, [0, 0, -1]); // Buried front toe
      addQuad(pBL_bot, pTL_bot, pTR_bot, pBR_bot, [0, -1, 0]); // Bottom face

      wedgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      wedgeGeom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      wedgeGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

      const deck = new THREE.Mesh(wedgeGeom, paint);
      deck.castShadow = true; deck.receiveShadow = true;
      visual.add(deck);

      // Smooth threshold apron plate at the bottom entrance
      const apron = new THREE.Mesh(new THREE.BoxGeometry(rampWidth + 0.1, 0.02, 0.45), dark);
      apron.position.set(0, 0.01, -hl);
      apron.castShadow = true; apron.receiveShadow = true;
      visual.add(apron);

      // Bright yellow hazard stripes along the inclined surface
      for (const z of [-1.5, 0.0, 1.5]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(rampWidth * 0.88, 0.024, 0.45), yellow);
        stripe.position.set(0, ((z + hl) / visibleLength) * lipHeight + 0.012, z);
        stripe.rotation.x = -pitch;
        stripe.castShadow = true;
        visual.add(stripe);
      }

      // Side curb guard rails
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, visibleLength + 0.4), dark);
        curb.position.set(side * (hw + 0.14), lipHeight / 2 + 0.1, 0);
        curb.rotation.x = -pitch;
        curb.castShadow = true;
        visual.add(curb);
      }

      moving.push({ body: ramp, node: visual, isStatic: true });
      sensors.push(() => [
        { kind: 'ramp', x: point.x, z: point.z, distance: spec.distance, width: rampWidth, length: visibleLength }
      ]);
    } else {
      const length = 5.05, radius = 1.05;
      const tangent = new CANNON.Vec3(Math.sin(point.heading),0,Math.cos(point.heading));
      const normal = { x: Math.cos(point.heading), z: -Math.sin(point.heading) };
      const anchor = body({mass:0,position:new CANNON.Vec3(point.x,6.7,point.z),collisionFilterGroup:0});
      const angle = Math.cos(spec.phase)*spec.amplitude;
      const ball = body({mass:210,shape:new CANNON.Sphere(radius),position:new CANNON.Vec3(point.x+normal.x*Math.sin(angle)*length,6.7-Math.cos(angle)*length,point.z+normal.z*Math.sin(angle)*length),angularDamping:.03,linearDamping:.01});
      ball.quaternion.setFromAxisAngle(tangent,angle); ball.previousQuaternion.copy(ball.quaternion);
      const hinge = new CANNON.HingeConstraint(anchor,ball,{pivotA:new CANNON.Vec3(),pivotB:new CANNON.Vec3(0,length,0),axisA:tangent,axisB:tangent,maxForce:1e6});
      physics.world.addConstraint(hinge); constraints.push(hinge);
      const visual = mesh(new THREE.SphereGeometry(radius,16,12),yellow);
      const cable = mesh(new THREE.CylinderGeometry(.055,.055,1,8),dark);
      moving.push({body:ball,node:visual,cable,anchor:anchor.position});
      const beam = mesh(new THREE.BoxGeometry(layout.TRACK.width+4,.4,.5),paint,[point.x,6.7,point.z]); beam.rotation.y = point.heading;
      for(const sign of [-1,1]) mesh(new THREE.BoxGeometry(.4,6.7,.4),dark,[point.x+normal.x*sign*(layout.TRACK.width/2+1.5),3.35,point.z+normal.z*sign*(layout.TRACK.width/2+1.5)]);
      const getAngle = () => Math.atan2((ball.position.x-point.x)*normal.x+(ball.position.z-point.z)*normal.z,6.7-ball.position.y);
      drives.push((time) => {
        const a=getAngle(), rate=ball.angularVelocity.dot(tangent), frequency=Math.abs(spec.speed);
        const target=Math.cos(time*frequency+spec.phase)*spec.amplitude;
        const targetRate=-Math.sin(time*frequency+spec.phase)*spec.amplitude*frequency;
        const force=Math.max(-2,Math.min(2,(target-a)*3+(targetRate-rate)*1.8))*ball.mass*length*length+ball.mass*9.82*length*Math.sin(a);
        ball.torque.x+=tangent.x*force; ball.torque.z+=tangent.z*force;
      });
      sensors.push(()=>[{kind:'ball',distance:spec.distance,anchorX:point.x,anchorY:6.7,z:point.z,normalX:normal.x,normalZ:normal.z,length,radius,angle:getAngle(),angularSpeed:ball.angularVelocity.dot(tangent)}]);
    }
  }
  const initial=bodies.map(item=>({p:item.position.clone(),q:item.quaternion.clone()}));
  function sync(alpha=1) {
    for (const item of moving) {
      if (item.isStatic) continue;
      const b=item.body;
      item.node.position.set(b.previousPosition.x+(b.position.x-b.previousPosition.x)*alpha,b.previousPosition.y+(b.position.y-b.previousPosition.y)*alpha,b.previousPosition.z+(b.position.z-b.previousPosition.z)*alpha);
      item.node.quaternion.set(b.previousQuaternion.x,b.previousQuaternion.y,b.previousQuaternion.z,b.previousQuaternion.w);
      q.set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w); item.node.quaternion.slerp(q,alpha);
      if(item.cable){ const direction=new THREE.Vector3().copy(item.anchor).sub(item.node.position); item.cable.position.copy(item.node.position).add(item.anchor).multiplyScalar(.5); item.cable.scale.y=direction.length();item.cable.quaternion.setFromUnitVectors(up,direction.normalize()); }
    }
  }
  function reset(){bodies.forEach((b,i)=>{b.position.copy(initial[i].p);b.previousPosition.copy(b.position);b.quaternion.copy(initial[i].q);b.previousQuaternion.copy(b.quaternion);b.velocity.setZero();b.angularVelocity.setZero();b.force.setZero();b.torque.setZero();b.updateAABB();b.wakeUp();});physics.world.broadphase.dirty=true;sync();}
  reset();
  return {group,sync,reset,getHazards:()=>sensors.flatMap(read=>read()),step:(dt,time)=>drives.forEach(drive=>drive(time)),
    capture:()=>moving.map(({body:b})=>({p:b.position.toArray(),q:b.quaternion.toArray()})),
    applyNetwork(a,b,t){ moving.forEach((item,i)=>{if(!b[i]||item.isStatic)return;const prev=a[i]||b[i]; item.body.previousPosition.set(...prev.p);item.body.position.set(...b[i].p);item.body.previousQuaternion.set(...prev.q);item.body.quaternion.set(...b[i].q);});sync(t); },
    dispose(){constraints.forEach(c=>physics.world.removeConstraint(c));bodies.forEach(b=>physics.world.removeBody(b));const geometries=new Set();group.traverse(n=>{if(n.geometry)geometries.add(n.geometry);});geometries.forEach(g=>g.dispose());[paint,yellow,dark].forEach(m=>m.dispose());group.removeFromParent();},
  };
}
