import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Server } from 'socket.io';
import { staticHandler } from './static.js';
import { createRoomService } from './rooms.js';
import { socketOriginOptions } from './origins.js';

export function createGameServer(options={}) {
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const server=http.createServer(staticHandler(root));
  const io=new Server(server,{maxHttpBufferSize:16384,serveClient:true,...socketOriginOptions(options.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? '')});
  const rooms=createRoomService(io,options);
  let last=performance.now(),accumulator=0;
  const timer=options.manual?null:setInterval(()=>{const now=performance.now();accumulator+=Math.min((now-last)/1000,.1);last=now;while(accumulator>=1/60){rooms.step();accumulator-=1/60;}},1000/60);
  return {server,io,rooms,async close(){clearInterval(timer);io.disconnectSockets(true);rooms.dispose();await new Promise(resolve=>io.close(resolve));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createGameServer();const port=Number(process.env.PORT||3000),host=process.env.HOST||'0.0.0.0';
  app.server.on('error',error=>{console.error(error.message);app.close();process.exitCode=1;});
  app.server.listen(port,host,()=>console.log(`Chaos Circuit V1.5 listening on ${host}:${port}\nLocal game: http://localhost:${port}\nOnline players use the deployed frontend URL. Allowed frontend origins: ${process.env.ALLOWED_ORIGINS || 'same origin'}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close());
}
