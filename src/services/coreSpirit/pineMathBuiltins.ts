/**
 * Pure scalar Pine math kernels. This module deliberately contains no VM,
 * market-data, browser or host dependencies.
 */
const NAMES = new Set([
  'abs','min','max','sqrt','pow','log','log10','exp','round','sign','floor','ceil',
  'sin','cos','tan','asin','acos','atan','atan2','todegrees','toradians','tanh',
  'clamp','sigmoid','avg',
]);

export type CoreSpiritPineMathResult = Readonly<{ handled:boolean; value?:number }>;

export function executeCoreSpiritPineMathBuiltin(name:string,args:readonly unknown[]):CoreSpiritPineMathResult {
  if (!NAMES.has(name)) return Object.freeze({handled:false});
  if (args.some(value => value == null || (typeof value === 'number' && !Number.isFinite(value)))) {
    return Object.freeze({handled:true,value:Number.NaN});
  }
  const values = args.map(value => Number(value));
  const first = values[0] ?? Number.NaN;
  const second = values[1] ?? Number.NaN;
  let value:number;
  switch(name) {
    case 'abs': value=Math.abs(first); break;
    case 'min': value=Math.min(...values); break;
    case 'max': value=Math.max(...values); break;
    case 'sqrt': value=Math.sqrt(first); break;
    case 'pow': value=Math.pow(first,second); break;
    case 'log': value=Math.log(first); break;
    case 'log10': value=Math.log10(first); break;
    case 'exp': value=Math.exp(first); break;
    case 'round': {
      const precision=Math.trunc(Number(args[1] ?? 0));
      if(!Number.isFinite(precision) || precision < -15 || precision > 15) throw new RangeError('math.round precision must be an integer from -15 through 15.');
      const scale=10 ** precision;
      value=Math.round(first*scale)/scale;
      break;
    }
    case 'sign': value=Math.sign(first); break;
    case 'floor': value=Math.floor(first); break;
    case 'ceil': value=Math.ceil(first); break;
    case 'sin': value=Math.sin(first); break;
    case 'cos': value=Math.cos(first); break;
    case 'tan': value=Math.tan(first); break;
    case 'asin': value=Math.asin(first); break;
    case 'acos': value=Math.acos(first); break;
    case 'atan': value=Math.atan(first); break;
    case 'atan2': value=Math.atan2(first,second); break;
    case 'todegrees': value=first*(180/Math.PI); break;
    case 'toradians': value=first*(Math.PI/180); break;
    case 'tanh': value=Math.tanh(first); break;
    case 'clamp': {
      const minimum=second;
      const maximum=values[2] ?? Number.NaN;
      if(minimum>maximum) throw new RangeError('math.clamp minimum must not exceed maximum.');
      value=Math.min(maximum,Math.max(minimum,first));
      break;
    }
    case 'sigmoid': {
      const scaled=first*Number(args[1] ?? 1);
      value=scaled>=0 ? 1/(1+Math.exp(-scaled)) : Math.exp(scaled)/(1+Math.exp(scaled));
      break;
    }
    case 'avg': value=values.reduce((sum,item)=>sum+item,0)/values.length; break;
    default: return Object.freeze({handled:false});
  }
  return Object.freeze({handled:true,value});
}
