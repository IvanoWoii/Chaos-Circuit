/** Non-modal panels: one open at a time, with the race and its controls always live. */
export function bindHUD() {
  const events = new AbortController();
  const options = { signal: events.signal };
  const toggles = [...document.querySelectorAll('[data-hud-toggle]')];
  const panels = [...document.querySelectorAll('[data-hud-panel]')];
  let active = null;

  function close(restoreFocus = true) {
    const previous = active;
    const focusedInside = panels.some((panel) => !panel.hidden && panel.contains(document.activeElement));
    active = null;
    panels.forEach((panel) => { panel.hidden = true; });
    toggles.forEach((button) => button.setAttribute('aria-expanded', 'false'));
    if (restoreFocus || focusedInside) toggles.find((button) => button.dataset.hudToggle === previous)?.focus({ preventScroll: true });
  }
  function open(name) {
    if (!panels.some((panel) => panel.dataset.hudPanel === name)) return;
    close(false);
    active = name;
    const panel = panels.find((item) => item.dataset.hudPanel === name);
    panel.hidden = false;
    toggles.forEach((button) => button.setAttribute('aria-expanded', String(button.dataset.hudToggle === name)));
    panel.querySelector('[data-hud-close]').focus({ preventScroll: true });
  }
  toggles.forEach((button) => button.addEventListener('click', () => {
    if (active === button.dataset.hudToggle) close();
    else open(button.dataset.hudToggle);
  }, options));
  panels.forEach((panel) => panel.querySelector('[data-hud-close]').addEventListener('click', () => close(), options));
  document.querySelector('#driver-skip').addEventListener('click', (event) => { event.preventDefault(); open('driver'); }, options);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active && !document.querySelector('#race-results').open) {
      event.preventDefault(); close();
    }
  }, options);
  return {
    open, close,
    onRaceState(state) { if (state === 'countdown' || state === 'results') close(false); },
    dispose() { close(false); events.abort(); },
  };
}
