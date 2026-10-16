import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { MAPS, chooseMap, describeMap, layoutForMap } from '../js/world/maps.js';
import { createRaceWorld } from '../js/race/world.js';
import { createLobby } from '../js/race/lobby.js';
import { createGameServer } from '../server/index.js';

let passed=0;
async function test(name,run){await run();passed++;console.log(`PASS ${name}`);}
await test('Map rolls are reproducible and consecutive races always change layout',()=>{
  let previous=null;const seen=new Set();
  for(let seed=1;seed<40;seed++){const map=chooseMap(seed,previous);assert.notEqual(map.id,previous);assert.deepEqual(map,chooseMap(seed,previous));seen.add(map.id);previous=map.id;}
  assert.equal(seen.size,4);
  assert.notDeepEqual(describeMap('rookie',1).obstacles,describeMap('rookie',2).obstacles);
});
await test('Every map has continuous projection, road-valid grids and spaced hazards',()=>{
  for(const map of MAPS){const layout=layoutForMap(map);for(let i=0;i<100;i++){
    const d=i/100*layout.TRACK_LENGTH,p=layout.getTrackPoint(d,1.5),projected=layout.projectTrackDistance(p.x,p.z);
    assert.ok(Math.min(Math.abs(d-projected),Math.abs(Math.abs(d-projected)-layout.TRACK_LENGTH))<1e-7);
  }for(let i=0;i<8;i++){const p=layout.getGridSlot(i);assert.ok(layout.isOnRoad(p.x,p.z,1.3));}
    const hazards=describeMap(map.id,123).obstacles;assert.equal(hazards.length,3);assert.ok(hazards[0].distance>20);
    for(let i=1;i<hazards.length;i++)assert.ok(hazards[i].distance-hazards[i-1].distance>12);
  }
});
await test('All four maps run full races with finite physical poses and actual finishers',()=>{
  for(const map of MAPS){const world=createRaceWorld(describeMap(map.id,123),{recordRace(){}});
    world.race.start(createLobby().getEntries(),123);
    for(let i=0;i<185*60&&world.race.state!=='results';i++)world.race.update(1/60);
    const snapshot=world.race.getSnapshot();
    console.log(map.name, snapshot.results.filter(row=>row.finished).length,'finishers',snapshot.recoveries,'recoveries');
    assert.equal(snapshot.state,'results');assert.ok(snapshot.results.some(row=>row.finished),`${map.id}: no finisher`);
    for(const car of world.simulation.capture().cars)assert.ok([...car.p,...car.q,...car.v].every(Number.isFinite));
    world.dispose();assert.equal(world.physics.world.bodies.length,0);
  }
});

const app=createGameServer({manual:true,reconnectMs:1000});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const address=`http://127.0.0.1:${app.server.address().port}`;
const sockets=[];
async function connect(token){const socket=io(address,{autoConnect:false,reconnection:false,transports:['websocket'],auth:{token}});sockets.push(socket);const session=once(socket,'session');socket.connect();const [identity]=await session;socket.identity=identity;socket.frames=[];socket.on('race:frame',frame=>socket.frames.push(frame));return socket;}
const request=(socket,event,input={})=>socket.timeout(5000).emitWithAck(event,input);
const profile=name=>({name,color:'#fb673e',style:'balanced'});
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
try {
  const a=await connect(),b=await connect(),c=await connect();
  let code;
  await test('Real Socket.IO clients create, list and join a bounded room',async()=>{
    const result=await request(a,'room:create',{profile:profile('Alice'),limit:2});assert.equal(result.ok,true);code=result.room.code;
    assert.match(code,/^[A-F0-9]{6}$/);
    const listing=await request(b,'rooms:get');assert.ok(listing.rooms.some(room=>room.code===code));
    assert.equal((await request(b,'room:join',{code,profile:profile('Bob')})).ok,true);
    assert.equal((await request(c,'room:join',{code,profile:profile('Charlie')})).ok,false);
    assert.equal(app.rooms.rooms.get(code).players.length,2);
  });
  await test('Only the master changes limits, adds/removes AI and starts the race',async()=>{
    assert.equal((await request(b,'room:add-ai')).ok,false);
    assert.equal((await request(b,'room:limit',{limit:3})).ok,false);
    assert.equal((await request(b,'race:start')).ok,false);
    assert.equal((await request(a,'room:limit',{limit:3})).ok,true);
    assert.equal((await request(a,'room:add-ai')).ok,true);
    const bot=app.rooms.rooms.get(code).players.find(p=>p.isBot);
    assert.ok(bot);assert.equal((await request(a,'room:remove-ai',{id:bot.id})).ok,true);
    assert.equal((await request(a,'room:add-ai')).ok,true);
    assert.equal((await request(a,'race:start')).ok,true);
    assert.equal((await request(c,'room:join',{code,profile:profile('Charlie')})).ok,false);
  });
  await test('Both clients receive identical authoritative poses, timing and results',async()=>{
    const room=app.rooms.rooms.get(code);
    // Run another room at the same time: layouts and broadcasts must be isolated.
    const length=room.world.layout.TRACK_LENGTH;
    const other=await request(c,'room:create',{profile:profile('Charlie'),limit:2});
    assert.equal(other.ok,true);await request(c,'room:add-ai');await request(c,'race:start');
    assert.notEqual(app.rooms.rooms.get(other.room.code).world,room.world);
    assert.equal(room.world.layout.TRACK_LENGTH,length);
    for(let i=0;i<185*60&&room.status!=='results';i++){app.rooms.step();if(i%180===0)await new Promise(resolve=>setImmediate(resolve));}
    for(let i=0;i<3;i++)app.rooms.step();await flush();
    const first=a.frames.at(-1),second=b.frames.at(-1);
    assert.ok(first&&second);assert.deepEqual(first,second);assert.equal(first.state.state,'results');assert.equal(first.state.results.length,3);
    assert.ok(first.state.results.some(row=>row.finished));assert.equal(first.poses.obstacles.length,3);
    assert.ok(c.frames.length>0&&c.frames.every(frame=>frame.code===other.room.code));
    assert.ok(a.frames.every(frame=>frame.code===code));await request(c,'room:leave');
  });
  await test('Reset returns everyone to the room and rolls a different map next race',async()=>{
    const old=app.rooms.rooms.get(code).descriptor.map.id;
    assert.equal((await request(b,'race:reset')).ok,false);
    assert.equal((await request(a,'race:reset')).ok,true);
    assert.equal(app.rooms.rooms.get(code).status,'lobby');
    assert.equal((await request(a,'race:start')).ok,true);
    assert.notEqual(app.rooms.rooms.get(code).descriptor.map.id,old);
    assert.equal((await request(a,'race:pause')).ok,true);
    const elapsed=app.rooms.rooms.get(code).world.race.getSnapshot().elapsed;for(let i=0;i<10;i++)app.rooms.step();
    assert.equal(app.rooms.rooms.get(code).world.race.getSnapshot().elapsed,elapsed);
  });
  await test('Disconnect transfers mastery and a session token restores the same racer',async()=>{
    const token=a.identity.token,id=a.identity.id;a.disconnect();await flush();
    assert.equal(app.rooms.rooms.get(code).hostId,b.identity.id);
    const restored=await connect(token);await flush();assert.equal(restored.identity.id,id);
    assert.equal(app.rooms.rooms.get(code).players.filter(p=>p.id===id).length,1);
    assert.equal((await request(restored,'race:reset')).ok,false);
    assert.equal((await request(b,'race:reset')).ok,true);
    await request(restored,'room:leave');await request(b,'room:leave');
    assert.equal(app.rooms.rooms.has(code),false);
  });
  await test('The server serves the game and keeps source helpers and dependencies private',async()=>{
    assert.equal((await fetch(address+'/')).status,200);assert.equal((await fetch(address+'/menus.css')).status,200);
    assert.equal((await fetch(address+'/server/rooms.js')).status,404);assert.equal((await fetch(address+'/node_modules/socket.io/package.json')).status,404);
    assert.equal((await fetch(address+'/.tmp/install-pinned.mjs')).status,404);
  });
} finally {sockets.forEach(socket=>socket.disconnect());await app.close();}
console.log(`\n${passed} V1.5 maps / multiplayer checks passed.`);
