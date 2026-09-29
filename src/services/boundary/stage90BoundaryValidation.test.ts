import { isAccountFunds, isHistoricalCandle, isOptionChain, isOrderResult, requireSuccessData } from './brokerApiValidation';

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
check(isAccountFunds({totalCapital:10,availableMargin:8,usedMargin:2,collateralMargin:0}), 'funds valid payload rejected');
check(!isAccountFunds({totalCapital:'10',availableMargin:8,usedMargin:2,collateralMargin:0}), 'funds invalid payload accepted');
check(isHistoricalCandle({timestamp:'2026-09-27T00:00:00.000Z',open:1,high:2,low:0,close:1.5,volume:10}), 'historical candle rejected');
check(isOrderResult({orderId:'1',status:'PENDING',timestamp:'2026-09-27T00:00:00.000Z'}), 'order result rejected');
check(isOptionChain({underlyingKey:'NSE:NIFTY',expiry:'2026-10-01',contracts:[{strike:25000}]}), 'option chain rejected');
const value = requireSuccessData({success:true,data:{ok:true}});
check(JSON.stringify(value) === JSON.stringify({ok:true}), 'success envelope did not expose data');
console.log('STAGE90_BOUNDARY_VALIDATION_OK');
