import { readFile } from 'node:fs/promises';
import { SourceTextModule } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

let enginePromise;
/** Load real, pinned browser modules in memory for engine tests without a browser. */
export function loadEngineHarness() {
  return enginePromise ||= buildEngineHarness();
}
async function buildEngineHarness() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const cache = new Map();
  async function load(identifier) {
    if (cache.has(identifier)) return cache.get(identifier);
    const task = (async () => {
      let source;
      if (identifier.startsWith('https:')) {
        const response = await fetch(identifier);
        if (!response.ok) throw new Error(`Dependency request failed: ${response.status}`);
        source = await response.text();
      } else source = await readFile(fileURLToPath(identifier), 'utf8');
      return new SourceTextModule(source, { identifier });
    })();
    cache.set(identifier, task);
    return task;
  }
  const harness = new SourceTextModule(`
    export { createPhysics } from './js/core/physics.js';
    export { createTrack } from './js/world/track.js';
    export { createStartingGrid } from './js/world/grid.js';
    export { createSimulation } from './js/race/simulation.js';
    export { createCar } from './js/race/car.js';
    export { createDriverAI } from './js/race/ai.js';
    export { createRaceController } from './js/race/controller.js';
    export { createCameraRig } from './js/core/camera.js';
    export { createCarLabels, layoutCarLabels } from './js/ui/car-labels.js';
    export * as CANNON from 'cannon-es';
    export * as THREE from 'three';
  `, { identifier: pathToFileURL(resolve(root, 'engine-test.mjs')).href });
  await harness.link((specifier, parent) => {
    const prefix = Object.keys(imports).find((key) => key.endsWith('/') && specifier.startsWith(key));
    return load(imports[specifier] || (prefix ? imports[prefix] + specifier.slice(prefix.length) : new URL(specifier, parent.identifier).href));
  });
  await harness.evaluate();
  return harness.namespace;
}
