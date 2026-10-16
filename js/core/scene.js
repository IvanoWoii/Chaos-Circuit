import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { addLighting } from './lighting.js';
import { createCameraRig } from './camera.js';

/** Owns rendering only. Physics, cars and race state plug into this shell later. */
export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GAME_CONFIG.backgroundColor);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or try a current Chrome, Edge, Firefox, or Safari browser.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GAME_CONFIG.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D race circuit and garage');
  renderer.domElement.setAttribute('tabindex', '0');
  container.append(renderer.domElement);

  addLighting(scene);
  const rig = createCameraRig(renderer.domElement);

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GAME_CONFIG.maxPixelRatio));
    renderer.setSize(width, height, false);
    rig.resize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function dispose() {
    observer.disconnect();
    renderer.setAnimationLoop(null);
    rig.dispose();
    // Dispose shared resources exactly once when the page is torn down.
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
      node.shadow?.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { scene, renderer, rig, dispose };
}
