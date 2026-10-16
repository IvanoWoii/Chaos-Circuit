import * as THREE from 'three';

/** A soft sky fill and one shadow-casting sun keep the scene cheap on mobile. */
export function addLighting(scene) {
  const sky = new THREE.HemisphereLight('#fffae5', '#6b815c', 2.6);
  scene.add(sky);

  const sun = new THREE.DirectionalLight('#fff1d3', 3.5);
  sun.position.set(-20, 45, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 35, bottom: -35, near: 0.5, far: 110 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  scene.add(sun);

  const rim = new THREE.DirectionalLight('#e5efff', 1.1);
  rim.position.set(6, 5, -8);
  scene.add(rim);
}
