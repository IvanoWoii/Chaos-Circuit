import * as THREE from 'three';
import { createPhysics } from '../core/physics.js';
import { createTrack } from '../world/track.js';
import { createStartingGrid } from '../world/grid.js';
import { layoutForMap } from '../world/maps.js';
import { createSimulation } from './simulation.js';
import { createRaceController } from './controller.js';

/** A complete isolated race, used by the browser and the authoritative Node server. */
export function createRaceWorld(map, profiles, parent = new THREE.Scene()) {
  const layout = layoutForMap(map);
  const physics = createPhysics();
  const track = createTrack(parent, physics, {layout,map});
  const grid = createStartingGrid(track.group,layout);
  const simulation = createSimulation(track.group,physics,{layout,map});
  const race = createRaceController(simulation,profiles,{layout});
  return {map,layout,physics,track,grid,simulation,race,
    dispose(){race.dispose();simulation.dispose();grid.dispose();track.dispose();physics.dispose();},
  };
}
