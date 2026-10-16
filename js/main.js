import { createScene } from './core/scene.js';
import { createPreview } from './world/preview.js';
import { bindControls } from './ui/controls.js';
import { createPhysics } from './core/physics.js';
import { createTrack } from './world/track.js';
import { createStartingGrid } from './world/grid.js';
import { createProfileStore } from './data/profiles.js';
import { createLobby } from './race/lobby.js';
import { bindLobbyUI } from './ui/lobby.js';
import { createSimulation } from './race/simulation.js';
import { createRaceController } from './race/controller.js';
import { bindRaceUI } from './ui/race.js';
import { bindLeaderboard } from './ui/leaderboard.js';
import { createCarLabels } from './ui/car-labels.js';
import { bindHUD } from './ui/hud.js';

/** Rendering, physics, lobby and full race flow meet only at this root. */
export function startGame() {
  const viewport = document.querySelector('#viewport');
  const app = createScene(viewport);
  let physics;
  let controlsUI;
  let lobbyUI;
  let raceUI;
  let leaderboardUI;
  let carLabels;
  let hudUI;
  let race;
  let simulation;
  let unsubscribeGrid;
  let grid;
  let track;
  try {
    physics = createPhysics();
    const preview = createPreview(app.scene);
    track = createTrack(app.scene, physics);
    grid = createStartingGrid(track.group);
    simulation = createSimulation(track.group, physics);
    const lobby = createLobby();
    const profiles = createProfileStore();
    grid.update(lobby.getEntries());
    unsubscribeGrid = lobby.subscribe((entries) => grid.update(entries));
    function setWorld(mode) {
      const garage = mode === 'garage';
      preview.group.visible = garage;
      track.group.visible = !garage;
      document.querySelector('#scene-label').textContent = garage ? 'GARAGE PREVIEW' : 'ROOKIE RING';
      document.querySelector('#scene-caption-copy').textContent = garage ? '01 / YOUR NEXT TROUBLEMAKER' : 'ROOKIE RING / 8 RACERS';
    }
    setWorld('track');
    controlsUI = bindControls(app.rig, setWorld);
    lobbyUI = bindLobbyUI(profiles, lobby, preview);
    race = createRaceController(simulation, profiles);
    leaderboardUI = bindLeaderboard(profiles);
    hudUI = bindHUD();
    raceUI = bindRaceUI(race, profiles, () => lobby.getEntries(), (state) => {
      grid.group.visible = state === 'lobby';
      lobbyUI.setLocked(state !== 'lobby');
      hudUI.onRaceState(state);
      if (state === 'lobby') controlsUI.setWorld('track');
    }, () => controlsUI.setWorld('track'));
    carLabels = createCarLabels(viewport);
    app.renderer.render(app.scene, app.rig.camera);
  } catch (error) {
    controlsUI?.dispose();
    lobbyUI?.dispose();
    raceUI?.dispose();
    leaderboardUI?.dispose();
    carLabels?.dispose();
    hudUI?.dispose();
    race?.dispose();
    simulation?.dispose();
    unsubscribeGrid?.();
    grid?.dispose();
    physics?.dispose();
    app.dispose();
    throw error;
  }

  document.querySelector('#loading').hidden = true;
  document.querySelector('#engine-status').textContent = 'WEBGL 2 · PHYSICS ON';
  document.body.dataset.sceneReady = 'true';
  document.body.dataset.physicsReady = 'true';
  document.body.dataset.trackColliders = String(track.staticBodyCount);

  const fpsCounter = document.querySelector('#fps-counter');
  let previousTime = null;
  let sampleStart = null;
  let frames = 0;
  let contextLost = false;
  const events = new AbortController();
  const options = { signal: events.signal };

  function frame(time) {
    // Rendering is variable-rate; the world advances in fixed 1/60-second steps.
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;
    sampleStart ??= time;
    race.update(delta);
    raceUI.update(time);
    if (race.state === 'racing') app.rig.updateDirector(race.getFocusCar(), delta);
    app.rig.controls.update(delta);
    app.renderer.render(app.scene, app.rig.camera);
    carLabels.update(race.state === 'lobby' ? grid.getLabelTargets() : simulation.cars,
      race.getSnapshot().standings, app.rig.camera, track.group.visible);
    frames++;
    if (time - sampleStart >= 1000) {
      fpsCounter.textContent = `${Math.round(frames * 1000 / (time - sampleStart))} FPS`;
      sampleStart = time;
      frames = 0;
    }
  }

  function syncAnimation() {
    previousTime = null;
    sampleStart = null;
    frames = 0;
    physics.resetAccumulator();
    const paused = document.hidden || contextLost;
    app.renderer.setAnimationLoop(paused ? null : frame);
    if (paused) fpsCounter.textContent = 'PAUSED';
  }

  document.addEventListener('visibilitychange', syncAnimation, options);
  app.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    document.querySelector('#engine-status').textContent = 'RESTORING WEBGL';
    syncAnimation();
  }, options);
  app.renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    document.querySelector('#engine-status').textContent = 'WEBGL 2 · PHYSICS ON';
    syncAnimation();
  }, options);

  // The bfcache retains a live page; do not destroy its renderer when navigating back.
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    events.abort();
    controlsUI.dispose();
    lobbyUI.dispose();
    raceUI.dispose();
    leaderboardUI.dispose();
    carLabels.dispose();
    hudUI.dispose();
    race.dispose();
    simulation.dispose();
    unsubscribeGrid();
    grid.dispose();
    track.dispose();
    physics.dispose();
    app.dispose();
  }, options);

  syncAnimation();
}
