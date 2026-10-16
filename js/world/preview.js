import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';

/** Visual staging for the garage; the actual circuit lives in track.js. */
export function createPreview(scene) {
  const stage = new THREE.Group();
  stage.name = 'garage-preview';
  scene.add(stage);

  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02 });
  const dark = material('#293c34');
  const cream = material('#f6f0da');
  const orange = material('#fb673e');
  const asphalt = material('#66735f');
  const tire = material('#27332e');
  const glass = material('#394c4c');
  const paint = material(GAME_CONFIG.defaultPaint);
  paint.roughness = 0.48;

  function mesh(geometry, surface, position, parent = stage) {
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (size, surface, position, parent) => mesh(new THREE.BoxGeometry(...size), surface, position, parent);
  const cylinder = (radius, height, surface, position, parent) => mesh(new THREE.CylinderGeometry(radius, radius, height, 64), surface, position, parent);

  // A simple ground catches shadows, while a raised display pad frames the car.
  const ground = mesh(new THREE.PlaneGeometry(200, 200), material(GAME_CONFIG.backgroundColor), [0, -0.34, 0]);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  cylinder(6.2, 0.5, dark, [0, -0.04, 0]);
  cylinder(6.2, 0.15, material('#c6ccaa'), [0, 0.285, 0]);
  cylinder(5.85, 0.05, asphalt, [0, 0.385, 0]);

  const rim = mesh(new THREE.RingGeometry(5.43, 5.48, 96), cream, [0, 0.417, 0]);
  rim.rotation.x = -Math.PI / 2;
  rim.castShadow = false;

  // Yellow rectangular parking marks add scale without needing downloaded assets.
  for (const x of [-2.2, 2.2]) {
    box([0.075, 0.018, 5.4], material('#ddd3a0'), [x, 0.425, 0]);
  }
  box([4.4, 0.018, 0.075], material('#ddd3a0'), [0, 0.425, -2.7]);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 10; column++) {
      box([0.46, 0.025, 0.46], (row + column) % 2 === 0 ? cream : dark,
        [(column - 4.5) * 0.46, 0.438, 3.25 + row * 0.46]);
    }
  }

  // Primitive car. Keep local +Z as forward for the future physics / AI module.
  const car = new THREE.Group();
  car.name = 'rookie-car-visual';
  car.position.set(0, 0.45, 0);
  car.rotation.y = -0.22;
  car.scale.setScalar(1.22);
  stage.add(car);
  box([1.8, 0.5, 3.25], paint, [0, 0.68, 0], car);
  box([1.65, 0.22, 3.35], paint, [0, 0.48, 0], car);
  box([1.4, 0.58, 1.55], glass, [0, 1.19, -0.26], car);
  box([1.48, 0.13, 1.7], paint, [0, 1.52, -0.26], car);
  // The pair of cream stripes ties the hood, roof and rear deck together.
  for (const x of [-0.2, 0.2]) {
    box([0.19, 0.016, 0.95], cream, [x, 0.938, 1.13], car);
    box([0.19, 0.016, 1.7], cream, [x, 1.595, -0.26], car);
    box([0.19, 0.016, 0.52], cream, [x, 0.938, -1.36], car);
  }
  for (const x of [-0.55, 0.55]) {
    box([0.38, 0.2, 0.04], material('#fff2bd'), [x, 0.71, 1.65], car);
    box([0.3, 0.12, 0.04], orange, [x, 0.66, -1.69], car);
    box([0.12, 0.35, 0.12], dark, [x, 0.98, -1.4], car);
  }
  box([1.98, 0.13, 0.4], dark, [0, 1.14, -1.48], car);
  box([1.95, 0.13, 0.14], dark, [0, 0.4, 1.7], car);

  const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.33, 16);
  const hubGeometry = new THREE.CylinderGeometry(0.23, 0.23, 0.345, 12);
  for (const x of [-0.94, 0.94]) {
    for (const z of [-1.08, 1.08]) {
      mesh(wheelGeometry, tire, [x, 0.43, z], car).rotation.z = Math.PI / 2;
      mesh(hubGeometry, cream, [x, 0.43, z], car).rotation.z = Math.PI / 2;
    }
  }

  // Canvas text is generated locally; no model, image, or texture downloads.
  function textTexture(text, background, foreground) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = background;
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = foreground;
    context.font = 'bold 156px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 138);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const numberMaterial = new THREE.MeshStandardMaterial({ map: textTexture('01', '#f6f0da', '#293c34'), roughness: 0.8 });
  for (const side of [-1, 1]) {
    const number = mesh(new THREE.PlaneGeometry(0.6, 0.45), numberMaterial, [side * 0.907, 0.7, -0.15], car);
    number.rotation.y = side * Math.PI / 2;
    number.castShadow = false;
  }

  function cone(x, z) {
    box([0.62, 0.08, 0.62], dark, [x, 0.47, z]);
    mesh(new THREE.ConeGeometry(0.22, 0.78, 8), orange, [x, 0.88, z]);
    mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.19, 8), cream, [x, 0.91, z]);
  }
  [[-3.4, 2.6], [3.4, 2.6], [-3.4, -2.7], [3.4, -2.7]].forEach(([x, z]) => cone(x, z));

  // Trackside props suggest the arcade world without implementing a circuit yet.
  const flagMaterial = new THREE.MeshStandardMaterial({
    map: (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d');
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
        context.fillStyle = (x + y) % 2 ? '#293c34' : '#f6f0da';
        context.fillRect(x * 32, y * 32, 32, 32);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })(),
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  for (const x of [-4.3, 4.3]) {
    cylinder(0.055, 2.8, dark, [x, 1.8, -2.8]);
    mesh(new THREE.PlaneGeometry(1.1, 0.7), flagMaterial, [x + 0.55, 2.8, -2.8]);
    cylinder(0.26, 0.15, dark, [x, 0.49, -2.8]);
  }

  function tree(x, z, scale) {
    const treeGroup = new THREE.Group();
    treeGroup.position.set(x, -0.3, z);
    treeGroup.scale.setScalar(scale);
    stage.add(treeGroup);
    cylinder(0.13, 1.5, material('#8b8061'), [0, 0.75, 0], treeGroup);
    const leaves = material('#8b9e72');
    mesh(new THREE.ConeGeometry(0.95, 1.7, 5), leaves, [0, 1.7, 0], treeGroup);
    mesh(new THREE.ConeGeometry(0.7, 1.45, 5), leaves, [0, 2.55, 0], treeGroup);
  }
  tree(-6.1, -3.4, 0.85);
  tree(-4.6, -5.8, 1.05);
  tree(5.6, -4.8, 0.9);
  tree(6.6, -2.8, 0.6);
  for (const [x, z, angle] of [[-5, 0.2, 0.3], [4.6, -0.2, -0.2]]) {
    const crate = box([0.8, 0.7, 0.8], material('#c7c8a3'), [x, 0.79, z]);
    crate.rotation.y = angle;
    const band = box([0.14, 0.72, 0.83], cream, [x, 0.79, z]);
    band.rotation.y = angle;
  }

  return {
    group: stage,
    car,
    setPaint(color) { paint.color.set(color); },
  };
}
