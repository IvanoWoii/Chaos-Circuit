import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const marker = resolve(output, '.chaos-build');

export function backendOrigin(value, required = false) {
  const input = (value || '').trim();
  if (!input) {
    if (required) throw Error('Set MULTIPLAYER_URL to the public HTTPS multiplayer backend URL before deploying to Vercel.');
    return '';
  }
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
    `// Public deployment configuration. Contains no secrets.\nexport const multiplayerUrl = ${JSON.stringify(origin)};\n`);
  console.log(`Static game built in dist/. Multiplayer: ${origin || 'same origin (local development)'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
