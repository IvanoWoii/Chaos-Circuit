# Chaos Circuit V1.5

A browser-based, zero-player racing game. Choose your car, enter a race, and watch AI drivers overtake, collide, tumble and recover. V1.5 includes the full-screen HUD, splash and main menu, car customization, randomized circuits and obstacles, and real multiplayer rooms.

**Public hosting:** the frontend is prepared for **Vercel**, with a Node/Socket.IO backend hosted either on a persistent service or on your computer through a secure HTTPS tunnel. Friends share the public Vercel URL and can play from different networks. See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact settings and deployment order.

## Start the complete game

The host/developer needs Node.js 20+ and npm. Players only need a browser with WebGL 2 and an internet connection for the pinned browser libraries.

```sh
npm ci
npm start
```

Open **http://localhost:3000**. In PowerShell, use `npm.cmd ci` and `npm.cmd start` if script execution is restricted. Dependencies are already installed in the current working copy. Local development needs no frontend build; `npm run build` prepares the static `dist/` directory for Vercel.

The Node server serves the game and Socket.IO on the same origin. It listens on `0.0.0.0:3000` by default. Friends on the same network open **http://YOUR-COMPUTER-LAN-IP:3000**, then create or join a room. `localhost` on a friend's device refers to their device, so share the host computer's LAN address. The host's firewall must allow the chosen port for LAN connections.

For internet play, host the Node backend on a persistent HTTP/WebSocket service and deploy the frontend to Vercel. Set Vercel's `MULTIPLAYER_URL` to the backend's public HTTPS origin, and the backend's `ALLOWED_ORIGINS` to the Vercel frontend origin. Set `PORT` to the hosting provider's assigned port; `HOST` can override the listening address. See [the deployment guide](DEPLOYMENT.md). This workspace has not been published to an internet host.

The older static preview remains available through `npm run start:solo` or `node scripts/serve.mjs` on port 8080. It supports local AI racing but does not provide the multiplayer room service. Use port 3000 for the complete V1.5 game.

LocalStorage belongs to an origin, including its port. Profiles previously saved on `localhost:8080` remain there; they are not automatically copied to `localhost:3000`. To use the old origin with the new server, stop the old static preview and launch the new server with `PORT=8080`. In PowerShell:

```powershell
$env:PORT = '8080'
npm.cmd start
```

## Play

1. The animated splash opens the main menu once the scene is ready. Reduced-motion preferences disable the splash animation and shorten its display.
2. Enter your driver name. **Customize Car** changes only color and racing style, then saves to LocalStorage.
3. **Race with AI** starts an eight-car race with your driver and seven bots. Each race gets a different circuit from the previous race and a fresh obstacle configuration.
4. **Race with Friend** opens the room browser. Create a room or join using a six-character room code or the active-room list.

The floating HUD keeps the canvas fixed to the viewport. **Driver**, **Racers**, **Scores**, and **Camera** open one panel at a time. Close panels using their button, ×, or Escape. Long panel content scrolls internally while the race stays visible. Start/pause/resume/reset controls remain at the bottom. **Menu** leaves the current race or room.

Names and positions have transparent backgrounds. Paint-colored **▼** arrows stay directly above their cars, with thin connectors when crowded names spread apart. Positions come from validated race progress.

The **Camera** panel includes orbit presets, **Follow race**, automatic rotation and the garage preview. Dragging or zooming takes manual camera control. Follow race restores automatic tracking.

## Room rules

- A room supports **2–8 total racers**, including humans and AI. The creator becomes Room Master.
- Room codes and the active-room list are shared across connected browsers on the same server. Rooms are public within that server.
- The Room Master can change the limit, manually add or remove AI racers, start, pause, resume and reset races. There is no automatic AI filling in multiplayer rooms.
- At least two racers are required to start. A solo host can add an AI racer. A room can start below its limit.
- Full rooms and running races reject new entrants. Existing disconnected participants can reconnect to their current race.
- A disconnected participant's seat is reserved for **30 seconds**. A connected human becomes Room Master if the master disconnects. Returning participants keep their identity but do not displace the new master.
- Reset returns everyone to the same room. The next race uses a different map and fresh obstacle settings.
- Empty rooms are removed. Rooms and reconnection sessions are in memory and disappear when the server restarts. The prototype runs in one Node process and allows up to 12 rooms.

The server checks membership, limits and master permissions for every command. Clients never submit car poses, finish times or win claims. The server advances cannon-es at 60 steps per second and sends authoritative car/obstacle snapshots at 20 Hz. Clients interpolate those snapshots with a small render delay. Physics and race clocks continue on the server when a player's tab is hidden or disconnected.

Session tokens use sessionStorage when available, so refreshing the same tab can restore its seat during the grace period. Profiles and scores use LocalStorage. Each browser records only its own participating profile's online result, once per race. This is a local score board, not a server account system.

## Circuits and chaos

| Circuit | Layout |
| --- | --- |
| Rookie Ring | Medium stadium circuit with an 8 m road |
| Sunset Speedway | Longer straights, tighter bends, 9 m road |
| Mint Motor Bowl | Short straights, broad circular bends, 9 m road |
| Canyon Sprint | Compact circuit with tighter bends and an 8 m road |

Every race rolls three hazards, including a hinged spinner and a suspended wrecking ball, plus another randomized spinner or ball. Placement, initial phase, size, swing amplitude, speed and direction derive from the race seed. Hazards remain away from the starting grid and spaced around the circuit. Rendered walls, physical colliders, grid positions, AI sensing and checkpoint gates all consume the same per-race layout.

Cars use compound rigid bodies with physical propulsion and yaw torque. Drivers have preferred lines, evaluate passing routes and nearby traffic, and consider moving obstacles. Collisions can still spin or launch them. Recovery tries reversing and self-righting before returning a stranded car behind its next required checkpoint.

A race lasts three laps. Twenty-four ordered gates per circuit validate progress. Reverse crossings, off-road shortcuts, high flyovers and recovery teleports do not award checkpoints. The starting-line crossing begins lap one. Finish times interpolate inside the physics step.

The race ends when everyone finishes, 40 seconds after the winner, or at a three-minute race-clock limit. Remaining cars receive DNF; their finish times are not fabricated. Results award one race appearance per participating local profile and one win to the actual winner. Aborting a solo race records no result. Local AI races pause when the tab is hidden; online races continue on the server.

## Project structure

```text
index.html                 HUD, splash, menu, customization, rooms and results
styles.css                 Shared arcade UI components
hud.css                    Full-screen stage, panels and transparent car labels
menus.css                  Menu, splash animation and room screens
js/
  main.js                  Composition and rendering lifecycle
  core/                    Scene, camera, lights and fixed-step physics
  data/profiles.js         Validated LocalStorage preferences and scores
  network/client.js       Lazy Socket.IO connection, sessions and commands
  race/
    session.js            Stable UI facade for local and online race worlds
    world.js              Isolated race world shared by browser and server
    simulation.js         Car/obstacle physics, snapshots and remote rendering
    controller.js         Countdown, pause, finish window and results
    progress.js           Ordered checkpoint and finish validation
    car.js                Compound rigid-body cars and interpolated visuals
    ai.js                 Driving forces, steering and recovery
    tactics.js            Per-layout sensing, overtaking and hazard prediction
    lobby.js              Local roster and automatic solo AI filling
  world/
    maps.js               Circuit pool and seeded obstacle configurations
    track-layout.js       Independent layout factories and projection helpers
    track.js              Circuit geometry and static colliders
    random-obstacles.js   Seeded dynamic hinges, motors, balls and snapshots
    obstacles.js          Original reference hazards used by legacy fixtures
    grid.js               Parked grid visuals and label targets
    car-visual.js         Primitive car meshes
    preview.js            Garage preview
  ui/
    app-flow.js           Splash/menu/customization/room navigation
    hud.js                Floating-panel state and keyboard dismissal
    race.js               Race controls, live standings and results
    lobby.js              Local driver profile and grid controls
    leaderboard.js        Saved local score board
    car-labels.js         Projected names, ranks, arrows and spacing
    controls.js           Camera controls
server/
  index.js                HTTP + Socket.IO server and simulation clock
  rooms.js                Room permissions, sessions and authoritative races
  static.js               Public asset serving and health endpoint
scripts/
  serve.mjs               Optional static solo preview
  check.mjs               Syntax and import-map validation
  test.mjs                All eight automated suites
  test-v15.mjs            New maps and real multi-client Socket.IO integration
  test-app-flow.mjs       Menus and room UI with real physics and sockets
```

## Verification

```sh
npm run check
npm test
```

The complete suite contains **59 checks**. It covers persistent preferences, room permissions and limits, reconnect/host transfer, isolated simultaneous rooms, identical authoritative snapshots, full races on all maps, race scoring, real overtaking, labels, HUD behavior and the splash/menu/customization/room flow. Deployment checks also cover frontend packaging and cross-origin room connections. Use `npm run test:deployment` for hosting integration checks, or `npm run test:v15` or `npm run test:app-flow` for the new feature suites alone.

Tests require installed Node dependencies and internet access for pinned browser-engine and LinkeDOM helpers. The tests use real Three.js/cannon-es and real Socket.IO clients. DOM fixtures do not simulate native CSS layout, focus management or WebGL rendering. Native browser visuals still require browser review.

Versions: Three.js **0.170.0**, cannon-es **0.20.0**, Socket.IO **4.8.3**. Server dependencies and their integrity hashes are locked in `package-lock.json`. Browser libraries use pinned import-map URLs. Google Fonts is optional.

References: [Socket.IO rooms](https://socket.io/docs/v4/rooms/), [Socket.IO server API](https://socket.io/docs/v4/server-api/), [Socket.IO client API](https://socket.io/docs/v4/client-api/), [Three.js](https://threejs.org/docs/), [cannon-es](https://pmndrs.github.io/cannon-es/docs/).
