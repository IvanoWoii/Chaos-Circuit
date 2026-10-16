/** Camera and world-switching controls; player preferences live in lobby.js. */
export function bindControls(rig, onWorldChange) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const rotateButton = document.querySelector('#rotate-button');
  const directorButton = document.querySelector('#director-button');
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  const worldButtons = [...document.querySelectorAll('[data-world]')];

  [...viewButtons, ...worldButtons, rotateButton, directorButton].forEach((button) => { button.disabled = false; });
  function setDirector(enabled) {
    rig.setDirector(enabled);
    directorButton.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      rotateButton.setAttribute('aria-pressed', 'false');
      rotateButton.setAttribute('aria-label', 'Rotate preview automatically');
    }
  }
  setDirector(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  directorButton.addEventListener('click', () => setDirector(!rig.directorEnabled), options);

  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      rig.setView(button.dataset.view);
      viewButtons.forEach((view) => view.setAttribute('aria-pressed', String(view === button)));
    }, options);
  });

  function setWorld(mode) {
    rig.setMode(mode);
    onWorldChange(mode);
    worldButtons.forEach((world) => world.setAttribute('aria-pressed', String(world.dataset.world === mode)));
    viewButtons.forEach((view) => view.setAttribute('aria-pressed', String(view.dataset.view === 'isometric')));
    rotateButton.setAttribute('aria-pressed', 'false');
    rotateButton.setAttribute('aria-label', 'Rotate preview automatically');
  }
  worldButtons.forEach((button) => button.addEventListener('click', () => setWorld(button.dataset.world), options));

  const clearPreset = () => viewButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
  rotateButton.addEventListener('click', () => {
    setDirector(false);
    rig.controls.autoRotate = !rig.controls.autoRotate;
    rotateButton.setAttribute('aria-pressed', String(rig.controls.autoRotate));
    rotateButton.setAttribute('aria-label', rig.controls.autoRotate ? 'Stop automatic rotation' : 'Rotate preview automatically');
    if (rig.controls.autoRotate) clearPreset();
  }, options);

  // A user-controlled orbit no longer matches one of the exact preset positions.
  const onManualOrbit = () => { clearPreset(); setDirector(false); };
  rig.controls.addEventListener('start', onManualOrbit);
  return {
    setWorld,
    dispose() { events.abort(); rig.controls.removeEventListener('start', onManualOrbit); },
  };
}
