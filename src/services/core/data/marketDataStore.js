"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColumnarCandleStore = exports.MarketDataStore = void 0;
class MarketDataStore {
  _timelineKey; _metadata={}; _time=new Float64Array(0); _open=new Float64Array(0); _high=new Float64Array(0);
  _low=new Float64Array(0); _close=new Float64Array(0); _volume=new Float64Array(0); _oi=new Float64Array(0); _bid=new Float64Array(0);
  _ask=new Float64Array(0); _bidVolume=new Float64Array(0); _askVolume=new Float64Array(0); _trades=new Float64Array(0); _session=new Float64Array(0);
  _length=0; _revision=0; _dirtyFrom=0; _dirtyTo=0; capacity=0;
  constructor(timelineKey='chart'){this._timelineKey=String(timelineKey);}
  get timelineKey(){return this._timelineKey;} get metadata(){return this._metadata;}
  setMetadata(metadata){this._metadata=Object.freeze({...metadata});}
  get length(){return this._length;} get revision(){return this._revision;} get dirtyRange(){return {from:this._dirtyFrom,to:this._dirtyTo};}
  get time(){return this._time.subarray(0,this._length);} get open(){return this._open.subarray(0,this._length);}
  get high(){return this._high.subarray(0,this._length);} get low(){return this._low.subarray(0,this._length);}
  get close(){return this._close.subarray(0,this._length);} get volume(){return this._volume.subarray(0,this._length);}
  get oi(){return this._oi.subarray(0,this._length);} get bid(){return this._bid.subarray(0,this._length);} get ask(){return this._ask.subarray(0,this._length);}
  get bidVolume(){return this._bidVolume.subarray(0,this._length);} get askVolume(){return this._askVolume.subarray(0,this._length);}
  get trades(){return this._trades.subarray(0,this._length);} get session(){return this._session.subarray(0,this._length);}
  views(){return {time:this.time,open:this.open,high:this.high,low:this.low,close:this.close,volume:this.volume,oi:this.oi,bid:this.bid,ask:this.ask,bidVolume:this.bidVolume,askVolume:this.askVolume,trades:this.trades,session:this.session};}
  replace(rows){this.ensure(rows.length);for(let i=0;i<rows.length;i++)this.write(i,rows[i]);this._length=rows.length;this.markDirty(0,this._length);}
  append(row){this.ensure(this._length+1);const index=this._length;this.write(index,row);this._length+=1;this.markDirty(index,index+1);}
  updateLast(row){if(!this._length)return this.append(row);const index=this._length-1;this.write(index,row);this.markDirty(index,index+1);}
  get(index){if(index<0||index>=this._length)return undefined;return {time:this._time[index],open:this._open[index],high:this._high[index],low:this._low[index],close:this._close[index],volume:this._volume[index],oi:this._oi[index],bid:this._bid[index],ask:this._ask[index],bidVolume:this._bidVolume[index],askVolume:this._askVolume[index],trades:this._trades[index],session:this._session[index]};}
  toArray(from=0,to=this._length){const start=Math.max(0,Math.floor(from));const end=Math.min(this._length,Math.ceil(to));const result=new Array(Math.max(0,end-start));for(let i=start;i<end;i++)result[i-start]=this.get(i);return result;}
  clear(){this._length=0;this.markDirty(0,0);}
  markDirty(from,to){this._dirtyFrom=Math.max(0,Math.floor(from));this._dirtyTo=Math.max(this._dirtyFrom,Math.min(this._length,Math.ceil(to)));this._revision+=1;}
  ensure(size){if(size<=this.capacity)return;let next=Math.max(256,this.capacity||256);while(next<size)next*=2;const arrays=[this._time,this._open,this._high,this._low,this._close,this._volume,this._oi,this._bid,this._ask,this._bidVolume,this._askVolume,this._trades,this._session];const replacements=arrays.map(previous=>{const nextArray=new Float64Array(next);nextArray.set(previous.subarray(0,this._length));return nextArray;});[this._time,this._open,this._high,this._low,this._close,this._volume,this._oi,this._bid,this._ask,this._bidVolume,this._askVolume,this._trades,this._session]=replacements;this.capacity=next;}
  write(index,row){this._time[index]=row.time;this._open[index]=row.open;this._high[index]=row.high;this._low[index]=row.low;this._close[index]=row.close;this._volume[index]=row.volume;this._oi[index]=row.oi??Number.NaN;this._bid[index]=row.bid??Number.NaN;this._ask[index]=row.ask??Number.NaN;this._bidVolume[index]=row.bidVolume??Number.NaN;this._askVolume[index]=row.askVolume??Number.NaN;this._trades[index]=row.trades??Number.NaN;this._session[index]=row.session??Number.NaN;}
}
exports.MarketDataStore=MarketDataStore;
class ColumnarCandleStore extends MarketDataStore {}
exports.ColumnarCandleStore=ColumnarCandleStore;
