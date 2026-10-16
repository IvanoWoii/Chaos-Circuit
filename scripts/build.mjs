import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const marker = resolve(output, '.chaos-build');

export function backendOrigin(value, required = false) {
  const input = (value || '').trim();
  // The first Vercel deploy is allowed without a backend. It gives the owner
  // the final frontend origin needed by ALLOWED_ORIGINS on the local server.
  if (!input) return '';
  let url;
  try { url = new URL(input); } catch { throw Error('MULTIPLAYER_URL must be an absolute HTTP(S) origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !required)) {
    throw Error('MULTIPLAYER_URL must use HTTPS (HTTP localhost is allowed for local testing only).');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (required && local)) {
    throw Error('MULTIPLAYER_URL must be a public origin only, without credentials, paths, query parameters or fragments.');
  }
  return url.origin;
}

export async function build({ url = process.env.MULTIPLAYER_URL, vercel = process.env.VERCEL === '1' } = {}) {
  const origin = backendOrigin(url, vercel);
  const multiplayerConfigured = Boolean(origin) || !vercel;
  // Only replace our own generated directory; never clean arbitrary user files.
  if (relative(root, output) !== 'dist') throw Error('Unexpected build output path.');
  try {
    if (await readFile(marker, 'utf8') !== 'chaos-circuit-generated\n') throw Error('Unrecognized dist directory.');
    await rm(output, { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { await mkdir(output); } catch (existing) {
      if (existing.code === 'EEXIST') throw Error('dist already exists without a build marker. Move it before building.');
      throw existing;
    }
  }
  await mkdir(output, { recursive: true });
  await writeFile(marker, 'chaos-circuit-generated\n');
  // This explicit allowlist excludes backend code, credentials and dependencies.
  for (const file of ['index.html', 'styles.css', 'hud.css', 'menus.css', 'favicon.svg', 'js']) {
    await cp(resolve(root, file), resolve(output, file), { recursive: true });
  }
  await writeFile(resolve(output, 'js/network/config.js'),
    `// Public deployment configuration. Contains no secrets.\nexport const multiplayerUrl = ${JSON.stringify(origin)};\nexport const multiplayerConfigured = ${multiplayerConfigured};\n`);
  if (vercel && !origin) console.warn('MULTIPLAYER_URL is not set. Deploying with Race with Friend disabled. Add the public ngrok HTTPS origin in Vercel, then redeploy.');
  console.log(`Static game built in dist/. Multiplayer: ${origin || (vercel ? 'not configured' : 'same origin (local development)')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
