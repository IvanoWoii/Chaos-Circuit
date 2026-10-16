# Public multiplayer: Vercel + a Node backend

Players open one public Vercel URL. Their browsers connect over HTTPS/WebSocket to a shared multiplayer backend. They can be on different networks. The backend can run on a cloud service, or on your own computer through a secure public tunnel.

The repository is prepared for this deployment, but no hosting service has been created or published from this workspace.

## Simpler option: keep the backend on your computer

This is a good fit for private play sessions. Use a tunnel with a stable HTTPS address so Vercel always knows where to reach the server. An ngrok account includes an assigned development domain; copy the exact domain shown in the ngrok dashboard.

Install ngrok and add the account token once, following the [ngrok setup guide](https://ngrok.com/use-cases/share-localhost). Then use two PowerShell windows.

In the first window, start the game server and allow your exact Vercel production origin:

```powershell
$env:ALLOWED_ORIGINS = 'https://your-game.vercel.app'
npm.cmd start
```

In the second window, forward the server through your assigned ngrok domain:

```powershell
ngrok http 3000 --url https://your-assigned-domain.ngrok.app
```

Use the actual assigned hostname from your ngrok account; its suffix may differ from the example. Test `https://your-assigned-domain.ngrok.app/health` and confirm it returns `{"ok":true,"version":"1.5.0"}`.

In Vercel, set the Production environment variable to that same origin and redeploy:

```text
MULTIPLAYER_URL=https://your-assigned-domain.ngrok.app
```

Environment-variable changes affect only new Vercel deployments, so the redeploy is required. A stable tunnel hostname means this is a one-time Vercel setting.

During every multiplayer session, your computer must stay awake and connected, and both `npm start` and ngrok must remain running. If either process stops, connected players lose the room; automatic Socket.IO reconnection resumes only if the same server process and tunnel return before the reserved seat expires. The backend remains authoritative, so its upload speed and distance from players affect latency. Rooms also disappear if the Node process restarts.

Do not forward port 3000 directly through the router. The tunnel supplies HTTPS and WebSocket forwarding without exposing your home IP or opening an inbound firewall port. The server accepts browser connections only from the exact origins in `ALLOWED_ORIGINS`, although that origin check is not an account or login system.

For a quick test without an account, Cloudflare offers [temporary Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/):

```powershell
cloudflared tunnel --url http://localhost:3000
```

Quick Tunnel hostnames change whenever the tunnel restarts and have no uptime guarantee. Each new hostname must be copied into Vercel's `MULTIPLAYER_URL` followed by a redeploy, so use this only for testing. A named Cloudflare Tunnel gives a stable hostname but requires a domain configured on Cloudflare.

If you want the game available while your PC is off, continue with the hosted backend instructions below.

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
