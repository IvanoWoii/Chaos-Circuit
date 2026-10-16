import { createRoomClient } from '../network/client.js';

/** Splash, menus and room UI. Race authority lives in race/session and the server. */
export function bindAppFlow({ game, profiles, lobby, lobbyUI, controls, preview, hud, roomClientFactory = createRoomClient }) {
  const events = new AbortController(), options = { signal: events.signal };
  const $ = selector => document.querySelector(selector);
  const screen = $('#app-screen');
  let client = null, connecting = null, room = null, onlineWanted = false, onlineProfileId = null;
  let roomList = [], disposed = false, splashTimer;

  function show(name) {
    document.body.dataset.appScreen = name;
    screen.hidden = name === 'race';
    document.querySelectorAll('[data-app-view]').forEach(view => { view.hidden = view.dataset.appView !== name; });
    hud.close(false);
    if (name !== 'race') {
      const heading = document.querySelector(`[data-app-view="${name}"] h1, [data-app-view="${name}"] .menu-logo`);
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }
  function message(selector, text) { $(selector).textContent = text; }
  function activeProfile() { return profiles.getProfile(profiles.getData().activeProfileId); }
  function saveIdentity(name = $('#menu-name').value, changes = {}) {
    const previous = activeProfile();
    const profile = profiles.saveProfile({ name, color: previous?.color || '#fb673e', style: previous?.style || 'balanced', ...changes }, previous?.id);
    $('#menu-name').value = profile.name;
    $('#room-driver-name').value = profile.name;
    lobbyUI.loadProfile(profile);
    preview.setPaint(profile.color);
    if (lobby.has(profile.id)) lobby.join(profile);
    return profile;
  }
  async function act(button, errorTarget, action) {
    if (button.disabled) return;
    button.disabled = true; message(errorTarget, '');
    try { await action(); } catch (error) { message(errorTarget, error.message); }
    finally { if (!disposed) { button.disabled = false; if (room) renderRoom(); } }
  }
  function renderRooms() {
    const isOffline = client ? !client.connected : false;
    $('#rooms-empty').hidden = roomList.length > 0 || isOffline;
    $('#room-list').replaceChildren(...roomList.map(item => {
      const li = document.createElement('li'), title = document.createElement('strong');
      title.textContent = `${item.name} · ${item.code}`;
      const status = document.createElement('span'); status.textContent = `${item.count}/${item.limit} · ${item.status}`;
      const join = document.createElement('button'); join.type = 'button'; join.className = 'secondary-button'; join.textContent = 'Join';
      join.disabled = item.status !== 'lobby' || item.count >= item.limit || !client?.connected;
      join.addEventListener('click', () => act(join, '#room-browser-error', () => joinRoom(item.code)), options);
      li.append(title, status, join); return li;
    }));
  }
  function renderRoom() {
    if (!room) return;
    const master = room.hostId === client?.id;
    $('#room-code').textContent = room.code;
    $('#room-limit').value = String(room.limit);
    $('#room-limit').disabled = !master || !client?.connected || room.status !== 'lobby';
    $('#room-role').textContent = master ? 'You are the Room Master. Invite friends, add AI, then start the race.' : 'Waiting for the Room Master to start. Your car will drive itself.';
    $('#add-room-ai').disabled = !master || !client?.connected || room.players.length >= room.limit || room.status !== 'lobby';
    $('#start-room-race').disabled = !master || !client?.connected || room.players.length < 2 || room.status !== 'lobby';
    $('#room-players').replaceChildren(...room.players.map(player => {
      const li = document.createElement('li'), name = document.createElement('strong'), status = document.createElement('span');
      name.textContent = player.name; name.style.borderLeft = `4px solid ${player.color}`; name.style.paddingLeft = '9px';
      status.textContent = player.isBot ? 'AI' : !player.connected ? 'Reconnecting…' : player.id === room.hostId ? 'MASTER' : 'PLAYER';
      li.append(name, status);
      if (player.isBot && master) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary-button'; remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${player.name}`);
        remove.disabled = !client?.connected || room.status !== 'lobby';
        remove.addEventListener('click', () => act(remove, '#room-error', () => client.request('room:remove-ai', { id: player.id })), options);
        li.append(remove);
      }
      return li;
    }));
  }
  function receiveRoom(next) {
    if (!onlineWanted) return;
    room = next;
    game.setRoom(room, room.hostId === client?.id, Boolean(client?.connected), event => client.request(event), client?.id);
    renderRoom();
    if (room.status === 'lobby') show('room');
    else if (room.race) { game.beginRemote(room.race); controls.setWorld('track'); show('race'); }
  }
  async function ensureClient() {
    if (client) { client.retry(); return client; }
    if (connecting) return connecting;
    connecting = roomClientFactory({
      session(session) {
        if (room && !room.players.some(player => player.id === session.id)) {
          room = null; game.solo(lobby.getEntries()); show('friends');
          message('#room-browser-error', 'Your reserved seat expired. Create or join a room again.');
        }
        if (room) receiveRoom(room);
      },
      connection(connected, text) {
        message('#connection-status', text);
        const isOffline = !connected;
        $('#connection-status').dataset.offline = String(isOffline);
        const banner = $('#network-banner'); banner.hidden = connected || !onlineWanted || !room;
        banner.textContent = text; game.setConnection(connected);
        if (isOffline) {
          message('#room-browser-error', text);
        } else if ($('#room-browser-error').textContent.includes('offline') || $('#room-browser-error').textContent.includes('terjangkau')) {
          message('#room-browser-error', '');
        }
        if (room) { game.setRoom(room, room.hostId === client?.id, connected, event => client.request(event), client?.id); renderRoom(); }
        renderRooms();
      },
      rooms(items) { roomList = items; renderRooms(); },
      room: receiveRoom,
      begin(descriptor) { if (onlineWanted) { game.beginRemote(descriptor); controls.setWorld('track'); show('race'); } },
      frame(frame) { if (onlineWanted) game.acceptFrame(frame); },
    }).then(value => {
      if (disposed || !onlineWanted) { value.dispose(); return value; }
      client = value; return client;
    }).finally(() => { connecting = null; });
    return connecting;
  }
  async function joinRoom(code) {
    const profile = saveIdentity($('#room-driver-name').value);
    onlineProfileId = profile.id;
    const connection = await ensureClient();
    const result = await connection.request('room:join', { code, profile });
    receiveRoom(result.room);
  }
  async function leaveToMenu() {
    onlineWanted = false;
    const previousClient = client;
    if (room && previousClient?.connected) {
      try { await previousClient.request('room:leave'); } catch { /* Server expires an abandoned seat after disconnect. */ }
    }
    if (previousClient) { previousClient.dispose(); client = null; }
    room = null; onlineProfileId = null;
    $('#network-banner').hidden = true;
    game.solo(lobby.getEntries()); controls.setWorld('track'); show('menu');
    if ($('#race-results').open) $('#race-results').close();
  }

  $('#menu-name').value = activeProfile()?.name || 'The Rookie';
  $('#menu-customize').addEventListener('click', () => act($('#menu-customize'), '#menu-message', () => {
    const profile = saveIdentity(); $('#menu-color').value = profile.color;
    document.querySelectorAll('[name="menu-style"]').forEach(input => { input.checked = input.value === profile.style; });
    controls.setWorld('garage'); show('customize');
  }), options);
  $('#menu-color').addEventListener('input', () => preview.setPaint($('#menu-color').value), options);
  $('#customize-form').addEventListener('submit', event => {
    event.preventDefault();
    act($('#customize-form button[type="submit"]'), '#customize-message', () => {
      saveIdentity($('#menu-name').value, { color: $('#menu-color').value, style: document.querySelector('[name="menu-style"]:checked').value });
      controls.setWorld('track'); show('menu'); message('#menu-message', 'Car saved. Ready to make some questionable decisions.');
    });
  }, options);
  $('#menu-solo').addEventListener('click', () => act($('#menu-solo'), '#menu-message', async () => {
    const profile = saveIdentity();
    if (room) await leaveToMenu();
    onlineWanted = false; lobby.clear(); lobby.join(profile); game.solo(lobby.getEntries());
    controls.setWorld('track'); show('race'); game.start(lobby.getEntries());
  }), options);
  $('#menu-friends').addEventListener('click', () => act($('#menu-friends'), '#menu-message', async () => {
    const profile = saveIdentity(); onlineProfileId = profile.id; onlineWanted = true;
    $('#room-driver-name').value = profile.name; controls.setWorld('track'); show('friends');
    try { await ensureClient(); }
    catch (error) {
      const offlineMsg = error.message || 'Service multiplayer lagi offline (server tidak terjangkau). Pastikan backend server aktif.';
      message('#connection-status', offlineMsg);
      $('#connection-status').dataset.offline = 'true';
      message('#room-browser-error', offlineMsg);
    }
  }), options);
  document.querySelectorAll('[data-back-menu]').forEach(button => button.addEventListener('click', () => leaveToMenu(), options));
  $('#menu-return').addEventListener('click', () => {
    const isRacing = game.state === 'racing' || game.state === 'countdown' || game.state === 'paused';
    if (isRacing) {
      const wasRacing = game.state === 'racing';
      if (wasRacing) game.pause();
      if (typeof window.confirm === 'function') {
        const confirmed = window.confirm('Balapan sedang berlangsung! Jika keluar ke menu, balapan akan dihentikan.\n\nApakah Anda yakin ingin keluar?');
        if (!confirmed) {
          if (wasRacing) game.resume();
          return;
        }
      }
    }
    leaveToMenu();
  }, options);
  $('#leave-room').addEventListener('click', () => leaveToMenu(), options);
  $('#create-room').addEventListener('click', () => act($('#create-room'), '#room-browser-error', async () => {
    const profile = saveIdentity($('#room-driver-name').value); onlineProfileId = profile.id;
    const connection = await ensureClient(); const result = await connection.request('room:create', { profile, limit: Number($('#create-limit').value) }); receiveRoom(result.room);
  }), options);
  $('#join-room-form').addEventListener('submit', event => { event.preventDefault(); act($('#join-room-form button'), '#room-browser-error', () => joinRoom($('#join-code').value)); }, options);
  $('#refresh-rooms').addEventListener('click', () => act($('#refresh-rooms'), '#room-browser-error', async () => { const connection = await ensureClient(); roomList = (await connection.request('rooms:get')).rooms; renderRooms(); }), options);
  $('#add-room-ai').addEventListener('click', () => act($('#add-room-ai'), '#room-error', () => client.request('room:add-ai')), options);
  $('#start-room-race').addEventListener('click', () => act($('#start-room-race'), '#room-error', () => client.request('race:start')), options);
  $('#room-limit').addEventListener('change', async () => { try { await client.request('room:limit', {limit:Number($('#room-limit').value)}); } catch(error) { message('#room-error',error.message); renderRoom(); } }, options);
  $('#copy-room-code').addEventListener('click', () => act($('#copy-room-code'), '#room-error', async () => {
    try { await navigator.clipboard.writeText(room.code); message('#room-error','Room code copied.'); }
    catch { message('#room-error',`Share this room code: ${room.code}`); }
  }), options);
  const unsubscribe = profiles.subscribe(() => { const profile = activeProfile(); if (profile) $('#menu-name').value = profile.name; });
  return {
    ready() { splashTimer = setTimeout(() => { if (!disposed) show('menu'); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 1100); },
    recordResults(id, rows) {
      if (!onlineProfileId || !client?.id) return;
      // Only this browser's participating profile receives a local score. Other
      // people's IDs cannot accidentally match an unrelated saved local driver.
      profiles.recordRace(`online-${id}`, rows.map(row => ({ ...row, id: row.id === client.id ? onlineProfileId : `remote-${row.id}` })));
    },
    dispose() { disposed = true; clearTimeout(splashTimer); events.abort(); unsubscribe(); client?.dispose(); },
  };
}
