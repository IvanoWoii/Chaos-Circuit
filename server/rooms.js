import { randomBytes, randomUUID } from 'node:crypto';
import { validatePreferences } from '../js/data/profiles.js';
import { createLobby } from '../js/race/lobby.js';
import { chooseMap } from '../js/world/maps.js';
import { createRaceWorld } from '../js/race/world.js';

const noScores = {recordRace(){}};
/** In-memory rooms and session tokens. Only this process runs physics or awards finishes. */
export function createRoomService(io, { maxRooms=12, reconnectMs=30000 }={}) {
  const rooms=new Map(), sessions=new Map();
  const bots=createLobby().getEntries();
  let tick=0;
  function view(room){return {code:room.code,hostId:room.hostId,limit:room.limit,status:room.status,
    players:room.players.map(p=>({id:p.id,...p.profile,isBot:p.isBot,connected:p.isBot||Boolean(sessions.get(p.token)?.socketId)})),
    race:room.descriptor};}
  function listing(){return [...rooms.values()].map(r=>({code:r.code,name:r.players.find(p=>p.id===r.hostId)?.profile.name||'Room',count:r.players.length,limit:r.limit,status:r.status}));}
  function announce(room){io.to(room.code).emit('room:state',view(room));io.emit('rooms:list',listing());}
  function destroy(room){room.world?.dispose();rooms.delete(room.code);io.emit('rooms:list',listing());}
  function promote(room){const humans=room.players.filter(p=>!p.isBot);const online=humans.find(p=>sessions.get(p.token)?.socketId);if(!humans.some(p=>p.id===room.hostId&&sessions.get(p.token)?.socketId))room.hostId=online?.id||humans[0]?.id||null;}
  function leave(session){
    const room=rooms.get(session.roomCode); if(!room){session.roomCode=null;return;}
    if(session.socketId)io.sockets.sockets.get(session.socketId)?.leave(room.code);
    room.players=room.players.filter(p=>p.id!==session.id);session.roomCode=null;promote(room);
    if(!room.players.some(p=>!p.isBot))destroy(room);else announce(room);
  }
  function current(session){const room=rooms.get(session.roomCode);if(!room)throw Error('Join a room first.');return room;}
  function master(session){const room=current(session);if(room.hostId!==session.id)throw Error('Only the Room Master can do that.');return room;}
  function editable(room){if(room.status!=='lobby')throw Error('Wait for the Room Master to return to the lobby.');}
  function packet(room){return {code:room.code,raceId:room.descriptor.id,sequence:++room.sequence,state:room.world.race.getSnapshot(),poses:room.world.simulation.capture()};}
  io.on('connection',socket=>{
    const supplied=socket.handshake.auth?.token;
    let session=typeof supplied==='string'?sessions.get(supplied):null;
    if(!session){const token=randomBytes(24).toString('hex');session={token,id:randomUUID(),roomCode:null,socketId:null};sessions.set(token,session);}
    clearTimeout(session.expiry);
    if(session.socketId)io.sockets.sockets.get(session.socketId)?.disconnect(true);
    session.socketId=socket.id;
    socket.emit('session',{token:session.token,id:session.id});
    const existing=rooms.get(session.roomCode);
    if(existing){socket.join(existing.code);promote(existing);announce(existing);if(existing.descriptor)socket.emit('race:begin',existing.descriptor);if(existing.world)socket.emit('race:frame',packet(existing));}
    socket.emit('rooms:list',listing());
    let budget=0,windowStart=Date.now();
    function command(name,handler){socket.on(name,(input={},ack)=>{
      try{
        if(session.socketId!==socket.id)throw Error('This session was opened elsewhere.');
        if(Date.now()-windowStart>5000){budget=0;windowStart=Date.now();}
        if(++budget>30)throw Error('Too many requests. Please wait a moment.');
        if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid request.');
        const result=handler(input); if(typeof ack==='function')ack({ok:true,...result});
      }catch(error){if(typeof ack==='function')ack({ok:false,error:error.message});}
    });}
    const player=profile=>({id:session.id,token:session.token,profile:validatePreferences(profile),isBot:false});
    command('rooms:get',()=>({rooms:listing()}));
    command('room:create',input=>{
      const p=player(input.profile),limit=Number(input.limit);
      if(!Number.isInteger(limit)||limit<2||limit>8)throw Error('Choose a racer limit from 2 to 8.');
      if(rooms.size>=maxRooms)throw Error('The server is full. Try joining an existing room.');
      if(session.roomCode)throw Error('Leave your current room first.');
      let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(code));
      const room={code,hostId:session.id,limit,players:[p],status:'lobby',world:null,descriptor:null,sequence:0,lastMap:null};
      rooms.set(code,room);session.roomCode=code;socket.join(code);announce(room);return {room:view(room)};
    });
    command('room:join',input=>{
      if(session.roomCode)throw Error('Leave your current room first.');
      const code=String(input.code||'').trim().toUpperCase();const room=rooms.get(code);
      if(!room)throw Error('Room not found. Check the code.');editable(room);
      if(room.players.length>=room.limit)throw Error('This room is full.');
      const p=player(input.profile);
      if(room.players.some(other=>other.profile.name.toLowerCase()===p.profile.name.toLowerCase()))throw Error('That driver name is already in the room. Choose another.');
      room.players.push(p);session.roomCode=code;socket.join(code);promote(room);announce(room);return {room:view(room)};
    });
    command('room:leave',()=>{leave(session);return {};});
    command('room:limit',input=>{const room=master(session);editable(room);const limit=Number(input.limit);if(!Number.isInteger(limit)||limit<2||limit>8||limit<room.players.length)throw Error('The limit must fit the current roster (2–8).');room.limit=limit;announce(room);return {};});
    command('room:add-ai',()=>{const room=master(session);editable(room);if(room.players.length>=room.limit)throw Error('The room is full.');const bot=bots.find(b=>!room.players.some(p=>p.profile.name===b.name));room.players.push({id:`ai-${randomUUID()}`,profile:{name:bot.name,color:bot.color,style:bot.style},isBot:true});announce(room);return {};});
    command('room:remove-ai',input=>{const room=master(session);editable(room);room.players=room.players.filter(p=>!(p.isBot&&p.id===input.id));announce(room);return {};});
    command('race:start',()=>{
      const room=master(session);editable(room);if(room.players.length<2)throw Error('Invite a friend or add an AI racer first.');
      if(room.players.some(p=>!p.isBot&&!sessions.get(p.token)?.socketId))throw Error('A player is reconnecting. Wait for them or for their seat to expire.');
      const seed=randomBytes(4).readUInt32LE();const map=chooseMap(seed,room.lastMap);room.lastMap=map.id;
      room.world?.dispose();room.world=createRaceWorld(map,noScores);
      const entries=view(room).players.map(({connected,...entry})=>entry);
      room.world.race.start(entries,seed);room.status='racing';room.sequence=0;
      room.descriptor={id:room.world.race.getSnapshot().raceId,map,seed,entries,code:room.code};
      announce(room);io.to(room.code).emit('race:begin',room.descriptor);io.to(room.code).emit('race:frame',packet(room));return {};
    });
    command('race:pause',()=>{const room=master(session);room.world?.race.pause();return {};});
    command('race:resume',()=>{const room=master(session);room.world?.race.resume();return {};});
    command('race:reset',()=>{const room=master(session);room.world?.dispose();room.world=null;room.descriptor=null;room.status='lobby';announce(room);return {};});
    socket.on('disconnect',()=>{
      if(session.socketId!==socket.id)return;
      session.socketId=null;const room=rooms.get(session.roomCode);if(room){promote(room);announce(room);}
      session.expiry=setTimeout(()=>{if(!session.socketId){leave(session);sessions.delete(session.token);}},reconnectMs);session.expiry.unref?.();
    });
  });
  // Fixed authoritative steps. Clients interpolate snapshots and never submit poses or wins.
  function step(){tick++;for(const room of rooms.values()){
    if(!room.world)continue;
    room.world.race.update(1/60);
    if(room.world.race.state==='results'&&room.status!=='results'){room.status='results';announce(room);}
    if(tick%3===0)io.to(room.code).emit('race:frame',packet(room));
  }}
  return {step,rooms,dispose(){for(const session of sessions.values())clearTimeout(session.expiry);for(const room of rooms.values())room.world?.dispose();rooms.clear();sessions.clear();}};
}
