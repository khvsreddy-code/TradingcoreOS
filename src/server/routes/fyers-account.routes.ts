import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { FyersAccountService } from '../fyers/core/FyersAccountService.js';

export const fyersAccountRoutes=Router(); fyersAccountRoutes.use(requireUser);
async function account(req:AuthenticatedRequest,res:Response){ const s=await BrokerRepository.getSession('fyers',req.tradingCoreUserId!); if(!s||s.status!=='Connected'){res.status(401).json({success:false,error:'Fyers is not connected for this account.'});return null;} try{return new FyersAccountService(new FyersApiClient(EncryptionService.decrypt(s.accessTokenEncrypted)));}catch{res.status(500).json({success:false,error:'Unable to decrypt the Fyers session.'});return null;} }
function send(res:Response,data:any,error:any){return res.status(Number(error?.status)===429?429:502).json({success:false,error:error?.message||'FYERS account request failed',brokerCode:error?.brokerCode});}
for(const [path,method] of [['/profile','profile'],['/funds','funds'],['/holdings','holdings'],['/orders','orders'],['/trades','trades'],['/positions','positions']] as const){
 fyersAccountRoutes.get('/:brokerId'+path,async(req:AuthenticatedRequest,res:Response,next)=>{if(String(req.params.brokerId).toLowerCase()!=='fyers')return next(); const svc=await account(req,res);if(!svc)return;try{let data:any;if(method==='orders')data=await svc.orders({id:req.query.id?String(req.query.id):undefined,orderTag:req.query.order_tag?String(req.query.order_tag):undefined});else data=await (svc as any)[method]();return res.json({success:true,data});}catch(e){return send(res,null,e);}});
}
fyersAccountRoutes.post('/:brokerId/margin',async(req:AuthenticatedRequest,res:Response,next)=>{if(String(req.params.brokerId).toLowerCase()!=='fyers')return next();const svc=await account(req,res);if(!svc)return;const data=Array.isArray(req.body?.data)?req.body.data:req.body?.data; if(!Array.isArray(data)||!data.length)return res.status(400).json({success:false,error:'data must be a non-empty array of order specifications'});try{return res.json({success:true,data:await svc.margin(data)});}catch(e){return send(res,null,e);}});
