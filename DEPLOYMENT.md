# Complete setup: Vercel frontend with a local multiplayer backend

This guide uses the simplest arrangement for this project:

```text
Friends' browsers
        |
        v
Vercel frontend (public website)
        |
        v
ngrok HTTPS/WebSocket tunnel
        |
        v
Node.js multiplayer server on your computer
```

Your friends visit only the Vercel website. They do not need your IP address, do not need to share your network, and do not install anything. Your computer runs the authoritative race simulation, so it must remain powered on and connected while multiplayer is available.

## What the earlier Vercel error meant

The previous build required `MULTIPLAYER_URL` before Vercel could deploy:

```text
Error: Set MULTIPLAYER_URL to the public HTTPS multiplayer backend URL before deploying to Vercel.
```

That created an awkward circle: you often want the Vercel address first so the backend can allow it. The build has now been changed so the first deployment succeeds without `MULTIPLAYER_URL`. Solo racing works immediately. **Race with Friend** displays a clear configuration message until you add the tunnel URL and redeploy.

## Requirements

Install or create these before starting:

- Node.js 20 or newer on the computer that will host races.
- A GitHub, GitLab, or Bitbucket repository containing this project.
- A Vercel account connected to that repository.
- A free ngrok account.
- The ngrok Windows application.

Never commit an ngrok authtoken, Vercel token, `.env` file, or other credential. The repository already ignores `.env`, `.env.*`, `.vercel/`, `node_modules/`, and the generated `dist/` directory.

## Part 1 — Check the project locally

Open PowerShell in the project folder:

```powershell
cd 'E:\game\me\balap chaos'
npm.cmd ci
npm.cmd run check
npm.cmd run test:deployment
```

Start the complete local game:

```powershell
npm.cmd start
```

Open `http://localhost:3000`. Confirm that solo racing works. You can also open two browser windows and test a local friend room. Stop the server with `Ctrl+C` after this check.

## Part 2 — Push the current project to your Git repository

Commit and push the current files, including these deployment files:

```text
vercel.json
package.json
package-lock.json
scripts/build.mjs
js/network/config.js
js/network/client.js
server/
```

Do not upload `node_modules/` or `dist/`. Vercel installs dependencies and generates `dist/` during its build.

If Vercel is already connected to this repository, push the latest changes and continue to Part 3.

## Part 3 — Make the first Vercel deployment

1. Open the [Vercel dashboard](https://vercel.com/dashboard).
2. Select **Add New → Project**.
3. Import the repository containing this game.
4. Set **Framework Preset** to **Other** if Vercel does not select it automatically.
5. Leave **Root Directory** at the repository root.
6. The repository's `vercel.json` supplies these settings:

   ```text
   Build Command: npm run build
   Output Directory: dist
   ```

7. Do not add `MULTIPLAYER_URL` yet.
8. Select **Deploy**.

The build should succeed and print:

```text
MULTIPLAYER_URL is not set. Deploying with Race with Friend disabled.
Static game built in dist/. Multiplayer: not configured
```

This is a warning, not an error. Open the deployment and verify solo play. Copy the stable production origin from the address bar, for example:

```text
https://chaos-circuit.vercel.app
```

Use only the origin: include `https://`, and omit a trailing slash, path, query string, or fragment.

## Part 4 — Install and connect ngrok on Windows

Install ngrok from the Microsoft Store, or use the official WinGet command:

```powershell
winget install ngrok -s msstore
```

Close and reopen PowerShell if the `ngrok` command is not found.

Sign in to the [ngrok dashboard](https://dashboard.ngrok.com/), open the setup page, and copy your personal authtoken command. Run it once:

```powershell
ngrok config add-authtoken 'PASTE_YOUR_PRIVATE_AUTHTOKEN_HERE'
```

Do not paste the token into source files or send it to other people.

In the ngrok dashboard, find your assigned static development domain under **Domains**. Copy the exact HTTPS address. It may resemble one of these:

```text
https://example-name.ngrok-free.app
https://example-name.ngrok.app
```

Use the hostname assigned to your own account; do not copy either example literally.

## Part 5 — Start the local multiplayer backend

Open a new PowerShell window in the project folder. Replace the example with the exact Vercel production origin copied in Part 3:

```powershell
cd 'E:\game\me\balap chaos'
$env:ALLOWED_ORIGINS = 'https://chaos-circuit.vercel.app'
npm.cmd start
```

Keep this window open. A successful start prints that the server is listening on port 3000.

`ALLOWED_ORIGINS` is an exact, comma-separated allowlist. If you later use a custom domain, allow both exact origins:

```powershell
$env:ALLOWED_ORIGINS = 'https://chaos-circuit.vercel.app,https://race.example.com'
npm.cmd start
```

Do not use `*`, paths, or trailing slashes. Preview deployments have changing hostnames, so this tutorial uses the stable production deployment.

## Part 6 — Start the public tunnel

Open a second PowerShell window. Replace the URL with your assigned ngrok domain:

```powershell
ngrok http 3000 --url 'https://example-name.ngrok-free.app'
```

Keep this window open too. ngrok should show a forwarding address that points to `http://localhost:3000`.

Test the public backend in a browser by appending `/health`:

```text
https://example-name.ngrok-free.app/health
```

The expected response is:

```json
{"ok":true,"version":"1.5.0"}
```

On a free ngrok account, the first browser visit may show ngrok's safety page. Select its visit/continue button once, then confirm the JSON response. The game client connects directly with WebSocket and does not use that HTML page.

If `/health` does not load, do not continue yet. Check that `npm.cmd start` is still running, ngrok forwards to port 3000, and the tunnel uses the assigned domain.

## Part 7 — Connect Vercel to the tunnel

1. Open the Vercel project.
2. Go to **Settings → Environment Variables**.
3. Create this variable:

   ```text
   Name: MULTIPLAYER_URL
   Value: https://example-name.ngrok-free.app
   Environment: Production
   ```

4. Use your real ngrok origin. Do not add `/health`, `/socket.io`, a trailing slash, quotation marks, or spaces.
5. Save the variable.
6. Open **Deployments**.
7. Find the latest production deployment, open its menu, and select **Redeploy**.
8. Do not reuse the old build cache if Vercel offers that choice and the generated configuration appears stale.

Environment-variable changes apply only to new deployments. A successful build now prints the configured ngrok origin:

```text
Static game built in dist/. Multiplayer: https://example-name.ngrok-free.app
```

You can verify the embedded value after deployment by opening:

```text
https://chaos-circuit.vercel.app/js/network/config.js
```

It should contain:

```js
export const multiplayerUrl = "https://example-name.ngrok-free.app";
export const multiplayerConfigured = true;
```

This file contains only a public address. It must not contain the ngrok authtoken.

## Part 8 — Test multiplayer from two networks

Keep both local PowerShell windows running:

1. `npm.cmd start`
2. `ngrok http 3000 --url ...`

Then:

1. Open the Vercel production URL on your computer.
2. Open the same Vercel URL on a phone using mobile data, or ask a friend on another network.
3. On both devices, choose **Race with Friend**.
4. Wait until both show **Connected**.
5. Create a room on one device.
6. Enter its six-character room code on the other device.
7. Start the race and confirm both devices show the same cars, obstacles, timing, and results.

Only share the Vercel URL and room code. Friends should not open localhost, port 3000, or the ngrok dashboard.

## Starting a multiplayer session later

The Vercel frontend and stable ngrok domain remain configured. For each future play session, open two PowerShell windows and run:

Window 1:

```powershell
cd 'E:\game\me\balap chaos'
$env:ALLOWED_ORIGINS = 'https://chaos-circuit.vercel.app'
npm.cmd start
```

Window 2:

```powershell
ngrok http 3000 --url 'https://example-name.ngrok-free.app'
```

You do not need to redeploy Vercel when the assigned ngrok hostname stays the same.

## Important limitations

- Your computer must remain awake, online, and connected during the whole race.
- Closing either PowerShell window takes multiplayer offline.
- Restarting the Node server deletes current rooms and races because V1.5 stores them in memory.
- Your upload bandwidth, Wi-Fi quality, and distance from players affect latency.
- Free tunnel plans have traffic and connection limits that can change over time.
- The origin allowlist reduces accidental browser access but is not user authentication. Anyone using the public game can create or join rooms if they know a room code.
- LocalStorage profiles belong to each website origin. Profiles created on localhost do not automatically appear on the Vercel domain.

## Troubleshooting

### Vercel still shows the old missing-variable build error

The deployment is building an older commit. Confirm the latest `scripts/build.mjs` is pushed to the repository. The new version contains this message:

```text
Deploying with Race with Friend disabled
```

Trigger a new deployment from the latest commit.

### Vercel builds, but Race with Friend says it is not configured

Check all four items:

1. `MULTIPLAYER_URL` exists in **Project Settings → Environment Variables**.
2. It is enabled for **Production**.
3. Its value is the HTTPS ngrok origin only.
4. You redeployed after saving it.

Open `/js/network/config.js` on the deployed Vercel site to see what that deployment actually embedded.

### The Vercel build rejects MULTIPLAYER_URL

Valid:

```text
https://example-name.ngrok-free.app
```

Invalid examples:

```text
http://example-name.ngrok-free.app
https://example-name.ngrok-free.app/
https://example-name.ngrok-free.app/health
localhost:3000
```

The production value must be a public HTTPS origin without a trailing slash or path.

### `/health` gives an ngrok or connection error

- Confirm the Node server says it is listening on port 3000.
- Confirm ngrok forwards to `http://localhost:3000`.
- Try `http://localhost:3000/health` locally first.
- Restart ngrok with the exact assigned domain.
- Check whether antivirus, VPN, or corporate firewall software blocks ngrok.

### Vercel opens, but the room screen stays disconnected

- Confirm the public ngrok `/health` endpoint works.
- Confirm Vercel's `/js/network/config.js` contains the same ngrok origin.
- Restart Node with `ALLOWED_ORIGINS` exactly matching the Vercel address shown in the browser.
- Do not include a trailing slash in `ALLOWED_ORIGINS`.
- If using a Vercel preview URL, add that exact preview origin to `ALLOWED_ORIGINS`, or test from production instead.
- Inspect the Node and ngrok windows for rejected requests or disconnects.

### The room worked and then disappeared

The Node process restarted, the PC slept, or the tunnel disconnected. Current rooms are not stored in a database. Start both processes again and create a new room.

### Friends see a Vercel login or protection page

Open the Vercel project's deployment protection settings and ensure the intended production deployment is publicly accessible. Do not disable protections on unrelated projects.

### Port 3000 is already in use

Stop the older game server with `Ctrl+C`. To identify the process in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

Use one backend process so every player reaches the same in-memory room service.

## Security notes

- Do not configure router port forwarding; ngrok creates the outbound tunnel.
- Do not expose or commit the ngrok authtoken.
- Do not put secrets in `MULTIPLAYER_URL`; it is embedded in public JavaScript.
- Keep Node.js, npm dependencies, ngrok, and the operating system updated.
- Stop ngrok and the Node server when the multiplayer service is not in use.

## Useful official documentation

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel build troubleshooting](https://vercel.com/docs/deployments/troubleshoot-a-build)
- [ngrok Windows installation](https://ngrok.com/download/windows)
- [ngrok localhost sharing](https://ngrok.com/use-cases/share-localhost)
