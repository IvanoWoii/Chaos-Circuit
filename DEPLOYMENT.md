# Public multiplayer: Vercel + a Node backend

Players open one public Vercel URL. Their browsers connect over HTTPS/WebSocket to a shared multiplayer backend. They can be on different networks; the developer's computer does not need to remain online.

The repository is prepared for this deployment, but no hosting service has been created or published from this workspace.

## 1. Put the project in a Git repository

Push the project to a repository you can import into both hosting providers. Include `package-lock.json`, `vercel.json`, `server/`, `scripts/` and `js/`. The `.gitignore` excludes generated `dist/`, dependencies and local environment files. Both services use this same repository.

## 2. Create the multiplayer backend

For example, create a **Node Web Service** on [Render](https://render.com/docs/deploy-node-express-app) and connect the repository. Render supports [WebSocket connections](https://render.com/docs/websocket). Another host with a persistent Node process and WebSocket forwarding also works.

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/health` |
| Instances | **1** |
| `NODE_VERSION` | `22` |
| `ALLOWED_ORIGINS` | Your exact frontend origin, e.g. `https://your-game.vercel.app` |

The server already binds to `0.0.0.0` and the provider's `PORT`. The provider must forward both HTTP requests and WebSocket upgrades on the same public HTTPS domain. No custom Socket.IO path is needed.

If the frontend domain is not known yet, deploy the backend first, then set `ALLOWED_ORIGINS` after creating the Vercel project. Until configured, it accepts only same-origin browser connections. Copy the backend's public URL, for example `https://your-multiplayer-service.onrender.com`. Visiting its `/health` should return `{"ok":true,"version":"1.5.0"}`.

Use a service that remains running during play. [Render's free service limits](https://render.com/docs/free) include idle spin-down and startup delays. Rooms and running races are in memory: backend restarts, deployments and shutdowns clear them. Keep one instance; adding replicas requires shared room coordination and simulation ownership first.

## 3. Deploy the frontend on Vercel

Import the same repository as a Vercel project. Use the **Other** framework preset and the repository root. The checked-in `vercel.json` defines:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `MULTIPLAYER_URL=https://your-multiplayer-service.onrender.com` |

Set `MULTIPLAYER_URL` for **Production** before deploying. Set it for Preview too if you want multiplayer on preview deployments. This is a public URL, not a secret. Use the backend origin only: HTTPS, no `/socket.io`, credentials, query parameters or trailing path.

The build copies only the game assets into `dist/` and embeds this URL in `js/network/config.js`. It fails on Vercel if the URL is missing or invalid. A change to this environment variable requires a new Vercel deployment. Server source, scripts and environment files are not included in the static site.

## 4. Allow the final Vercel domain on the backend

Set the backend service's environment variable and restart/redeploy that service:

```text
ALLOWED_ORIGINS=https://your-game.vercel.app
```

For a custom domain or selected preview domains, use a comma-separated list:

```text
ALLOWED_ORIGINS=https://your-game.vercel.app,https://race.example.com,https://your-exact-preview.vercel.app
```

Origins are exact matches, including protocol and port. There is no blanket `*.vercel.app` allowance. Both polling and WebSocket handshakes check the origin. This setting is an origin restriction, not player authentication: rooms remain public to users of your game.

## 5. Check and share

1. Open the **Vercel URL** in two browsers, ideally on different networks (for example Wi-Fi and mobile data).
2. Choose **Race with Friend** and wait for **Connected** in both.
3. Create a room in the first browser and join its code from the second.
4. Start a race and confirm both see the same cars, obstacles and results.
5. Share the Vercel URL and room code with friends. Nobody needs a LAN address or port forwarding.

If friends encounter Vercel's deployment access screen, check the project's Deployment Protection settings and share the intended publicly accessible production deployment.

## Troubleshooting

- **Build fails asking for `MULTIPLAYER_URL`:** add it to the correct Vercel environment and redeploy.
- **Solo works but rooms do not connect:** check backend `/health`, backend logs and the exact `ALLOWED_ORIGINS` value. Check the deployed `js/network/config.js` contains the backend HTTPS URL, not localhost.
- **403 on `/socket.io/`:** the page's origin is missing from `ALLOWED_ORIGINS`. Check the browser address bar for a preview or custom domain.
- **Long first connection:** the backend may be waking after sleeping. Keep it running for uninterrupted sessions.
- **Rooms disappear after deployment:** current rooms live only in the backend process. Deploy between races.
- **Old profile is missing:** LocalStorage is separate for localhost, Vercel previews and the production domain. Pick one stable production URL for saved preferences and scores.

## Local development and verification

`npm start` still serves the complete game at `http://localhost:3000` with same-origin multiplayer. Environment variables in `.env.example` are examples; the scripts read the process environment and do not automatically load `.env` files.

```sh
npm run check
npm run test:deployment
```

Deployment checks build the public frontend, validate configuration, exercise allowed/denied polling and WebSocket handshakes, and run two clients through a shared race. They do not verify an actual Vercel/Render deployment or native browser rendering.

## Why the physics backend is separate

[Vercel now supports WebSockets in public beta](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections). Connections can reach different function instances and close at the function's maximum duration. Vercel recommends external shared state for rooms across those instances. This game currently keeps each room, cannon-es world and 60 Hz simulation clock together in one Node process. A persistent backend preserves that implementation. Hosting everything on Vercel would require distributed room ownership, simulation checkpoint/resume and cross-instance message coordination; adding a WebSocket function alone would not provide those guarantees.
