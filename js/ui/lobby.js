import { GAME_CONFIG, PAINTS, RACING_STYLES } from '../config.js';
import { cleanName, defaultPreferences } from '../data/profiles.js';

/** DOM adapter for the profile store and session grid. User text uses textContent. */
export function bindLobbyUI(store, lobby, preview) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const form = document.querySelector('#driver-form');
  const savedDriver = document.querySelector('#saved-driver');
  const nameInput = document.querySelector('#driver-name');
  const customColor = document.querySelector('#custom-color');
  const paintName = document.querySelector('#paint-name');
  const swatches = [...document.querySelectorAll('[data-color]')];
  const styleInputs = [...document.querySelectorAll('[name="racing-style"]')];
  const joinButton = document.querySelector('#join-button');
  const clearButton = document.querySelector('#clear-grid');
  const message = document.querySelector('#lobby-message');
  const storageStatus = document.querySelector('#storage-status');
  const gridList = document.querySelector('#grid-list');
  let activeId = store.getData().activeProfileId;
  let draft = defaultPreferences();
  let locked = false;
  let draftDirty = false;

  document.querySelector('#driver-fields').disabled = false;
  document.querySelector('#paint-picker').disabled = false;

  function say(text, kind = 'info') {
    message.textContent = text;
    message.dataset.kind = kind;
  }
  function showStorageStatus(dirty = draftDirty) {
    draftDirty = dirty;
    const status = store.status;
    storageStatus.dataset.kind = status === 'saved' ? 'info' : 'warning';
    storageStatus.textContent = status === 'unavailable'
      ? 'Browser storage is unavailable. Drivers work for this visit but won’t survive a refresh.'
      : status === 'recovered'
        ? 'Some saved data could not be read. Save a driver to start fresh.'
        : dirty ? 'Unsaved changes — save or join to keep them.' : activeId ? 'Driver saved on this device.' : 'Preferences save when you save or join.';
  }
  function refreshSavedOptions() {
    const newOption = document.createElement('option');
    newOption.value = '';
    newOption.textContent = '+ New driver';
    const choices = store.getData().profiles.map((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      return option;
    });
    savedDriver.replaceChildren(newOption, ...choices);
    savedDriver.value = activeId || '';
  }
  function updateJoinLabel() {
    joinButton.textContent = lobby.has(activeId) ? 'Update car ↗' : 'Join Race ↗';
  }
  function applyPaint() {
    preview.setPaint(draft.color);
    customColor.value = draft.color;
    document.querySelector('#car-color-dot').style.background = draft.color;
    paintName.textContent = PAINTS.find((paint) => paint.color === draft.color)?.name || 'Custom paint';
    swatches.forEach((swatch) => swatch.setAttribute('aria-pressed', String(swatch.dataset.color === draft.color)));
  }
  function applyDraft(profile) {
    draft = profile ? { name: profile.name, color: profile.color, style: profile.style } : defaultPreferences();
    nameInput.value = draft.name;
    nameInput.setCustomValidity('');
    styleInputs.forEach((input) => { input.checked = input.value === draft.style; });
    document.querySelector('#driver-preview-name').textContent = draft.name || 'The Rookie';
    document.querySelector('#driver-preview-description').textContent = RACING_STYLES[draft.style].description;
    const wins = profile?.wins || 0;
    document.querySelector('#profile-wins').textContent = `${wins} ${wins === 1 ? 'WIN' : 'WINS'}`;
    applyPaint();
    updateJoinLabel();
    showStorageStatus(false);
  }

  function renderGrid(entries) {
    const rows = entries.map((entry, index) => {
      const row = document.createElement('li');
      row.className = 'grid-entry';
      row.dataset.local = String(!entry.isBot);
      const position = document.createElement('span');
      position.className = 'grid-position';
      position.textContent = String(index + 1).padStart(2, '0');
      const paint = document.createElement('span');
      paint.className = 'grid-paint';
      paint.style.background = entry.color;
      paint.setAttribute('aria-hidden', 'true');
      const driver = document.createElement('div');
      driver.className = 'grid-driver';
      const name = document.createElement('strong');
      name.textContent = entry.name;
      name.title = entry.name;
      const style = document.createElement('small');
      style.textContent = RACING_STYLES[entry.style].label;
      driver.append(name, style);
      const tag = document.createElement('span');
      tag.className = 'grid-tag';
      tag.textContent = entry.isBot ? 'AI' : 'LOCAL';
      row.append(position, paint, driver, tag);
      if (!entry.isBot) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-driver';
        remove.textContent = '×';
        remove.dataset.remove = entry.id;
        remove.setAttribute('aria-label', `Remove ${entry.name} from this race`);
        remove.disabled = locked;
        row.append(remove);
      }
      return row;
    });
    gridList.replaceChildren(...rows);
    const players = lobby.playerCount;
    document.querySelector('#grid-summary').textContent = `${players} local ${players === 1 ? 'driver' : 'drivers'} · ${GAME_CONFIG.maxRacers - players} AI opponents`;
    clearButton.disabled = locked || players === 0;
    updateJoinLabel();
  }

  function saveDriver(join) {
    if (locked) return;
    if (!cleanName(nameInput.value)) {
      nameInput.setCustomValidity('Give your driver a name first.');
      nameInput.reportValidity();
      return;
    }
    if (!form.reportValidity()) return;
    try {
      if (join) lobby.assertCanJoin(activeId);
      draft.name = nameInput.value;
      const profile = store.saveProfile(draft, activeId);
      activeId = profile.id;
      // A saved edit updates an already-joined car, preserving its grid position.
      if (join || lobby.has(profile.id)) lobby.join(profile);
      refreshSavedOptions();
      applyDraft(profile);
      say(join ? `${profile.name} is on the grid. Select “+ New driver” to add someone else.` : `${profile.name} saved${lobby.has(profile.id) ? ' and their grid car updated' : ''}.`);
    } catch (error) {
      say(error.message, 'error');
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); saveDriver(true); }, options);
  document.querySelector('#save-driver').addEventListener('click', () => saveDriver(false), options);
  savedDriver.addEventListener('change', () => {
    activeId = savedDriver.value || null;
    store.setActive(activeId);
    applyDraft(store.getProfile(activeId));
    say(activeId ? 'Driver loaded. Update their preferences or join the grid.' : 'A fresh driver. A fresh set of bad decisions.');
  }, options);
  nameInput.addEventListener('input', () => {
    nameInput.setCustomValidity('');
    draft.name = nameInput.value;
    document.querySelector('#driver-preview-name').textContent = cleanName(draft.name) || 'The Rookie';
    showStorageStatus(true);
  }, options);
  function changePaint(color) {
    draft.color = color.toLowerCase();
    applyPaint();
    document.querySelector('#paint-announcement').textContent = `Car paint changed to ${paintName.textContent}.`;
    showStorageStatus(true);
  }
  swatches.forEach((button) => button.addEventListener('click', () => changePaint(button.dataset.color), options));
  customColor.addEventListener('input', () => changePaint(customColor.value), options);
  styleInputs.forEach((input) => input.addEventListener('change', () => {
    if (!input.checked) return;
    draft.style = input.value;
    document.querySelector('#driver-preview-description').textContent = RACING_STYLES[draft.style].description;
    showStorageStatus(true);
  }, options));
  gridList.addEventListener('click', (event) => {
    if (locked) return;
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    const name = store.getProfile(button.dataset.remove)?.name || 'Driver';
    lobby.remove(button.dataset.remove);
    say(`${name} removed from this race. Their saved profile is still available.`);
  }, options);
  clearButton.addEventListener('click', () => {
    if (locked) return;
    lobby.clear();
    say('Local drivers removed from the grid. Saved profiles are still available.');
  }, options);

  const unsubscribeLobby = lobby.subscribe(renderGrid);
  const unsubscribeStore = store.subscribe(() => {
    showStorageStatus();
    const wins = store.getProfile(activeId)?.wins || 0;
    document.querySelector('#profile-wins').textContent = `${wins} ${wins === 1 ? 'WIN' : 'WINS'}`;
  });
  refreshSavedOptions();
  applyDraft(store.getProfile(activeId));
  renderGrid(lobby.getEntries());
  return {
    loadProfile(profile) { activeId=profile?.id||null;refreshSavedOptions();applyDraft(profile); },
    setLocked(value, reason = 'The grid is locked. Reset Race to edit drivers.') {
      locked = value;
      document.querySelector('#driver-fields').disabled = locked;
      document.querySelector('#lobby-lock-note').hidden = !locked;
      document.querySelector('#lobby-lock-note').textContent = reason;
      clearButton.disabled = locked || lobby.playerCount === 0;
      gridList.querySelectorAll('[data-remove]').forEach((button) => { button.disabled = locked; });
    },
    dispose() { events.abort(); unsubscribeLobby(); unsubscribeStore(); },
  };
}
