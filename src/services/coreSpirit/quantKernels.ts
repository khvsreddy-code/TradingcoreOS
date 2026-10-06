/** Stateful quantitative kernels used by CoreSpirit's quant authoring surface. */
export class RollingBetaState {
  readonly period:number;
  private readonly x:Float64Array;
  private readonly y:Float64Array;
  private cursor=0;
  private count=0;
  private sumX=0;
  private sumY=0;
  private sumXX=0;
  private sumXY=0;

  constructor(period:number){
    this.period=Math.max(2,Math.floor(period));
    this.x=new Float64Array(this.period);
    this.y=new Float64Array(this.period);
  }

  update(x:number,y:number,mode:'append'|'replace'='append'):number|null{
    if(!Number.isFinite(x)||!Number.isFinite(y)) return null;
    if(mode==='replace'){
      const index=this.count===0?0:(this.cursor-1+this.period)%this.period;
      if(this.count===0){
        this.x[index]=x; this.y[index]=y; this.count=1; this.cursor=(index+1)%this.period;
        this.add(x,y);
      }else{
        const ox=this.x[index]!, oy=this.y[index]!;
        this.remove(ox,oy); this.x[index]=x; this.y[index]=y; this.add(x,y);
      }
      return this.value();
    }

    if(this.count===this.period){
      const ox=this.x[this.cursor]!, oy=this.y[this.cursor]!;
      this.remove(ox,oy);
    }else{
      this.count+=1;
    }
    this.x[this.cursor]=x; this.y[this.cursor]=y;
    this.add(x,y);
    this.cursor=(this.cursor+1)%this.period;
    return this.value();
  }

  clone():RollingBetaState{
    const next=new RollingBetaState(this.period);
    next.x.set(this.x); next.y.set(this.y);
    next.cursor=this.cursor; next.count=this.count;
    next.sumX=this.sumX; next.sumY=this.sumY; next.sumXX=this.sumXX; next.sumXY=this.sumXY;
    return next;
  }

  copyFrom(other:RollingBetaState):void{
    if(other.period!==this.period) throw new Error('rolling beta period mismatch');
    this.x.set(other.x); this.y.set(other.y);
    this.cursor=other.cursor; this.count=other.count;
    this.sumX=other.sumX; this.sumY=other.sumY; this.sumXX=other.sumXX; this.sumXY=other.sumXY;
  }

  private add(x:number,y:number){ this.sumX+=x; this.sumY+=y; this.sumXX+=x*x; this.sumXY+=x*y; }
  private remove(x:number,y:number){ this.sumX-=x; this.sumY-=y; this.sumXX-=x*x; this.sumXY-=x*y; }

  private value():number|null{
    if(this.count<2) return null;
    const n=this.count;
    const denominator=this.sumXX-(this.sumX*this.sumX/n);
    if(Math.abs(denominator)<1e-12) return null;
    const covariance=this.sumXY-(this.sumX*this.sumY/n);
    const beta=covariance/denominator;
    return Number.isFinite(beta)?beta:null;
  }
}

export class RollingCorrelationState {
  readonly period:number;
  private readonly y:Float64Array;
  private cursor=0;
  private count=0;
  private sumY=0;
  private sumYY=0;
  private sumXY=0;
  private static readonly xStep=(period:number)=>period*(period-1)/2;
  private static readonly xSquare=(period:number)=>period*(period-1)*(2*period-1)/6;

  constructor(period:number){
    this.period=Math.max(2,Math.floor(period));
    this.y=new Float64Array(this.period);
  }

  update(value:number,mode:'append'|'replace'='append'):number|null{
    if(!Number.isFinite(value)) return null;

    if(mode==='replace'){
      const index=this.count===0?0:(this.cursor-1+this.period)%this.period;
      if(this.count===0){
        this.y[index]=value; this.count=1; this.cursor=(index+1)%this.period;
        this.addAt(index,value);
      }else{
        const old=this.y[index]!;
        this.removeAt(index,old); this.y[index]=value; this.addAt(index,value);
      }
      return this.value();
    }

    if(this.count<this.period){
      const index=this.count;
      this.count+=1;
      this.y[index]=value;
      this.addAt(index,value);
    }else{
      const oldest=this.y[this.cursor]!;
      const oldSumY=this.sumY;
      this.sumY-=oldest;
      this.sumYY-=oldest*oldest;
      // All surviving x-coordinates shift left by one.
      this.sumXY -= (oldSumY-oldest);
      this.y[this.cursor]=value;
      this.sumY+=value;
      this.sumYY+=value*value;
      this.sumXY += (this.period-1)*value;
    }
    this.cursor=(this.cursor+1)%this.period;
    return this.value();
  }

  clone():RollingCorrelationState{
    const next=new RollingCorrelationState(this.period);
    next.y.set(this.y); next.cursor=this.cursor; next.count=this.count;
    next.sumY=this.sumY; next.sumYY=this.sumYY; next.sumXY=this.sumXY;
    return next;
  }

  copyFrom(other:RollingCorrelationState):void{
    if(other.period!==this.period) throw new Error('rolling correlation period mismatch');
    this.y.set(other.y); this.cursor=other.cursor; this.count=other.count;
    this.sumY=other.sumY; this.sumYY=other.sumYY; this.sumXY=other.sumXY;
  }

  private addAt(index:number,value:number){ this.sumY+=value; this.sumYY+=value*value; this.sumXY+=index*value; }
  private removeAt(index:number,value:number){ this.sumY-=value; this.sumYY-=value*value; this.sumXY-=index*value; }

  private value():number|null{
    const n=this.count;
    if(n<2) return null;
    const sumX=RollingCorrelationState.xStep(n);
    const sumXX=RollingCorrelationState.xSquare(n);
    const dx=n*sumXX-sumX*sumX;
    const dy=n*this.sumYY-this.sumY*this.sumY;
    if(dx<=0||dy<=1e-15) return null;
    const numerator=n*this.sumXY-sumX*this.sumY;
    const correlation=numerator/Math.sqrt(dx*dy);
    return Number.isFinite(correlation)?Math.max(-1,Math.min(1,correlation)):null;
  }
}

export type CoreSpiritQuantRegime='trend-up'|'trend-down'|'range'|'volatile';

export function detectQuantRegime(volatility:number,trend:number,volatilityThreshold=0.02):CoreSpiritQuantRegime{
  const vol=Number(volatility);
  const strength=Number(trend);
  if(!Number.isFinite(strength)) return 'range';
  if(Math.abs(strength)>=0.5) return strength>0?'trend-up':'trend-down';
  if(Number.isFinite(vol)&&vol>=Math.max(0.000001,Number(volatilityThreshold))) return 'volatile';
  return 'range';
}
