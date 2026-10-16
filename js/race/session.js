import { createRaceWorld } from './world.js';
import { chooseMap, describeMap } from '../world/maps.js';

/** Stable UI facade while maps, local simulations and network races are replaced. */
export function createRaceSession(scene,profiles,entries,{onMap=()=>{},onRemoteResults=()=>{}}={}) {
  const listeners=new Set();let world,unsubscribe,roster=entries,remote=false,host=false,connected=true;
  let descriptor=null,remoteState=null,frames=[],lastSequence=-1,command=()=>{},previousMap=null,recorded=null;
  function notify(){const snapshot=api.getSnapshot();listeners.forEach(listener=>listener(snapshot));}
  function replace(map){unsubscribe?.();world?.dispose();world=createRaceWorld(map,profiles,scene);world.grid.update(roster);previousMap=map.id;unsubscribe=world.race.subscribe(()=>{world.grid.group.visible=world.race.state==='lobby';notify();});onMap(map);}
  function issue(event){Promise.resolve(command(event)).catch(error=>{document.querySelector('#chaos-event').textContent=error.message;});}
  const api={
    get world(){return world;},get online(){return remote;},get canControl(){return !remote||(host&&connected);},
    get state(){return remote?remoteState?.state||'lobby':world.race.state;},
    getSnapshot(){return remoteState||world.race.getSnapshot();},
    getFocusCar(){const rows=api.getSnapshot().standings;const leader=rows.find(r=>!r.finished)||rows[0];return world.simulation.cars.find(car=>car.entry.id===leader?.id)||null;},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    setRoster(next){roster=next;if(api.state==='lobby')world.grid.update(roster);},
    start(entries,seed=Math.floor(Math.random()*0x100000000)){
      if(remote){if(api.canControl)issue('race:start');return;}
      if(api.state!=='lobby')return;roster=entries;replace(chooseMap(seed,previousMap));world.race.start(roster,seed);
    },
    pause(){if(remote){if(api.canControl)issue('race:pause');}else world.race.pause();},
    resume(){if(remote){if(api.canControl)issue('race:resume');}else world.race.resume();},
    reset(){if(remote){if(api.canControl)issue('race:reset');}else world.race.reset();},
    solo(entries){remote=false;remoteState=null;descriptor=null;frames=[];roster=entries;world.race.reset();world.grid.update(roster);notify();},
    setRoom(room,isHost,isConnected,send){remote=true;host=isHost;connected=isConnected;command=send;
      if(room.status==='lobby'){
        const wasRace=Boolean(descriptor);descriptor=null;remoteState=null;frames=[];roster=room.players;
        if(wasRace)replace(world.map);else {world.race.reset();world.simulation.reset();world.grid.update(roster);world.grid.group.visible=true;}
      }
      notify();
    },
    setConnection(value){connected=value;if(remote)notify();},
    beginRemote(next){
      if(descriptor?.id===next.id)return;
      remote=true;descriptor=next;roster=next.entries;frames=[];lastSequence=-1;recorded=null;
      remoteState=null;replace(next.map);world.simulation.start(roster,next.seed);world.simulation.pause();world.grid.group.visible=false;
      remoteState={...world.race.getSnapshot(),state:'countdown',raceId:next.id};notify();
    },
    acceptFrame(frame){
      if(!remote||!descriptor||frame.raceId!==descriptor.id||frame.sequence<=lastSequence)return;
      lastSequence=frame.sequence;const oldState=remoteState?.state;remoteState=frame.state;
      frames.push({...frame,received:performance.now()});if(frames.length>12)frames.shift();
      if(remoteState.results&&recorded!==frame.raceId){recorded=frame.raceId;onRemoteResults(frame.raceId,remoteState.results);}
      if(oldState!==remoteState.state)notify();
    },
    update(delta){
      if(!remote){world.race.update(delta);return;}
      if(!frames.length)return;
      const target=performance.now()-100;
      while(frames.length>2&&frames[1].received<=target)frames.shift();
      const a=frames[0],b=frames[1]||a;
      const t=a===b?1:Math.max(0,Math.min(1,(target-a.received)/Math.max(1,b.received-a.received)));
      world.simulation.renderNetwork(a.poses,b.poses,t);
    },
    dispose(){unsubscribe?.();world.dispose();listeners.clear();},
  };
  replace(describeMap('rookie',1));return api;
}
