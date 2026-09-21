import WebSocket from 'ws';

type Listener = (event: FyersOrderStreamEvent) => void;
export type FyersOrderStreamEvent =
  | { type: 'status'; status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'authentication_failed' }
  | { type: 'order'; data: any } | { type: 'trade'; data: any } | { type: 'position'; data: any }
  | { type: 'general'; data: any } | { type: 'error'; error: string };
interface Session { socket?: WebSocket; listeners: Set<Listener>; accessToken: string; closing: boolean; reconnectAttempt: number; reconnectTimer?: ReturnType<typeof setTimeout>; pingTimer?: ReturnType<typeof setInterval>; generation: number; }
export class FyersOrderStreamTransport {
  private static sessions = new Map<string, Session>();
  static subscribe(userId: string, accessToken: string, listener: Listener): () => void {
    let session = this.sessions.get(userId);
    if (!session) { session = { listeners: new Set(), accessToken, closing: false, reconnectAttempt: 0, generation: 0 }; this.sessions.set(userId, session); }
    session.accessToken = accessToken; session.closing = false; session.listeners.add(listener);
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) this.connect(userId, session);
    listener({ type: 'status', status: session.socket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting' });
    return () => this.unsubscribe(userId, listener);
  }
  static disconnect(userId: string): void { const s=this.sessions.get(userId); if(!s)return; s.closing=true; clearTimeout(s.reconnectTimer); if(s.pingTimer)clearInterval(s.pingTimer); try{s.socket?.close();}catch{} this.sessions.delete(userId); }
  private static unsubscribe(userId:string, listener:Listener):void { const s=this.sessions.get(userId); if(!s)return; s.listeners.delete(listener); if(!s.listeners.size)this.disconnect(userId); }
  private static connect(userId:string, session:Session):void {
    if(session.closing)return; const appId=process.env.FYERS_CLIENT_ID;
    if(!appId){this.emit(session,{type:'error',error:'FYERS_CLIENT_ID is not configured for order streaming'});return;}
    const generation=++session.generation;
    const socket=new WebSocket('wss://socket.fyers.in/trade/v3',{headers:{authorization:`${appId}:${session.accessToken}`},handshakeTimeout:10000}); session.socket=socket;
    socket.on('open',()=>{if(generation!==session.generation||session.closing)return; session.reconnectAttempt=0; this.emit(session,{type:'status',status:'connected'}); socket.send(JSON.stringify({T:'SUB_ORD',SLIST:['orders','trades','positions'],SUB_T:1})); if(session.pingTimer)clearInterval(session.pingTimer); session.pingTimer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN){try{socket.send('ping')}catch{}}},10000);});
    socket.on('message',raw=>{if(generation!==session.generation||session.closing)return; const text=Buffer.isBuffer(raw)?raw.toString('utf8'):String(raw); if(text==='pong'||text==='ping')return; let payload:any; try{payload=JSON.parse(text)}catch{return;} this.routeMessage(session,payload);});
    socket.on('error',error=>{if(generation!==session.generation||session.closing)return; this.emit(session,{type:'error',error:error instanceof Error?error.message:'FYERS order socket error'});});
    socket.on('close',(code,reason)=>{if(generation!==session.generation)return; session.socket=undefined; if(session.pingTimer)clearInterval(session.pingTimer); session.pingTimer=undefined; if(session.closing)return; const detail=reason?.toString?.()||''; if(code===403||code===1008||code===4001){this.emit(session,{type:'error',error:detail||`FYERS order socket rejected the session (code ${code}). Reconnect the broker.`});this.emit(session,{type:'status',status:'authentication_failed'});return;} this.scheduleReconnect(userId,session);});
  }
  private static routeMessage(session:Session,payload:any):void { const kind=String(payload?.type||payload?.T||payload?.event||payload?.channel||'').toLowerCase(); if(kind.includes('order')||payload?.orders||payload?.order)this.emit(session,{type:'order',data:payload?.orders??payload?.order??payload}); else if(kind.includes('trade')||payload?.trades||payload?.trade)this.emit(session,{type:'trade',data:payload?.trades??payload?.trade??payload}); else if(kind.includes('position')||payload?.positions||payload?.position)this.emit(session,{type:'position',data:payload?.positions??payload?.position??payload}); else this.emit(session,{type:'general',data:payload}); }
  private static scheduleReconnect(userId:string,session:Session):void {if(session.closing)return; session.reconnectAttempt+=1; const delay=Math.min(15000,500*2**Math.min(session.reconnectAttempt,5)); this.emit(session,{type:'status',status:'reconnecting'}); clearTimeout(session.reconnectTimer); session.reconnectTimer=setTimeout(()=>this.connect(userId,session),delay);}
  private static emit(session:Session,event:FyersOrderStreamEvent):void{session.listeners.forEach(listener=>listener(event));}
}
