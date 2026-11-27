/**
 * Deterministic Pine v6 color kernels. Vela-facing colors are canonical
 * #RRGGBBAA strings; Pine transparency 0..100 maps to the CSS alpha byte.
 */
type PineColorExecution = Readonly<{ handled: boolean; value?: unknown }>;
type RGBA = Readonly<{ r:number; g:number; b:number; a:number }>;
const PINE_COLOR_NAMES: Readonly<Record<string,string>> = Object.freeze({
  aqua:'#00BCD4', black:'#363A45', blue:'#2196F3', fuchsia:'#E040FB',
  gray:'#787B86', green:'#4CAF50', lime:'#00E676', maroon:'#880E4F',
  navy:'#311B92', olive:'#808000', orange:'#FF9800', purple:'#9C27B0',
  red:'#F23645', silver:'#B2B5BE', teal:'#089981', white:'#FFFFFF',
  yellow:'#FDD835',
});
function clamp(value:number,min:number,max:number):number { return Math.min(max,Math.max(min,value)); }
function channel(value:unknown,name:string,min=0,max=255):number {
  const number=Number(value);
  if(!Number.isFinite(number)) throw new TypeError(name+' expects finite numeric channels');
  return Math.round(clamp(number,min,max));
}
function hexByte(value:number):string { return value.toString(16).padStart(2,'0').toUpperCase(); }
function encodeColor(value:RGBA):string { return '#'+hexByte(value.r)+hexByte(value.g)+hexByte(value.b)+hexByte(value.a); }
function parseColor(value:unknown):RGBA|null {
  if(value==null) return null;
  if(typeof value!=='string') throw new TypeError('Pine color functions expect a color string');
  let source=value.trim();
  if(source.startsWith('color.')) source=source.slice(6);
  const named=PINE_COLOR_NAMES[source.toLowerCase()];
  if(named) source=named;
  const hex=source.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if(hex) {
    let digits=hex[1]!;
    if(digits.length===3||digits.length===4) digits=[...digits].map(char=>char+char).join('');
    if(digits.length===6) digits+='FF';
    return {r:parseInt(digits.slice(0,2),16),g:parseInt(digits.slice(2,4),16),b:parseInt(digits.slice(4,6),16),a:parseInt(digits.slice(6,8),16)};
  }
  const rgba=source.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i);
  if(rgba) return {
    r:channel(rgba[1], 'color.rgb'),g:channel(rgba[2], 'color.rgb'),b:channel(rgba[3], 'color.rgb'),
    a:rgba[4]===undefined?255:Math.round(clamp(Number(rgba[4]),0,1)*255),
  };
  throw new TypeError('Unsupported Pine color representation: '+value);
}
function withTransparency(color:RGBA,transparency:number):RGBA {
  return {...color,a:Math.round(255*(1-clamp(transparency,0,100)/100))};
}
function execute(name:string,args:readonly unknown[]):unknown {
  switch(name) {
    case 'pine.color.rgb': {
      const r=channel(args[0],name),g=channel(args[1],name),b=channel(args[2],name);
      const t=args[3]===undefined?0:Number(args[3]);
      if(!Number.isFinite(t)) throw new TypeError(name+' transparency must be finite');
      return encodeColor(withTransparency({r,g,b,a:255},t));
    }
    case 'pine.color.new': {
      const base=parseColor(args[0]);
      if(!base) return null;
      const t=Number(args[1]);
      if(!Number.isFinite(t)) throw new TypeError(name+' transparency must be finite');
      return encodeColor(withTransparency(base,t));
    }
    case 'pine.color.from_gradient': {
      const value=Number(args[0]),bottom=Number(args[1]),top=Number(args[2]);
      const c0=parseColor(args[3]),c1=parseColor(args[4]);
      if(![value,bottom,top].every(Number.isFinite)||!c0||!c1) return null;
      const ratio=top===bottom?0:clamp((value-bottom)/(top-bottom),0,1);
      return encodeColor({
        r:Math.round(c0.r+(c1.r-c0.r)*ratio),
        g:Math.round(c0.g+(c1.g-c0.g)*ratio),
        b:Math.round(c0.b+(c1.b-c0.b)*ratio),
        a:Math.round(c0.a+(c1.a-c0.a)*ratio),
      });
    }
    case 'pine.color.r': case 'pine.color.g': case 'pine.color.b': case 'pine.color.t': {
      const color=parseColor(args[0]);
      if(!color) return null;
      if(name==='pine.color.r') return color.r;
      if(name==='pine.color.g') return color.g;
      if(name==='pine.color.b') return color.b;
      return (1-color.a/255)*100;
    }
    default: return undefined;
  }
}
const PINE_COLOR_BUILTINS=new Set([
  'pine.color.rgb','pine.color.new','pine.color.from_gradient',
  'pine.color.r','pine.color.g','pine.color.b','pine.color.t',
]);
export function executeCoreSpiritPineColorBuiltin(name:string,args:readonly unknown[]):PineColorExecution {
  if(!PINE_COLOR_BUILTINS.has(name)) return Object.freeze({handled:false});
  return Object.freeze({handled:true,value:execute(name,args)});
}
