/** Shared defaults. Later race modules should consume these rather than duplicate them. */
export const GAME_CONFIG = Object.freeze({
  maxRacers: 8,
  laps: 3,
  defaultPaint: '#fb673e',
  maxPixelRatio: 2,
  backgroundColor: '#e7eddf',
  camera: Object.freeze({
    viewSize: 17,
    target: [0, 0.8, 0],
    isometric: [13, 12, 17],
    overhead: [0, 24, 0.01],
  }),
  trackCamera: Object.freeze({
    viewSize: 56,
    minHalfWidth: 39,
    target: [0, 0, 0],
    isometric: [34, 42, 52],
    overhead: [0, 65, 0.01],
  }),
  physics: Object.freeze({ fixedTimeStep: 1 / 60, maxSubSteps: 6, maxFrameDelta: 0.1 }),
  race: Object.freeze({ countdownSeconds: 3, checkpoints: 24, maxSeconds: 180, finishGraceSeconds: 40 }),
});

export const RACING_STYLES = Object.freeze({
  balanced: Object.freeze({ label: 'All-rounder', description: 'A little speed. A little muscle.', maxSpeed: 18, mass: 150 }),
  speedster: Object.freeze({ label: 'Speedster', description: 'Fast, light, easily launched.', maxSpeed: 23, mass: 90 }),
  bruiser: Object.freeze({ label: 'Bruiser', description: 'Less hurry. More bumper.', maxSpeed: 14, mass: 240 }),
});

export const PAINTS = Object.freeze([
  Object.freeze({ color: '#fb673e', name: 'Tangerine' }),
  Object.freeze({ color: '#f5ca53', name: 'Sunshine' }),
  Object.freeze({ color: '#66b797', name: 'Mint condition' }),
  Object.freeze({ color: '#648ed8', name: 'Blue streak' }),
  Object.freeze({ color: '#b092ca', name: 'Lilac lightning' }),
  Object.freeze({ color: '#e9e8dc', name: 'Vanilla chaos' }),
]);
