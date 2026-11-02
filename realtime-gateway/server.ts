import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { BrokerRepository } from '../src/server/storage/BrokerRepository.js';
import { EncryptionService } from '../src/server/encryption/EncryptionService.js';
import { FyersMarketDataTransport } from '../src/server/marketData/FyersMarketDataTransport.js';
import { FyersOrderStreamTransport, type FyersOrderStreamEvent } from '../src/server/fyers/trading/FyersOrderStreamTransport.js';
import type { MarketFeedEvent } from '../src/types/market.js';
import { verifyRealtimeTicket } from '../src/server/realtime/ticket.js';
import { resolveFyersQuotaIdentity } from '../src/server/fyers/core/FyersQuotaIdentity.js';

const PORT = Number(process.env.REALTIME_GATEWAY_PORT || process.env.PORT || 8080);
const INSTANCE_ID = String(process.env.REALTIME_GATEWAY_INSTANCE_ID || crypto.randomUUID());
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/,'');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const OWNER_TTL_MS = 15_000;
const OWNER_RENEW_MS = 5_000;
const SUB_TTL_MS = 35_000;
const SUB_TOUCH_MS = 10_000;
const OWNER_WATCH_MS = 5_000;
const COORDINATION_CHANNEL = 'tco:realtime:coordination';

type RealtimeKind = 'market' | 'orders' | 'both';
type ConnectionRecord = {
  userId: string;
  connectionId: string;
  kind: RealtimeKind;
  symbols: string[];
  updatedAt: number;
};
type LocalConnection = ConnectionRecord & {
  socket: WebSocket;
  subscriptionKey: string;
  heartbeat: NodeJS.Timeout;
  ownerWatch: NodeJS.Timeout;
};
type OwnedUser = {
  ownerValue: string;
  renewTimer: NodeJS.Timeout;
  marketListener: (event:MarketFeedEvent)=>void;
  orderListener: (event:FyersOrderStreamEvent)=>void;
};

if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the realtime gateway.');
if(!process.env.REALTIME_GATEWAY_SHARED_SECRET)throw new Error('REALTIME_GATEWAY_SHARED_SECRET is required for the realtime gateway.');

const supabase=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let coordinationReady=false;
let coordinationChannel:RealtimeChannel|null=null;

const localConnections=new Map<string,LocalConnection>();
const connectionsByUser=new Map<string,Set<string>>();
const ownedUsers=new Map<string,OwnedUser>();

function userHasLocalConnections(userId:string):boolean{return(connectionsByUser.get(userId)?.size||0)>0;}
function ownerValue(userId:string):string{return `${INSTANCE_ID}:${userId}`;}
function subscriptionKey(record:ConnectionRecord):string{return `tco:realtime:sub:${record.userId}:${INSTANCE_ID}:${record.connectionId}`;}
function parseKind(value:string):RealtimeKind{const kind=value.toLowerCase();return kind==='orders'||kind==='both'?kind:'market';}
function parseSymbols(value:string):string[]{return[...new Set(String(value||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,100))];}

type GatewayBroadcastEnvelope =
  | { type: 'market'; userId: string; event: MarketFeedEvent }
  | { type: 'order'; userId: string; event: FyersOrderStreamEvent }
  | { type: 'system'; userId: string; event: { type: 'error'; error: string } };

async function broadcast(event:'market'|'order'|'control',payload:unknown):Promise<void>{
  if(!coordinationChannel)return;
  const status=await coordinationChannel.send({type:'broadcast',event,payload});
  if(status!=='ok')throw new Error(`Supabase Realtime broadcast failed: ${status}`);
}

async function writeSubscription(record:ConnectionRecord):Promise<string>{
  const key=subscriptionKey(record);
  const {error}=await supabase.from('realtime_gateway_subscriptions').upsert({
    subscription_key:key,user_id:record.userId,instance_id:INSTANCE_ID,connection_id:record.connectionId,
    kind:record.kind,symbols:record.symbols,updated_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+SUB_TTL_MS).toISOString(),
  });
  if(error)throw error;
  return key;
}

async function touchSubscription(connection:LocalConnection):Promise<void>{
  await supabase.from('realtime_gateway_subscriptions').update({
    updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+SUB_TTL_MS).toISOString(),
    symbols:connection.symbols,kind:connection.kind,
  }).eq('subscription_key',connection.subscriptionKey);
}

async function removeSubscription(connection:LocalConnection):Promise<void>{
  await supabase.from('realtime_gateway_subscriptions').delete().eq('subscription_key',connection.subscriptionKey);
}

async function acquireOwnership(userId:string):Promise<boolean>{
  if(ownedUsers.has(userId))return true;
  const value=ownerValue(userId);
  const {data,error}=await supabase.rpc('claim_realtime_gateway_owner',{p_user_id:userId,p_owner_value:value,p_ttl_ms:OWNER_TTL_MS});
  if(error||data!==true)return false;

  const marketListener=(event:MarketFeedEvent)=>{void broadcast('market',{type:'market',userId,event}).catch(err=>console.error('[TradingCore realtime broadcast]',err));};
  const orderListener=(event:FyersOrderStreamEvent)=>{void broadcast('order',{type:'order',userId,event}).catch(err=>console.error('[TradingCore realtime broadcast]',err));};
  const renewTimer=setInterval(()=>{void renewOwnership(userId).catch(err=>console.error('[TradingCore realtime owner renew]',err));},OWNER_RENEW_MS);
  ownedUsers.set(userId,{ownerValue:value,renewTimer,marketListener,orderListener});
  await syncOwnedUser(userId);
  return true;
}

async function renewOwnership(userId:string):Promise<void>{
  const owned=ownedUsers.get(userId);if(!owned)return;
  const {data,error}=await supabase.rpc('renew_realtime_gateway_owner',{p_user_id:userId,p_owner_value:owned.ownerValue,p_ttl_ms:OWNER_TTL_MS});
  if(!error&&data===true)return;
  await stopOwnership(userId);
}

async function stopOwnership(userId:string):Promise<void>{
  const owned=ownedUsers.get(userId);if(!owned)return;
  clearInterval(owned.renewTimer);
  ownedUsers.delete(userId);
  FyersMarketDataTransport.disconnect(userId);
  FyersOrderStreamTransport.disconnect(userId);
  try {
    await supabase.rpc('release_realtime_gateway_owner',{p_user_id:userId,p_owner_value:owned.ownerValue});
  } catch {
    // Ownership is already fenced locally; release is best-effort during shutdown.
  }
}

async function loadDesiredConnections(userId:string):Promise<ConnectionRecord[]>{
  const now=new Date().toISOString();
  const {data,error}=await supabase.from('realtime_gateway_subscriptions')
    .select('user_id,connection_id,instance_id,kind,symbols,updated_at,expires_at')
    .eq('user_id',userId)
    .gt('expires_at',now);
  if(error)throw error;
  return(data||[]).map((row:any)=>({
    userId:String(row.user_id),connectionId:String(row.connection_id),kind:parseKind(String(row.kind)),
    symbols:Array.isArray(row.symbols)?row.symbols.map(String).slice(0,100):[],
    updatedAt:Date.parse(String(row.updated_at||''))||Date.now(),
  }));
}

async function brokerCredentials(userId:string):Promise<{token:string;quotaIdentity:string}>{
  const session=await BrokerRepository.getSession('fyers',userId);
  if(!session||session.status!=='Connected')throw new Error('Fyers is not connected for this account.');
  return {
    token: EncryptionService.decrypt(session.accessTokenEncrypted),
    // A shared FYERS account must share one admission budget across TradingCore users.
    quotaIdentity: resolveFyersQuotaIdentity(session.clientCode),
  };
}

async function syncOwnedUser(userId:string):Promise<void>{
  if(!ownedUsers.has(userId))return;
  const desired=await loadDesiredConnections(userId);
  const market=desired.filter(item=>item.kind==='market'||item.kind==='both');
  const orders=desired.some(item=>item.kind==='orders'||item.kind==='both');
  const symbols=[...new Set(market.flatMap(item=>item.symbols))];
  if(!desired.length){await stopOwnership(userId);return;}
  try{
    const {token,quotaIdentity}=await brokerCredentials(userId);
    if(symbols.length){
      const owned=ownedUsers.get(userId)!;
      FyersMarketDataTransport.subscribe(userId,token,symbols,owned.marketListener);
    }else FyersMarketDataTransport.disconnect(userId);
    if(orders){
      const owned=ownedUsers.get(userId)!;
      FyersOrderStreamTransport.subscribe(userId,token,owned.orderListener,quotaIdentity);
    }else FyersOrderStreamTransport.disconnect(userId);
  }catch(error){
    await broadcast('order',{type:'order',userId,event:{type:'error',error:error instanceof Error?error.message:'Unable to initialize broker realtime session'}}).catch(()=>undefined);
  }
}

async function ensureOwnership(userId:string):Promise<void>{
  if(!userHasLocalConnections(userId)||ownedUsers.has(userId))return;
  await acquireOwnership(userId);
}

function broadcastEvent(payload:GatewayBroadcastEnvelope):void{
  const userId=String(payload?.userId||'');if(!userId)return;
  const ids=connectionsByUser.get(userId);if(!ids?.size)return;
  for(const connectionId of ids){
    const connection=localConnections.get(connectionId);
    if(!connection||connection.socket.readyState!==WebSocket.OPEN)continue;
    if(payload.type==='market'&&connection.kind==='orders')continue;
    if(payload.type==='market'&&payload.event?.type==='tick'){
      const symbol=String(payload.event?.tick?.instrumentKey||'');
      if(symbol&&connection.symbols.length&&!connection.symbols.includes(symbol))continue;
    }
    if(payload.type==='order'&&connection.kind==='market')continue;
    try{connection.socket.send(JSON.stringify(payload.event));}catch{}
  }
}

function serializableConnection(connection:LocalConnection|ConnectionRecord):ConnectionRecord{
  return {
    userId:connection.userId,
    connectionId:connection.connectionId,
    kind:connection.kind,
    symbols:[...connection.symbols],
    updatedAt:connection.updatedAt,
  };
}

async function handleControl(payload:any):Promise<void>{
  const userId=String(payload?.userId||'');if(!userId||!ownedUsers.has(userId))return;
  await syncOwnedUser(userId);
}

function setupCoordination():Promise<void>{
  return new Promise((resolve,reject)=>{
    coordinationChannel=supabase.channel(COORDINATION_CHANNEL,{config:{broadcast:{self:true,ack:false}}});
    coordinationChannel
      .on('broadcast',{event:'market'},({payload})=>broadcastEvent(payload))
      .on('broadcast',{event:'order'},({payload})=>broadcastEvent(payload))
      .on('broadcast',{event:'control'},({payload})=>{void handleControl(payload).catch(err=>console.error('[TradingCore realtime control]',err));})
      .subscribe((status)=>{
        if(status==='SUBSCRIBED'){coordinationReady=true;resolve();}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){reject(new Error(`Supabase Realtime coordination ${status.toLowerCase()}`));}
      });
  });
}

async function handleConnection(socket:WebSocket,request:http.IncomingMessage):Promise<void>{
  const requestUrl=new URL(request.url||'/', 'http://localhost');
  let ticket;
  try{ticket=verifyRealtimeTicket(String(requestUrl.searchParams.get('ticket')||''));}
  catch(error){socket.close(1008,error instanceof Error?error.message:'Invalid realtime ticket');return;}

  if(ticket.broker!=='fyers'){socket.close(1008,'Unsupported realtime broker');return;}
  const kind=parseKind(String(requestUrl.searchParams.get('kind')||'market'));
  const symbols=parseSymbols(String(requestUrl.searchParams.get('symbols')||''));
  if((kind==='market'||kind==='both')&&!symbols.length){socket.close(1008,'At least one market symbol is required.');return;}

  const connectionId=crypto.randomUUID();
  const record:ConnectionRecord={userId:ticket.sub,connectionId,kind,symbols,updatedAt:Date.now()};
  const key=await writeSubscription(record);
  const local:LocalConnection={...record,socket,subscriptionKey:key,
    heartbeat:setInterval(()=>{void touchSubscription(local).catch(()=>undefined);if(socket.readyState===WebSocket.OPEN)try{socket.ping();}catch{}},SUB_TOUCH_MS),
    ownerWatch:setInterval(()=>{void ensureOwnership(local.userId).catch(err=>console.error('[TradingCore realtime ownership]',err));},OWNER_WATCH_MS)};
  localConnections.set(connectionId,local);
  let ids=connectionsByUser.get(record.userId);if(!ids){ids=new Set();connectionsByUser.set(record.userId,ids);}ids.add(connectionId);

  socket.on('pong',()=>{void touchSubscription(local).catch(()=>undefined);});
  socket.on('message',async(raw)=>{
    let message:any;try{message=JSON.parse(raw.toString());}catch{socket.send(JSON.stringify({type:'error',error:'Invalid realtime message.'}));return;}
    if(message?.type!=='subscribe')return;
    const nextKind=parseKind(String(message.kind||local.kind));
    const nextSymbols=parseSymbols(String(message.symbols||local.symbols.join(',')));
    if((nextKind==='market'||nextKind==='both')&&!nextSymbols.length){socket.send(JSON.stringify({type:'error',error:'At least one market symbol is required.'}));return;}
    local.kind=nextKind;local.symbols=nextSymbols;local.updatedAt=Date.now();
    await writeSubscription(local);
    await broadcast('control',serializableConnection(local));
    await ensureOwnership(local.userId);
  });

  socket.on('close',async()=>{
    clearInterval(local.heartbeat);clearInterval(local.ownerWatch);
    localConnections.delete(connectionId);
    const current=connectionsByUser.get(local.userId);current?.delete(connectionId);
    if(current&&!current.size)connectionsByUser.delete(local.userId);
    await removeSubscription(local);
    await broadcast('control',serializableConnection(local)).catch(()=>undefined);
    if(!userHasLocalConnections(local.userId)&&ownedUsers.has(local.userId)){
      const desired=await loadDesiredConnections(local.userId).catch(()=>[]);
      if(!desired.length)await stopOwnership(local.userId);
      else await syncOwnedUser(local.userId).catch(()=>undefined);
    }
  });

  socket.send(JSON.stringify({type:'status',status:'connected',instanceId:INSTANCE_ID}));
  await broadcast('control',serializableConnection(local));
  await ensureOwnership(local.userId);
}

const server=http.createServer((request,response)=>{
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if(pathname==='/healthz'||pathname==='/api/realtime/healthz'){
    response.writeHead(coordinationReady?200:503,{'content-type':'application/json','cache-control':'no-store'});
    response.end(JSON.stringify({status:coordinationReady?'ok':'degraded',instanceId:INSTANCE_ID,localConnections:localConnections.size,ownedUsers:ownedUsers.size,timestamp:new Date().toISOString()}));
    return;
  }
  response.writeHead(404,{'content-type':'application/json'});
  response.end(JSON.stringify({error:'not found'}));
});

const wss=new WebSocketServer({noServer:true});
server.on('upgrade',(request,socket,head)=>{
  const requestUrl=new URL(request.url||'/', 'http://localhost');
  if(requestUrl.pathname!=='/ws' && requestUrl.pathname!=='/api/realtime/ws'){socket.destroy();return;}
  if(!coordinationReady){socket.destroy();return;}
  wss.handleUpgrade(request,socket,head,ws=>{void handleConnection(ws,request).catch(error=>{console.error('[TradingCore realtime connection]',error);try{ws.close(1011,'Realtime gateway error');}catch{}});});
});

async function shutdown():Promise<void>{
  for(const userId of [...ownedUsers.keys()])await stopOwnership(userId);
  if(coordinationChannel){await supabase.removeChannel(coordinationChannel).catch(()=>undefined);coordinationChannel=null;}
  for(const connection of localConnections.values())try{connection.socket.close(1001,'Gateway shutting down');}catch{}
  server.close();
}

async function start():Promise<void>{
  await setupCoordination();
  server.listen(PORT,'0.0.0.0',()=>console.log('[TradingCore realtime] gateway listening on :'+PORT+' instance='+INSTANCE_ID));
}

process.on('SIGTERM',()=>{void shutdown();});
process.on('SIGINT',()=>{void shutdown();});
void start().catch(error=>{console.error('[TradingCore realtime] startup failed',error);process.exit(1);});
