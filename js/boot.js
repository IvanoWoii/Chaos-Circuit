/* Keep startup independent of Three.js so CDN / WebGL failures remain readable. */
(() => {
  const errorPanel = document.querySelector('#scene-error');
  const detail = document.querySelector('#error-detail');
  const loading = document.querySelector('#loading');

  function showError(message) {
    loading.hidden = true;
    errorPanel.hidden = false;
    detail.textContent = message;
    document.querySelector('#engine-status').textContent = 'ENGINE UNAVAILABLE';
  }

  document.querySelector('#reload-button').addEventListener('click', () => location.reload());

  if (location.protocol === 'file:') {
    showError('Open this project through a local HTTP server instead of double-clicking index.html. See README.md for the one-command preview instructions.');
    return;
  }

  const slowLoad = setTimeout(() => {
    loading.querySelector('span:last-child').textContent = 'Still loading… check your connection. The 3D libraries are loaded from a CDN.';
  }, 12000);

  import('./main.js')
    .then(({ startGame }) => startGame())
    .catch((error) => {
      console.error('Garage startup failed:', error);
      showError(error.message.startsWith('WebGL')
        ? error.message
        : 'The 3D scene could not load. Check your internet connection, allow cdn.jsdelivr.net, and use a browser with WebGL 2 enabled.');
    })
    .finally(() => clearTimeout(slowLoad));
})();
