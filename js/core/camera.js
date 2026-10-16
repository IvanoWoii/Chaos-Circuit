import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GAME_CONFIG } from '../config.js';

/** Orthographic projection gives the arcade preview a miniature / isometric feel. */
export function createCameraRig(canvas) {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.target.fromArray(GAME_CONFIG.camera.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 1.8;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.autoRotateSpeed = 0.7;
  let mode = 'track';
  let currentView = 'isometric';
  let directorEnabled = true;
  const desiredTarget = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  let width = 1;
  let height = 1;
  const settings = () => mode === 'track' ? GAME_CONFIG.trackCamera : GAME_CONFIG.camera;

  function setView(view) {
    const position = settings()[view];
    if (!Array.isArray(position)) return;
    currentView = view;
    // Switching presets also resets accumulated mouse/touch zoom and damping.
    controls.reset();
    controls.target.fromArray(settings().target);
    camera.position.fromArray(position);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    controls.saveState();
  }

  function resize(nextWidth, nextHeight) {
    width = nextWidth;
    height = nextHeight;
    const aspect = width / Math.max(height, 1);
    // Fit the whole circuit even in a narrow phone viewport.
    const halfHeight = Math.max(settings().viewSize / 2, (settings().minHalfWidth || 7.8) / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }

  setView('isometric');
  function setMode(value) {
    mode = value === 'garage' ? 'garage' : 'track';
    controls.autoRotate = false;
    resize(width, height);
    setView('isometric');
  }
  function updateDirector(car, dt) {
    if (!directorEnabled || mode !== 'track' || !car) return;
    // Keep some circuit context while smoothly framing the leading unfinished car.
    desiredTarget.set(car.root.position.x * 0.58 + car.body.velocity.x * 0.12, 0.8,
      car.root.position.z * 0.58 + car.body.velocity.z * 0.12);
    desiredPosition.fromArray(settings()[currentView]).add(desiredTarget);
    const blend = 1 - Math.exp(-Math.max(0, dt) * 2.5);
    controls.target.lerp(desiredTarget, blend);
    camera.position.lerp(desiredPosition, blend);
    camera.zoom += (1.28 - camera.zoom) * blend;
    camera.updateProjectionMatrix();
  }
  return {
    camera, controls, setView, setMode, resize, updateDirector,
    get directorEnabled() { return directorEnabled; },
    setDirector(enabled) { directorEnabled = enabled; if (enabled) controls.autoRotate = false; },
    dispose: () => controls.dispose(),
  };
}
