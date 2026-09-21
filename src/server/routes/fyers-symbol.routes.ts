import { Router,Response } from 'express';
import { AuthenticatedRequest,requireUser } from '../auth/requireUser.js';
import { FyersSymbolMasterService } from '../fyers/symbols/FyersSymbolMasterService.js';
export const fyersSymbolRoutes=Router(); fyersSymbolRoutes.use(requireUser);
fyersSymbolRoutes.get('/:brokerId/symbol-master',async(req:AuthenticatedRequest,res:Response,next)=>{if(String(req.params.brokerId).toLowerCase()!=='fyers')return next();const master=String(req.query.master||'NSE_CM') as any;if(!FyersSymbolMasterService.masterNames().includes(master))return res.status(400).json({success:false,error:'Unsupported FYERS symbol master'});try{return res.json({success:true,data:await FyersSymbolMasterService.search(master,String(req.query.q||''),Math.min(100,Math.max(1,Number(req.query.limit||50))))});}catch(e:any){return res.status(502).json({success:false,error:e?.message||'Unable to load FYERS symbol master'});}});
