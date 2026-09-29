export type CoreSpiritReconciliationStatus='consistent'|'missing_broker_order'|'unexpected_broker_order'|'unknown'|'quantity_mismatch';
export type CoreSpiritReconciliationRow=Readonly<{localOrderId?:string|null;brokerOrderId?:string|null;localQuantity?:number|null;brokerQuantity?:number|null;status:CoreSpiritReconciliationStatus;reason?:string;}>;
export type CoreSpiritReconciliationReport=Readonly<{checkedAt:string;rows:CoreSpiritReconciliationRow[];consistent:number;unknown:number;requiresAction:number;}>;
export function reconcileBrokerOrders(
 expected:ReadonlyArray<{localOrderId?:string|null;brokerOrderId?:string|null;quantity?:number|null}>,
 brokerOrders:ReadonlyArray<{orderId?:string|null;quantity?:number|null}>
):CoreSpiritReconciliationReport{
 const byId=new Map(brokerOrders.filter(x=>x.orderId).map(x=>[String(x.orderId),x] as const));
 const seen=new Set<string>();const rows:CoreSpiritReconciliationRow[]=[];
 for(const local of expected){
  const id=local.brokerOrderId?String(local.brokerOrderId):'';
  if(!id){rows.push({localOrderId:local.localOrderId,status:'unknown',reason:'Local record has no broker order id.'});continue;}
  seen.add(id);const broker=byId.get(id);
  if(!broker){rows.push({localOrderId:local.localOrderId,brokerOrderId:id,localQuantity:local.quantity??null,status:'missing_broker_order',reason:'Expected broker order was not returned by the broker snapshot.'});continue;}
  const l=local.quantity==null?null:Number(local.quantity),b=broker.quantity==null?null:Number(broker.quantity);
  rows.push(l!=null&&b!=null&&l!==b
   ?{localOrderId:local.localOrderId,brokerOrderId:id,localQuantity:l,brokerQuantity:b,status:'quantity_mismatch',reason:'Local and broker quantities differ.'}
   :{localOrderId:local.localOrderId,brokerOrderId:id,localQuantity:l,brokerQuantity:b,status:'consistent'});
 }
 for(const broker of brokerOrders)if(broker.orderId&&!seen.has(String(broker.orderId)))rows.push({brokerOrderId:String(broker.orderId),brokerQuantity:broker.quantity==null?null:Number(broker.quantity),status:'unexpected_broker_order',reason:'Broker returned an order that has no matching local execution record.'});
 const consistent=rows.filter(x=>x.status==='consistent').length,unknown=rows.filter(x=>x.status==='unknown').length;
 return Object.freeze({checkedAt:new Date().toISOString(),rows,consistent,unknown,requiresAction:rows.length-consistent});
}
