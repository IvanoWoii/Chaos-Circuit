import * as THREE from 'three';

/** Render-only primitive car; the race/car module owns its physical transform. */
export function createCarVisual(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#273a33', roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#486368', roughness: 0.35 });
  const cream = new THREE.MeshStandardMaterial({ color: '#f6f0da', roughness: 0.8 });
  function box(size, material, position) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  box([1.8, 0.5, 3.25], paint, [0, 0.68, 0]);
  box([1.4, 0.58, 1.55], glass, [0, 1.19, -0.26]);
  box([1.48, 0.13, 1.7], paint, [0, 1.52, -0.26]);
  box([1.98, 0.13, 0.4], dark, [0, 1.05, -1.48]);
  box([1.95, 0.13, 0.14], dark, [0, 0.4, 1.7]);
  for (const x of [-0.2, 0.2]) {
    box([0.19, 0.016, 0.95], cream, [x, 0.938, 1.13]);
    box([0.19, 0.016, 1.7], cream, [x, 1.595, -0.26]);
  }
  for (const x of [-0.55, 0.55]) box([0.38, 0.2, 0.04], cream, [x, 0.71, 1.65]);
  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.33, 12);
  const hubGeometry = new THREE.CylinderGeometry(0.23, 0.23, 0.345, 10);
  for (const x of [-0.94, 0.94]) for (const z of [-1.08, 1.08]) {
    for (const [geometry, material] of [[wheelGeometry, dark], [hubGeometry, cream]]) {
      const wheel = new THREE.Mesh(geometry, material);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.43, z);
      wheel.castShadow = true;
      group.add(wheel);
    }
  }
  return {
    group,
    setPaint(value) { paint.color.set(value); },
    setRecovering(active) { paint.emissive.set(active ? '#cf793d' : '#000000'); paint.emissiveIntensity = active ? 0.65 : 0; },
    dispose() {
      const geometries = new Set();
      group.traverse((node) => { if (node.geometry) geometries.add(node.geometry); });
      geometries.forEach((geometry) => geometry.dispose());
      [paint, dark, glass, cream].forEach((material) => material.dispose());
      group.removeFromParent();
    },
  };
}
