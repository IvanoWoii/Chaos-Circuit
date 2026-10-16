import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { build, backendOrigin } from './build.mjs';
import { createGameServer } from '../server/index.js';

assert.equal(backendOrigin('', true), '');
for (const value of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/socket.io', 'https://example.com/?token=secret', 'https://localhost']) {
  assert.throws(() => backendOrigin(value, true));
}
assert.equal(backendOrigin('https://race.example.com/', true), 'https://race.example.com');
console.log('PASS deployment accepts an empty first deploy and rejects invalid public backend URLs');

await build({ url: 'https://race.example.com', vercel: true });
assert.match(await readFile('dist/js/network/config.js', 'utf8'), /https:\/\/race\.example\.com/);
assert.match(await readFile('dist/js/network/config.js', 'utf8'), /multiplayerConfigured = true/);
assert.match(await readFile('js/network/config.js', 'utf8'), /multiplayerUrl = ''/);
const output = await readdir('dist');
assert.deepEqual(output.sort(), ['.chaos-build', 'favicon.svg', 'hud.css', 'index.html', 'js', 'menus.css', 'styles.css']);
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
assert.equal(config.outputDirectory, 'dist');
console.log('PASS Vercel build includes only public assets and injects the backend URL without editing local config');

await build({ url: '', vercel: true });
assert.match(await readFile('dist/js/network/config.js', 'utf8'), /multiplayerConfigured = false/);
console.log('PASS initial Vercel build succeeds with online rooms explicitly disabled');
const unconfiguredClient = await import(`../dist/js/network/client.js?deployment-test=${Date.now()}`);
await assert.rejects(unconfiguredClient.createRoomClient({}), /Online rooms are not configured yet/);
console.log('PASS unconfigured deployment reports the missing Vercel setting before connecting');

const frontend = 'https://chaos-example.vercel.app';
const app = createGameServer({ manual: true, allowedOrigins: frontend });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${app.server.address().port}`;
const sockets = [];
async function connect(origin, transport) {
  const socket = io(address, { autoConnect: false, reconnection: false, timeout: 2000, transports: [transport], extraHeaders: { Origin: origin } });
  sockets.push(socket);
  const ready = new Promise((resolve, reject) => { socket.once('session', resolve); socket.once('connect_error', reject); });
  socket.connect();
  await ready;
  return socket;
}
try {
  const response = await fetch(`${address}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: frontend } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), frontend);
  const denied = await fetch(`${address}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: 'https://other.vercel.app' } });
  assert.equal(denied.status, 403);
  await assert.rejects(connect('https://other.vercel.app', 'websocket'));
  console.log('PASS only the configured frontend origin can open polling and WebSocket handshakes');

  const host = await connect(frontend, 'polling');
  const guest = await connect(frontend, 'websocket');
  const request = (socket, event, input = {}) => socket.timeout(3000).emitWithAck(event, input);
  const profile = name => ({ name, color: '#fb673e', style: 'balanced' });
  const created = await request(host, 'room:create', { profile: profile('Vercel host'), limit: 2 });
  assert.equal(created.ok, true);
  const joined = await request(guest, 'room:join', { code: created.room.code, profile: profile('Remote friend') });
  assert.equal(joined.ok, true);
  const started = once(guest, 'race:begin');
  assert.equal((await request(host, 'race:start')).ok, true);
  await started;
  const hostFrame = once(host, 'race:frame'), guestFrame = once(guest, 'race:frame');
  for (let i = 0; i < 3; i++) app.rooms.step();
  const [[a], [b]] = await Promise.all([hostFrame, guestFrame]);
  assert.equal(a.raceId, b.raceId);
  assert.deepEqual(a.poses, b.poses);
  console.log('PASS cross-origin polling and WebSocket clients join one room and receive the same authoritative race');
} finally {
  sockets.forEach(socket => socket.disconnect());
  await app.close();
}

const local = createGameServer({ manual: true, allowedOrigins: '' });
await new Promise(resolve => local.server.listen(0, '127.0.0.1', resolve));
const localAddress = `http://127.0.0.1:${local.server.address().port}`;
try {
  const response = await fetch(`${localAddress}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: localAddress } });
  assert.equal(response.status, 200);
  const denied = await fetch(`${localAddress}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: frontend } });
  assert.equal(denied.status, 403);
  console.log('PASS unconfigured local server retains same-origin play');
} finally { await local.close(); }

// Leave the generated local artifact usable without a fictional backend URL.
await build({ url: '', vercel: false });
assert.match(await readFile('dist/js/network/config.js', 'utf8'), /multiplayerConfigured = true/);
console.log('7 deployment checks passed.');
