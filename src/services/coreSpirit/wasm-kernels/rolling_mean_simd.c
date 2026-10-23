#include <stdint.h>
#include <stddef.h>
#include <wasm_simd128.h>
#define MAX_ELEMENTS 4194304u
#define PAGE_BYTES 65536u
#define ALIGN_UP(v,a) (((v)+(a)-1u)&~((a)-1u))
typedef struct Block { uint32_t size; uint32_t free; uint32_t prev; uint32_t next; } Block;
extern unsigned char __heap_base;
static uint32_t heap_head,heap_tail,heap_top;
static Block *block_at(uint32_t p){return (Block *)(uintptr_t)p;}
static int grow_for(uint32_t bytes){uint32_t pages=(bytes+PAGE_BYTES-1u)/PAGE_BYTES;uint32_t current=(uint32_t)__builtin_wasm_memory_size(0);return pages<=current||__builtin_wasm_memory_grow(0,pages-current)>=0;}
__attribute__((export_name("alloc"))) uint32_t core_spirit_alloc(uint32_t requested){
 uint32_t size=ALIGN_UP(requested?requested:8u,8u);if(size>0x7ffffff0u)return 0;
 if(!heap_top)heap_top=ALIGN_UP((uint32_t)(uintptr_t)&__heap_base,16u);
 for(uint32_t p=heap_head;p;){Block *b=block_at(p);if(b->free&&b->size>=size){uint32_t rem=b->size-size;if(rem>=sizeof(Block)+16u){uint32_t sp=p+(uint32_t)sizeof(Block)+size;Block *s=block_at(sp);s->size=rem-(uint32_t)sizeof(Block);s->free=1;s->prev=p;s->next=b->next;if(b->next)block_at(b->next)->prev=sp;else heap_tail=sp;b->next=sp;b->size=size;}b->free=0;return p+(uint32_t)sizeof(Block);}p=b->next;}
 uint32_t p=heap_top,end=p+(uint32_t)sizeof(Block)+size;if(end<p||!grow_for(end))return 0;
 Block *b=block_at(p);b->size=size;b->free=0;b->prev=heap_tail;b->next=0;if(heap_tail)block_at(heap_tail)->next=p;else heap_head=p;heap_tail=p;heap_top=end;return p+(uint32_t)sizeof(Block);
}
__attribute__((export_name("free"))) void core_spirit_free(uint32_t ptr,uint32_t ignored){
 (void)ignored;if(!ptr||ptr<sizeof(Block))return;uint32_t p=ptr-(uint32_t)sizeof(Block);Block *b=block_at(p);b->free=1;
 if(b->next){Block *n=block_at(b->next);if(n->free&&p+sizeof(Block)+b->size==b->next){b->size+=(uint32_t)sizeof(Block)+n->size;b->next=n->next;if(n->next)block_at(n->next)->prev=p;else heap_tail=p;}}
 if(b->prev){uint32_t pp=b->prev;Block *pr=block_at(pp);if(pr->free&&pp+sizeof(Block)+pr->size==p){pr->size+=(uint32_t)sizeof(Block)+b->size;pr->next=b->next;if(b->next)block_at(b->next)->prev=pp;else heap_tail=pp;}}
}
static int valid_range(uint32_t p,uint32_t n){uint32_t total=(uint32_t)__builtin_wasm_memory_size(0)*PAGE_BYTES;return p<=total&&n<=total-p;}
static double qnan(void){union{uint64_t u;double d;}x;x.u=UINT64_C(0x7ff8000000000000);return x.d;}
static int finite(double x){return __builtin_isfinite(x);}
/* ABI 2: params[0]=operation code, params[1]=period, params[2]=variance ddof (optional).
 * 0 mean SIMD, 1 sum, 2 variance, 3 min, 4 max, 5 standard deviation.
 * A rolling window is emitted only after a full finite window; invalid windows are NaN. */
__attribute__((export_name("runKernel"))) int32_t core_spirit_run_kernel(uint32_t in_table,uint32_t in_count,uint32_t out_table,uint32_t out_count,uint32_t length,uint32_t params_ptr,uint32_t params_count){
 if(in_count!=1u||out_count!=1u||params_count<2u||length>MAX_ELEMENTS)return 1;
 if(!valid_range(in_table,in_count*4u)||!valid_range(out_table,out_count*4u)||!valid_range(params_ptr,params_count*8u))return 2;
 uint32_t ip=((uint32_t *)(uintptr_t)in_table)[0],op=((uint32_t *)(uintptr_t)out_table)[0];
 if(!valid_range(ip,length*8u)||!valid_range(op,length*8u))return 3;
 double *params=(double *)(uintptr_t)params_ptr;double op_value=params[0],period_value=params[1];
 if(!finite(op_value)||op_value<0||op_value>5||op_value!=(double)(uint32_t)op_value)return 4;
 if(!finite(period_value)||period_value<1||period_value>(double)MAX_ELEMENTS||period_value!=(double)(uint32_t)period_value)return 5;
 uint32_t code=(uint32_t)op_value,period=(uint32_t)period_value;uint32_t ddof=0;
 if(params_count>2u){double x=params[2];if(!finite(x)||x<0||x>=(double)period||x!=(double)(uint32_t)x)return 6;ddof=(uint32_t)x;}
 double *input=(double *)(uintptr_t)ip,*output=(double *)(uintptr_t)op;double nan=qnan();for(uint32_t i=0;i<length;i++)output[i]=nan;
 if(!length||period>length)return 0;
 if(code==0u){
  uint32_t bytes=(length+1u)*8u,invalid_bytes=(length+1u)*4u;uint32_t pp=core_spirit_alloc(bytes),vp=core_spirit_alloc(invalid_bytes);
  if(!pp||!vp){if(pp)core_spirit_free(pp,bytes);if(vp)core_spirit_free(vp,invalid_bytes);return 7;}
  double *prefix=(double *)(uintptr_t)pp;uint32_t *invalid=(uint32_t *)(uintptr_t)vp;double anchor=0;
  for(uint32_t i=0;i<length;i++)if(finite(input[i])){anchor=input[i];break;}
  prefix[0]=0;invalid[0]=0;
  for(uint32_t i=0;i<length;i++){int ok=finite(input[i]);prefix[i+1]=prefix[i]+(ok?input[i]-anchor:0);invalid[i+1]=invalid[i]+(ok?0u:1u);}
  v128_t divisor=wasm_f64x2_splat(period_value),base=wasm_f64x2_splat(anchor);uint32_t i=period-1u;
  for(;i+1u<length;i+=2u){v128_t right=wasm_v128_load(&prefix[i+1u]);v128_t left=wasm_v128_load(&prefix[i+1u-period]);v128_t means=wasm_f64x2_add(wasm_f64x2_div(wasm_f64x2_sub(right,left),divisor),base);wasm_v128_store(&output[i],means);if(invalid[i+1u]!=invalid[i+1u-period])output[i]=nan;if(invalid[i+2u]!=invalid[i+2u-period])output[i+1u]=nan;}
  for(;i<length;i++)if(invalid[i+1u]==invalid[i+1u-period])output[i]=(prefix[i+1u]-prefix[i+1u-period])/period_value+anchor;
  core_spirit_free(pp,bytes);core_spirit_free(vp,invalid_bytes);return 0;
 }
 if(code==1u){double sum=0;uint32_t invalid=0;for(uint32_t i=0;i<length;i++){double v=input[i];if(finite(v))sum+=v;else invalid++;if(i>=period){double leaving=input[i-period];if(finite(leaving))sum-=leaving;else invalid--;}if(i+1u>=period&&invalid==0)output[i]=sum;}return 0;}
 if(code==2u||code==5u){uint32_t count=0,invalid=0;double mean=0,m2=0;for(uint32_t i=0;i<length;i++){if(i>=period){double leaving=input[i-period];if(finite(leaving)){if(count<=1u){count=0;mean=0;m2=0;}else{uint32_t nc=count-1u;double nm=((double)count*mean-leaving)/(double)nc;m2-=(leaving-mean)*(leaving-nm);mean=nm;count=nc;if(m2<0&&__builtin_fabs(m2)<=2.2204460492503131e-16*(((m2<0?-m2:m2)>1.0?(m2<0?-m2:m2):1.0))*(double)count*32.0)m2=0;}}else if(invalid)invalid--;}
  double v=input[i];if(finite(v)){count++;double delta=v-mean;mean+=delta/(double)count;m2+=delta*(v-mean);}else invalid++;
  if(i+1u>=period&&invalid==0&&count==period){double centered=m2;if(centered<0)centered=0;double v2=centered/(double)(period-ddof);output[i]=code==5u?__builtin_sqrt(v2):v2;}}
  return 0;
 }
 if(code==3u||code==4u){uint32_t bytes=length*4u,dp=core_spirit_alloc(bytes);if(!dp)return 7;uint32_t *deque=(uint32_t *)(uintptr_t)dp;uint32_t head=0,tail=0,invalid=0;
  for(uint32_t i=0;i<length;i++){double v=input[i];if(finite(v)){while(tail>head){uint32_t last=deque[tail-1u];double lv=input[last];if(code==3u?lv<v:lv>v)break;tail--;}deque[tail++]=i;}else invalid++;
   if(i>=period){double leaving=input[i-period];if(!finite(leaving)&&invalid)invalid--;if(tail>head&&deque[head]==i-period)head++;}
   if(i+1u>=period&&invalid==0&&tail>head)output[i]=input[deque[head]];}
  core_spirit_free(dp,bytes);return 0;
 }
 return 8;
}
