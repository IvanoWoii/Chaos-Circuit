import { multiplayerUrl } from './config.js';

/** Socket.IO is loaded only when the player opens online rooms. Solo play stays independent. */
export async function createRoomClient(handlers, { url = multiplayerUrl || undefined } = {}) {
  const {io}=await import('socket.io-client');
  let token=null;try{token=sessionStorage.getItem('chaos-circuit.session');}catch{}
  const socket=io(url,{autoConnect:false,auth:{token},timeout:6000,reconnection:true,reconnectionDelay:700,reconnectionDelayMax:3000});
  let id=null;
  socket.on('session',session=>{id=session.id;socket.auth.token=session.token;try{sessionStorage.setItem('chaos-circuit.session',session.token);}catch{}handlers.session?.(session);});
  socket.on('connect',()=>handlers.connection?.(true,'Connected'));
  socket.on('disconnect',()=>handlers.connection?.(false,'Connection lost. Reconnecting…'));
  socket.on('connect_error',()=>handlers.connection?.(false,'Room service unavailable. Check your connection and use the multiplayer game address.'));
  for(const [event,handler]of [['rooms:list','rooms'],['room:state','room'],['race:begin','begin'],['race:frame','frame']])socket.on(event,data=>handlers[handler]?.(data));
  socket.connect();
  return {get id(){return id;},get connected(){return socket.connected;},
    async request(event,input={}) {
      if(!socket.connected)throw Error('Waiting for the room service. Please try again once connected.');
      let response;try{response=await socket.timeout(7000).emitWithAck(event,input);}catch{throw Error('The room service did not respond. Please try again.');}
      if(!response.ok)throw Error(response.error||'The request could not be completed.');return response;
    },
    retry(){socket.connect();},
    dispose(){socket.removeAllListeners();socket.disconnect();},
  };
}
