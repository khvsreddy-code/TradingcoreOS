import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersOrderStreamTransport } from '../fyers/trading/FyersOrderStreamTransport.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';

export const fyersOrderStreamRoutes = Router();
fyersOrderStreamRoutes.use(requireUser);
fyersOrderStreamRoutes.get('/:brokerId/order-stream', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const userId=req.tradingCoreUserId!; const session=await BrokerRepository.getSession('fyers',userId);
  if(!session||session.status!=='Connected')return res.status(401).json({success:false,error:'Fyers is not connected for this account.'});
  let token:string; try{token=EncryptionService.decrypt(session.accessTokenEncrypted)}catch{return res.status(500).json({success:false,error:'Unable to decrypt the Fyers session.'});}
  res.status(200);
  res.setHeader('Content-Type','application/x-ndjson');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.setHeader('X-TradingCore-Realtime-Plane','legacy-vercel-stream');
  if (process.env.REALTIME_GATEWAY_URL) res.setHeader('X-TradingCore-Realtime-Migration','/api/realtime/ticket');
  res.setHeader('X-TradingCore-Stream-Lease-Ms', String(API_LATENCY_BUDGET_MS.streamLease));
  res.flushHeaders();
  const write=(event:any)=>{try{res.write(JSON.stringify(event)+'\n')}catch{}};
  const unsubscribe=FyersOrderStreamTransport.subscribe(userId,token,write);
  const heartbeat=setInterval(()=>write({type:'status',status:'connected'}),5000);
  const leaseTimer=setTimeout(()=>{
    write({type:'status',status:'disconnected',reason:'stream_lease_expired'});
    clearInterval(heartbeat);
    unsubscribe();
    if(!res.writableEnded)res.end();
  },API_LATENCY_BUDGET_MS.streamLease);
  req.on('close',()=>{clearTimeout(leaseTimer);clearInterval(heartbeat);unsubscribe();});
});
