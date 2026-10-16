/** Durable local score table. AI racers never enter this device's player records. */
export function bindLeaderboard(store) {
  const list = document.querySelector('#leaderboard-list');
  const empty = document.querySelector('#leaderboard-empty');
  function render() {
    const profiles = store.getData().profiles.sort((a, b) => b.wins - a.wins || (b.races ? b.wins / b.races : 0) - (a.races ? a.wins / a.races : 0) || a.name.localeCompare(b.name));
    empty.hidden = profiles.length > 0;
    list.replaceChildren(...profiles.map((profile, index) => {
      const row = document.createElement('li');
      row.className = 'score-row';
      const rank = document.createElement('span');
      rank.className = 'score-rank'; rank.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'score-name'; name.textContent = profile.name;
      const paint = document.createElement('i');
      paint.style.background = profile.color; paint.setAttribute('aria-hidden', 'true');
      name.prepend(paint);
      const wins = document.createElement('strong'); wins.textContent = String(profile.wins); wins.setAttribute('aria-label', `${profile.wins} ${profile.wins === 1 ? 'win' : 'wins'}`);
      const races = document.createElement('span'); races.textContent = String(profile.races); races.setAttribute('aria-label', `${profile.races} ${profile.races === 1 ? 'race' : 'races'}`);
      row.append(rank, name, wins, races);
      return row;
    }));
  }
  const unsubscribe = store.subscribe(render);
  render();
  return { dispose: unsubscribe };
}
