import { createScene } from './core/scene.js';
import { createPreview } from './world/preview.js';
import { createProfileStore } from './data/profiles.js';
import { createLobby } from './race/lobby.js';
import { createRaceSession } from './race/session.js';
import { bindControls } from './ui/controls.js';
import { bindLobbyUI } from './ui/lobby.js';
import { bindRaceUI } from './ui/race.js';
import { bindLeaderboard } from './ui/leaderboard.js';
import { createCarLabels } from './ui/car-labels.js';
import { bindHUD } from './ui/hud.js';
import { bindAppFlow } from './ui/app-flow.js';

/** Composition root: menus own navigation, session owns race mode, scene owns rendering. */
export function startGame() {
  const viewport = document.querySelector('#viewport');
  const app = createScene(viewport);
  let game, controls, lobbyUI, raceUI, scores, labels, hud, flow, unsubscribeRoster;
  let currentMap, worldMode = 'track';
  const events = new AbortController(), options = { signal: events.signal };
  function dispose() {
    events.abort(); flow?.dispose(); controls?.dispose(); lobbyUI?.dispose(); raceUI?.dispose();
    scores?.dispose(); labels?.dispose(); hud?.dispose(); unsubscribeRoster?.(); game?.dispose(); app.dispose();
  }
  try {
    const preview = createPreview(app.scene);
    const profiles = createProfileStore(), lobby = createLobby();
    game = createRaceSession(app.scene, profiles, lobby.getEntries(), {
      onMap(map) {
        currentMap = map;
        document.querySelector('#scene-label').textContent = map.name.toUpperCase();
        document.querySelector('#scene-caption-copy').textContent = `${map.name.toUpperCase()} / NEW CHAOS`;
        controls?.setWorld('track');
      },
      onRemoteResults: (id, rows) => flow?.recordResults(id, rows),
    });
    function setWorld(mode) {
      worldMode = mode;
      preview.group.visible = mode === 'garage';
      game.world.track.group.visible = mode !== 'garage';
      document.querySelector('#scene-label').textContent = mode === 'garage' ? 'GARAGE PREVIEW' : currentMap.name.toUpperCase();
      document.querySelector('#scene-caption-copy').textContent = mode === 'garage' ? 'YOUR NEXT TROUBLEMAKER' : `${currentMap.name.toUpperCase()} / ${game.online ? 'ROOM RACE' : 'AI RACE'}`;
    }
    controls = bindControls(app.rig, setWorld); setWorld('track');
    lobbyUI = bindLobbyUI(profiles, lobby, preview);
    unsubscribeRoster = lobby.subscribe(entries => { if (!game.online) game.setRoster(entries); });
    scores = bindLeaderboard(profiles); hud = bindHUD();
    raceUI = bindRaceUI(game, profiles, () => lobby.getEntries(), state => {
      game.world.grid.group.visible = state === 'lobby';
      lobbyUI.setLocked(game.online || state !== 'lobby', game.online ? 'Online races use your menu car. Leave the room to change your driver preferences.' : undefined);
      hud.onRaceState(state);
      if (state === 'lobby') controls.setWorld('track');
    }, () => controls.setWorld('track'));
    labels = createCarLabels(viewport);
    flow = bindAppFlow({ game, profiles, lobby, lobbyUI, controls, preview, hud });
    app.renderer.render(app.scene, app.rig.camera);
  } catch (error) { dispose(); throw error; }

  document.querySelector('#loading').hidden = true;
  document.querySelector('#engine-status').textContent = 'WEBGL 2 · PHYSICS ON';
  document.body.dataset.sceneReady = 'true'; document.body.dataset.physicsReady = 'true';
  const fpsCounter = document.querySelector('#fps-counter');
  let previousTime = null, sampleStart = null, frames = 0, contextLost = false;
  function frame(time) {
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, .1);
    previousTime = time; sampleStart ??= time;
    game.update(delta); raceUI.update(time);
    if (game.state === 'racing') app.rig.updateDirector(game.getFocusCar(), delta);
    app.rig.controls.update(delta);
    app.renderer.render(app.scene, app.rig.camera);
    labels.update(game.state === 'lobby' ? game.world.grid.getLabelTargets() : game.world.simulation.cars,
      game.getSnapshot().standings, app.rig.camera, worldMode === 'track' && document.body.dataset.appScreen === 'race');
    frames++;
    if (time - sampleStart >= 1000) { fpsCounter.textContent = `${Math.round(frames * 1000 / (time - sampleStart))} FPS`; sampleStart = time; frames = 0; }
  }
  function syncAnimation() {
    previousTime = null; sampleStart = null; frames = 0; game.world.physics.resetAccumulator();
    const paused = document.hidden || contextLost;
    // Online physics continues on the server while this tab is hidden. New
    // snapshots replace stale poses when rendering resumes; no local catch-up.
    app.renderer.setAnimationLoop(paused ? null : frame);
    if (paused) fpsCounter.textContent = 'PAUSED';
  }
  document.addEventListener('visibilitychange', syncAnimation, options);
  app.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; syncAnimation(); }, options);
  app.renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; syncAnimation(); }, options);
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, options);
  syncAnimation(); flow.ready();
}
