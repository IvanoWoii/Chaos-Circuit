import { GAME_CONFIG } from '../config.js';

export function formatRaceTime(seconds) {
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

/** Race HUD, live standings and an accessible results dialog. No scoring in the UI. */
export function bindRaceUI(race, profiles, getEntries, onStateChange, onStart) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const play = document.querySelector('#simulation-toggle');
  const reset = document.querySelector('#simulation-reset');
  const stateLabel = document.querySelector('#simulation-state');
  const eventLabel = document.querySelector('#chaos-event');
  const countdownOverlay = document.querySelector('#race-countdown');
  const countdownValue = document.querySelector('#countdown-value');
  const countdownCaption = document.querySelector('#countdown-caption');
  const standingsList = document.querySelector('#standings-list');
  const dialog = document.querySelector('#race-results');
  const setText = (selector, text) => { const node = document.querySelector(selector); if (node.textContent !== text) node.textContent = text; };
  let lastUpdate = -Infinity, lastAnnouncement = -Infinity, lastResultsId = null;

  function showResults(snapshot) {
    if (!snapshot.results) return;
    if (lastResultsId !== snapshot.raceId) {
      lastResultsId = snapshot.raceId;
      const finishers = snapshot.results.filter((row) => row.finished);
      setText('#results-title', finishers.length ? `${finishers[0].name} takes the flag!` : 'Chaos won this round.');
      setText('#results-subtitle', `${finishers.length} finished · ${snapshot.results.length - finishers.length} DNF · ${snapshot.bumps} bumps · ${snapshot.recoveries} recoveries`);
      document.querySelector('#podium-list').replaceChildren(...Array.from({ length: 3 }, (_, index) => {
        const row = finishers[index];
        const card = document.createElement('li');
        card.className = 'podium-card'; card.dataset.place = String(index + 1);
        const place = document.createElement('span'); place.className = 'podium-place'; place.textContent = ['1st', '2nd', '3rd'][index];
        const name = document.createElement('strong'); name.textContent = row?.name || 'No finisher';
        const time = document.createElement('span'); time.className = 'podium-time'; time.textContent = row ? formatRaceTime(row.finishTime) : '—';
        if (row) card.style.setProperty('--car-paint', row.color);
        card.append(place, name, time);
        return card;
      }));
      document.querySelector('#results-rows').replaceChildren(...snapshot.results.map((row) => {
        const tr = document.createElement('tr');
        const values = [row.finished ? String(row.position).padStart(2, '0') : 'DNF', row.name,
          row.isBot ? 'AI' : race.online ? 'PLAYER' : 'LOCAL', row.finished ? formatRaceTime(row.finishTime) : `${row.completedLaps}/${snapshot.laps} laps`];
        values.forEach((value) => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
        return tr;
      }));
      setText('#results-storage', profiles.status === 'saved' ? 'Local player scores saved on this device. Only the race winner earns a win.' : 'Scores updated for this visit. Browser storage is unavailable; they may not survive a refresh.');
    }
    if (!dialog.open) dialog.showModal();
  }

  function renderStandings(snapshot) {
    const rows = snapshot.standings.map((row) => {
      const li = document.createElement('li'); li.className = 'standing-row';
      const position = document.createElement('span'); position.className = 'grid-position'; position.textContent = String(row.position).padStart(2, '0');
      const paint = document.createElement('span'); paint.className = 'grid-paint'; paint.style.background = row.color; paint.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = row.name; name.title = row.name;
      const status = document.createElement('span'); status.className = 'standing-progress';
      status.textContent = row.finished ? formatRaceTime(row.finishTime) : row.status === 'dnf' ? `DNF · ${row.completedLaps}/${snapshot.laps}` : `LAP ${row.lap} / ${snapshot.laps}`;
      li.dataset.status = row.status;
      li.append(position, paint, name, status);
      return li;
    });
    standingsList.replaceChildren(...rows);
    setText('#standings-title', snapshot.state === 'results' ? 'The final classification.' : 'Every bumper for itself.');
    const finishWindow = snapshot.finishedCount > 0 && snapshot.state !== 'results' ? ` · ${Math.ceil(snapshot.remainingSeconds)}s left to finish` : '';
    setText('#standings-summary', `${snapshot.finishedCount} / ${snapshot.standings.length} finished${finishWindow}`);
    const leader = snapshot.standings.find((row) => !row.finished) || snapshot.standings[0];
    setText('#race-lap', snapshot.state === 'results' ? 'FLAG' : snapshot.finishedCount > 0
      ? `${snapshot.finishedCount} / ${snapshot.standings.length} FINISHED` : `LAP ${leader?.lap || 1} / ${snapshot.laps}`);
  }

  function displayState(snapshot) {
    const { state } = snapshot;
    play.disabled = race.canControl === false && state !== 'results';
    play.textContent = state === 'lobby' ? 'START RACE ↗' : state === 'paused' ? 'Resume race ↗' : state === 'results' ? 'View results ↗' : 'Pause race Ⅱ';
    reset.disabled = state === 'lobby' || race.canControl === false;
    document.querySelector('#results-reset').disabled = race.canControl === false;
    document.querySelector('#results-reset').textContent = race.canControl === false ? 'Waiting for the Room Master' : 'Reset Race — Back to lobby ↗';
    reset.textContent = 'Reset Race';
    stateLabel.textContent = { lobby: 'GRID OPEN', countdown: 'GET READY', racing: 'RACE LIVE', paused: 'RACE PAUSED', results: 'CHECKERED FLAG' }[state];
    stateLabel.dataset.state = state;
    document.body.dataset.raceState = state;
    document.querySelector('#lobby-grid-card').hidden = state !== 'lobby';
    document.querySelector('#standings-card').hidden = state === 'lobby';
    eventLabel.textContent = state === 'lobby' ? 'Open Driver to join, or start with eight AI racers.' : snapshot.latestEvent;
    if (state === 'results') showResults(snapshot);
    else if (dialog.open) dialog.close();
    lastUpdate = -Infinity;
    onStateChange(state);
  }
  play.addEventListener('click', () => {
    try {
      if (race.state === 'lobby') { onStart(); race.start(getEntries()); }
      else if (race.state === 'results') showResults(race.getSnapshot());
      else if (race.state === 'paused') race.resume();
      else race.pause();
    } catch (error) { eventLabel.textContent = `Could not start the race: ${error.message}`; }
  }, options);
  reset.addEventListener('click', () => race.reset(), options);
  document.querySelector('#results-reset').addEventListener('click', () => race.reset(), options);
  const unsubscribe = race.subscribe(displayState);
  displayState(race.getSnapshot());

  return {
    update(time) {
      const snapshot = race.getSnapshot();
      const counting = snapshot.state === 'countdown';
      const go = snapshot.state === 'racing' && snapshot.elapsed < 0.7;
      const paused = snapshot.state === 'paused';
      countdownOverlay.hidden = !counting && !go && !paused;
      const value = paused ? 'Ⅱ' : counting ? String(snapshot.countdown) : 'GO!';
      if (countdownValue.textContent !== value) countdownValue.textContent = value;
      const caption = paused ? 'RACE PAUSED' : counting ? 'HANDS OFF THE WHEEL' : 'LET THE CHAOS BEGIN';
      if (countdownCaption.textContent !== caption) countdownCaption.textContent = caption;
      countdownOverlay.dataset.go = String(go);
      if (time - lastUpdate < 250) return;
      lastUpdate = time;
      setText('#simulation-time', formatRaceTime(snapshot.elapsed).slice(0, 5));
      setText('#simulation-bumps', String(snapshot.bumps).padStart(2, '0'));
      setText('#simulation-rescues', String(snapshot.recoveries).padStart(2, '0'));
      setText('#simulation-speed', `${Math.round(snapshot.fastest)} m/s`);
      if (snapshot.standings.length) renderStandings(snapshot);
      else setText('#race-lap', `LAP 1 / ${GAME_CONFIG.laps}`);
      if (snapshot.state !== 'lobby' && time - lastAnnouncement > 2500 && eventLabel.textContent !== snapshot.latestEvent) {
        eventLabel.textContent = snapshot.latestEvent; lastAnnouncement = time;
      }
    },
    dispose() { events.abort(); unsubscribe(); if (dialog.open) dialog.close(); },
  };
}
