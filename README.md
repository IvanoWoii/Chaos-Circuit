# Chaos Circuit

A complete V1 prototype of a bright, low-poly, zero-player racing game. Register local players, choose their cars, then watch eight AI-driven racers collide, tumble and recover through a three-lap race. Three.js renders the world; cannon-es handles rigid-body cars, physical circuit boundaries and two moving hazards. All four development steps are implemented.

## V1.5, Step 1 — Full-screen race HUD

- The race canvas fills the browser viewport. The page does not scroll or push the race out of view.
- Live lap, race state, elapsed time, bumps, recoveries and speed sit in a compact top HUD. Start / pause / resume, results and reset remain in the bottom control dock.
- **Driver**, **Racers**, **Scores**, and **Camera** open floating panels, one at a time. Close a panel with its × button, its toggle, or Escape. Long panel contents scroll inside their panel while the circuit stays fixed. Panels close when the countdown or results begin.
- Car names and position badges have transparent backgrounds and outlined text. A paint-colored **▼** stays directly above each car; thin connectors associate displaced names with their arrows in crowded packs.
- Phone and short landscape layouts keep the controls within the viewport. Camera orbit and touch controls work through empty overlay areas.

This increment implements Step 1 only. The splash / main menu, randomized maps, and network rooms belong to the remaining V1.5 steps.

## Step 1 — Scene foundation (complete)

- Responsive HTML/CSS garage shell with keyboard-accessible controls.
- Three.js WebGL 2 renderer, soft shadows, sky fill and directional lighting.
- Orthographic isometric camera, drag/touch orbit, zoom, top view and optional automatic rotation.
- Primitive preview car, live paint selection and a low-poly display environment.
- Container-aware resizing, capped pixel density, hidden-tab pause, context recovery and cleanup.
- Readable errors when WebGL or the CDN is unavailable.

## Step 2 — Circuit, physics and lobby (complete)

- A wide stadium circuit with asphalt, rumble strips, a checkered line, grid markings and an infield.
- A static supporting slab and 132 wall colliders, including both sides of both bends. Rendered barriers and colliders share the same geometry descriptors.
- cannon-es physics at a fixed 60 Hz, bounded catch-up and contact materials for road, walls, cars and hazards.
- Player names, six paint swatches plus a custom color picker, and three racing styles with speed / mass tradeoffs.
- Multiple named profiles and their preferences, active selection and stats stored in LocalStorage. Invalid or blocked storage falls back to a usable in-memory session with a visible notice.
- Join / update / remove local drivers; AI automatically fills every remaining position to keep exactly eight cars.
- Circuit / garage scene switching, preserving the original car preview and camera controls.
- Instanced track scenery keeps hundreds of static pieces to a handful of draw calls.

## Step 3 — Cars, driving AI and chaos (complete)

- Eight dynamic cars with compound body / cabin / wheel colliders. Style selection determines actual body mass and desired top speed; all rotational axes stay unlocked for tumbling.
- Force-driven waypoint pursuit, physical yaw torque, directional grip and slower cornering. Cars are never moved along a precomputed animation path.
- Individual preferred racing lines, steering errors and throttle changes using a new random seed for each race. Local drivers and bots use the same traffic-aware AI.
- Drivers compare passing corridors, predict nearby traffic and hold a lane choice long enough to attempt an overtake. They consider the spinner's rotation, its fixed pedestal and the ball's current motion when choosing a route and arrival speed. Impacts remain physical and unpredictable.
- **The Sweeper:** a rigid bar spinning on a motor-driven hinge on the far straight.
- **The Wrecking Ball:** a large dynamic sphere suspended from a hinge over the left bend. Finite driving torque keeps it swinging; a visible cable follows its actual physical pose.
- Recovery first tries reversing and self-righting torque. Cars that remain stuck, flipped, off the road or below the world return behind their last waypoint, without receiving forward waypoint credit. Rescued cars briefly glow orange.
- Physical simulation, pause / resume and reset support. Active races lock lobby edits; resetting unlocks them.
- Live elapsed time, actual impact counts, recovery counts and the current fastest car's speed. Meshes interpolate physical poses for smoother rendering.
- Cars, obstacles and race clocks stop when the browser tab is hidden; returning does not fast-forward the simulation.

## Step 4 — Full races, results and leaderboard (complete)

- Lobby → three-second countdown → racing → results, with pause / resume and reset during either countdown or racing.
- Three laps, validated by 24 ordered physical checkpoint gates per circuit. The first starting-line crossing starts lap one; it does not complete a lap.
- Crossing times interpolate within the fixed physics step to order close finishes accurately. Reverse crossings, off-road shortcuts, high flyovers and recovery teleports cannot award checkpoints.
- Live standings and lap information, separate from the AI's steering waypoints. Recovery returns cars behind any unvalidated gate they missed.
- Names and live positions appear above the cars, including on the starting grid. Paint-colored connectors keep labels attached to their cars when packs bunch together; labels spread into nearby rows, hide offscreen / in the garage, and follow the camera. Positions use the same validated standings as the race HUD.
- A 1st / 2nd / 3rd podium and full classification with finish times or explicit DNF labels. Results can be closed with Esc and reopened without changing scores.
- Local player leaderboard, persistent race appearances and +1 win for the actual race winner. AI wins never become player wins. One atomic LocalStorage write includes scores and a bounded set of processed race IDs to prevent duplicate updates.
- Optional **Follow race** camera smoothly frames the leading unfinished car. Dragging / zooming takes manual control; the button restores automatic following. Automatic following starts off for reduced-motion preferences.
- **Reset Race** restores the grid and hazards, closes results and unlocks the lobby while retaining players and saved scores.

A race ends when everyone finishes, 40 seconds after the first finisher, or at a three-minute race-clock limit, whichever comes first. Remaining cars receive DNF; no finish time or podium place is fabricated. Every joined local profile receives one race appearance when results are finalized, including DNFs. Only a genuine winner receives a win. Aborting or refreshing an unfinished race records no result.

### Try the lobby

1. Open **Driver** in the floating HUD. Enter a driver name, select paint and choose All-rounder, Speedster or Bruiser.
2. Click **Join Race** to save the driver and replace an AI car on the starting grid.
3. Choose **+ New driver** from the saved-driver menu to add another local player.
4. Select an existing driver to edit them. **Update car** or **Save driver** updates their already-joined car in place.
5. Open **Camera** to switch between **Garage** for the paint preview and **Circuit** for the race. Open **Racers** to remove individual local drivers with ×, or use **Clear grid**; saved profiles remain available.
6. Refresh: saved profiles and their selected preferences return. The session grid resets to eight AI cars until you join again.

Preferences save explicitly on **Save driver** or **Join Race / Update car**. The UI marks unsaved changes. Profiles use `chaos-circuit.profiles.v1`; existing Step 2 / 3 profiles remain compatible. Wins and race appearances update only when race results are finalized. No player data is sent to a server.

### Run a race

1. Join any local drivers you want in the race, or leave all eight slots to AI.
2. Click **START RACE** below the circuit. Cars wait through 3, 2, 1, then GO. Each new race randomizes driving decisions.
3. Watch the spinner on the far straight and the swinging ball on the left bend. **Racers** now shows live standings. Open **Camera** for **Follow race**, **Top view**, and **Garage**; orbit and zoom also work directly on the canvas. The race continues while panels are open.
4. Use **Pause race** / **Resume race** to pause / continue the same state. Pausing also freezes countdown and finish-window clocks.
5. Check the podium and full classification at the checkered flag. Local wins and race counts appear immediately in the **Scores** panel and survive refresh.
6. Use **Reset Race — Back to lobby** to return to the starting grid. Your roster, saved profiles and scores remain intact. Resetting before results aborts the race without awarding scores.

The V1 cars use compound primitives rather than a suspension / tire simulation. Ground contacts use low rolling resistance, while AI applies directional grip and propulsion as forces only while supported. Impacts can still send cars flying; there is no airborne propulsion or locked upright orientation. Recovery assists keep a bad crash from permanently ending a car's participation.

## Preview locally

Serve the directory over HTTP; ES modules cannot reliably load from a double-clicked `file://` page.

If Node.js is already available, from this directory:

```sh
node scripts/serve.mjs
```

Then open **http://localhost:8080**. There are no npm dependencies and no install or build step. `npm start` also works (`npm.cmd start` in PowerShell if script execution is restricted). Alternatively, use an existing static web server or, if Python is installed, run `python -m http.server 8080 --bind 127.0.0.1`.

Players only need a current browser with WebGL 2 enabled and an internet connection. Hosting these static files makes the game accessible by URL with no player installation. Three.js and cannon-es load from version-pinned jsDelivr URLs. Google Fonts is optional; system fonts are the fallback. Nothing is published by this local scaffold.

## Project structure

```text
index.html                 Accessible page shell and pinned dependency import map
styles.css                 Arcade UI and responsive layouts
hud.css                    Full-viewport stage, floating panels and transparent labels
favicon.svg                Local vector mark
js/
  boot.js                  Startup and CDN / file-protocol errors
  main.js                  Composition root and render lifecycle
  config.js                Shared game and camera defaults
  core/
    scene.js               Renderer, resizing and resource disposal
    camera.js              Camera presets, OrbitControls and automatic following
    lighting.js            Sky fill, sun, shadows and rim light
    physics.js             Fixed-step Cannon world and static box helper
  data/
    profiles.js            Validated, versioned LocalStorage profile store
  race/
    lobby.js               Session roster with automatic AI filling
    car.js                 Compound dynamic car bodies and pose synchronization
    ai.js                  Imperfect waypoint driving and recovery assistance
    tactics.js             Traffic sensing, passing corridors and hazard prediction
    simulation.js          Physical driving lifecycle, fixed-step hooks and impact stats
    controller.js          Countdown, racing, pause, finish window and score recording
    progress.js            Independent gate crossings, laps and finish classification
  world/
    preview.js             Original car and garage staging
    track-layout.js        Shared circuit path, wall descriptors and grid slots
    track.js               Circuit meshes, scenery and physical boundaries
    car-visual.js          Reusable primitive car mesh and recovery flash
    grid.js                Starting-grid visual synchronization
    obstacles.js           Physical spinner, swinging ball and constraints
  ui/
    controls.js            Camera and scene-switching controls
    lobby.js               Profile form and roster DOM bindings
    race.js                Race HUD, countdown, live standings and results dialog
    leaderboard.js         Persistent local leaderboard rendering
    car-labels.js          Projected names, ranks and pack label spacing
    hud.js                 Floating panel toggles, dismissal and race-state integration
  utils/
    random.js              Seeded driving randomness
scripts/
  serve.mjs                Dependency-free local preview server
  check.mjs                JavaScript syntax and import-map checks
  engine-harness.mjs       Shared in-memory browser engine loader for tests
  test.mjs                 Runs all five test suites without subprocesses
  test-step2.mjs            Profile, roster, layout and engine integration checks
  test-step3.mjs            Dynamic cars, AI, hazard, recovery and lifecycle checks
  test-step4.mjs            Checkpoint, race-state, finish-order and score checks
  test-racing-ai.mjs        Passing decisions, physical overtaking and label spacing
  test-hud.mjs              HUD, profile/race flow, camera and arrow DOM integration
```

Run `node --experimental-vm-modules scripts/check.mjs` (or `npm run check`) to check the JavaScript syntax and dependency map. Node may print an experimental VM modules warning; the check only parses source and never executes it. This does not replace a browser / WebGL check.

Run `node --experimental-vm-modules scripts/test.mjs` (or `npm test`) for all 42 checks. This needs Node 20+ and internet access: the real pinned Three.js and cannon-es modules load in memory, without installation. Step 2 checks cover profiles, storage, lobby, circuit geometry and static collisions. Step 3 checks cover physical cars, driving, hazard contacts / tumbling, frame-rate agreement, recovery and lifecycle cleanup. Step 4 checks cover ordered gates, three laps, reverse / off-road / teleport rejection, close finish order, persistent scores, countdown / race pause, DNFs / timeouts, complete single-player and eight-car races, and aborted-race resets. The additional AI checks cover preferred lines, passing decisions, merging traffic, finish-line wrapping, pedestal avoidance, a local car physically overtaking a bot without recovery, and clustered label spacing at desktop / mobile sizes and screen edges. The tests do not launch or visually verify a browser.

Run `npm run test:racing-ai` (or `node --experimental-vm-modules scripts/test-racing-ai.mjs`) for only the passing and label checks.

Run `npm run test:hud` (or `node --experimental-vm-modules scripts/test-hud.mjs`) for four DOM integration checks covering panel switching, race flow, camera controls, and projected arrows. This loads pinned LinkeDOM 0.18.12 in memory; it verifies DOM behavior, not CSS layout, native focus management or WebGL rendering. The complete runner includes these four checks, for 42 checks total.

For only the new race checks, run `node --experimental-vm-modules scripts/test-step4.mjs` or `npm run test:step4`. The physical simulation remains separately testable through `scripts/test-step3.mjs`.

## Implementation notes

Physics and race state stay separate from rendering. `simulation.js` applies AI and obstacle forces through the physics module's fixed-step callback, then synchronizes interpolated meshes from bodies. After each fixed step, `controller.js` samples physical poses into `progress.js`. That module validates checkpoints independently of the AI's steering waypoints and rejects samples spanning a pose revision / teleport.

The application has no account system or online multiplayer. Multiple local players share one browser/device, and profiles / scores use that browser origin's LocalStorage. Clearing site data removes them. Race timing is simulation time, so background tabs and explicit pauses do not consume countdown or race deadlines. The underlying physical sandbox remains available as a module for engine tests, while the player-facing UI runs full races.

Engine reference: [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html), [cannon-es World](https://pmndrs.github.io/cannon-es/docs/classes/World.html), [Body](https://pmndrs.github.io/cannon-es/docs/classes/Body.html) and [HingeConstraint](https://pmndrs.github.io/cannon-es/docs/classes/HingeConstraint.html).
