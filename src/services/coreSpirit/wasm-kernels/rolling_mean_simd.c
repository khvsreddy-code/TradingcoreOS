#include <stdint.h>
#include <stddef.h>
#include <wasm_simd128.h>
#define MAX_ELEMENTS 4194304u
#define PAGE_BYTES 65536u
#define UP(v,a) (((v)+(a)-1u)&~((a)-1u))
typedef struct Block { uint32_t size, free, prev, next; } Block;
extern unsigned char __heap_base;
static uint32_t first=0,last=0,top=0;
static Block *at(uint32_t p){return (Block*)(uintptr_t)p;}
static int ensure(uint32_t end){uint32_t pages=(uint32_t)__builtin_wasm_memory_size(0);uint32_t need=(end+PAGE_BYTES-1u)/PAGE_BYTES;if(need<=pages)return 1;return __builtin_wasm_memory_grow(0,need-pages)>=0;}
__attribute__((export_name("alloc"))) uint32_t core_alloc(uint32_t n){
 uint32_t size=UP(n?n:8u,8u);if(size>0x7ffffff0u)return 0;if(!top)top=UP((uint32_t)(uintptr_t)&__heap_base,16u);
 for(uint32_t p=first;p;){Block*b=at(p);if(b->free&&b->size>=size){uint32_t remain=b->size-size;if(remain>=sizeof(Block)+16u){uint32_t q=p+sizeof(Block)+size;Block*z=at(q);z->size=remain-sizeof(Block);z->free=1;z->prev=p;z->next=b->next;if(b->next)at(b->next)->prev=q;else last=q;b->next=q;b->size=size;}b->free=0;return p+sizeof(Block);}p=b->next;}
 uint32_t p=top,end=p+sizeof(Block)+size;if(end<p||!ensure(end))return 0;Block*b=at(p);b->size=size;b->free=0;b->prev=last;b->next=0;if(last)at(last)->next=p;else first=p;last=p;top=end;return p+sizeof(Block);
}
__attribute__((export_name("free"))) void core_free(uint32_t ptr,uint32_t ignored){
 (void)ignored;if(!ptr||ptr<sizeof(Block))return;uint32_t p=ptr-sizeof(Block);Block*b=at(p);b->free=1;
 if(b->next){Block*n=at(b->next);if(n->free&&p+sizeof(Block)+b->size==b->next){b->size+=sizeof(Block)+n->size;b->next=n->next;if(n->next)at(n->next)->prev=p;else last=p;}}
 if(b->prev){uint32_t q=b->prev;Block*prev=at(q);if(prev->free&&q+sizeof(Block)+prev->size==p){prev->size+=sizeof(Block)+b->size;prev->next=b->next;if(b->next)at(b->next)->prev=q;else last=q;}}
}
static int valid(uint32_t p,uint32_t bytes){uint32_t total=(uint32_t)__builtin_wasm_memory_size(0)*PAGE_BYTES;return p<=total&&bytes<=total-p;}
static double qnan(void){union{uint64_t u;double d;}x;x.u=UINT64_C(0x7ff8000000000000);return x.d;}
/* ABI: input pointer table, input count, output pointer table, output count,
   output length, float64 params pointer and parameter count. */
__attribute__((export_name("runKernel"))) int32_t run_kernel(uint32_t in_table,uint32_t in_count,uint32_t out_table,uint32_t out_count,uint32_t n,uint32_t params,uint32_t param_count){
 if(in_count!=1u||out_count!=1u||param_count<1u||n>MAX_ELEMENTS)return 1;
 if(!valid(in_table,in_count*4u)||!valid(out_table,out_count*4u)||!valid(params,param_count*8u))return 2;
 uint32_t ip=((uint32_t*)(uintptr_t)in_table)[0],op=((uint32_t*)(uintptr_t)out_table)[0];
 if(!valid(ip,n*8u)||!valid(op,n*8u))return 3;
 double pv=((double*)(uintptr_t)params)[0];if(!(pv>=1.0)||pv>(double)MAX_ELEMENTS||pv!=(double)(uint32_t)pv)return 4;
 uint32_t period=(uint32_t)pv;double*input=(double*)(uintptr_t)ip;double*output=(double*)(uintptr_t)op;double nan=qnan();
 for(uint32_t i=0;i<n;i++)output[i]=nan;
 if(n==0u||period>n)return 0;
 double anchor=0.0;for(uint32_t i=0;i<n;i++){if(__builtin_isfinite(input[i])){anchor=input[i];break;}}
 uint32_t sum_bytes=(n+1u)*8u,bad_bytes=(n+1u)*4u;
 uint32_t sum_ptr=core_alloc(sum_bytes),bad_ptr=core_alloc(bad_bytes);
 if(!sum_ptr||!bad_ptr){if(sum_ptr)core_free(sum_ptr,sum_bytes);if(bad_ptr)core_free(bad_ptr,bad_bytes);return 5;}
 double*prefix=(double*)(uintptr_t)sum_ptr;uint32_t*bad=(uint32_t*)(uintptr_t)bad_ptr;prefix[0]=0.0;bad[0]=0u;
 for(uint32_t i=0;i<n;i++){double x=input[i];int finite=__builtin_isfinite(x);prefix[i+1u]=prefix[i]+(finite?x-anchor:0.0);bad[i+1u]=bad[i]+(finite?0u:1u);}
 const v128_t divisor=wasm_f64x2_splat(pv),base=wasm_f64x2_splat(anchor);uint32_t i=period-1u;
 for(;i+1u<n;i+=2u){
  v128_t right=wasm_v128_load(&prefix[i+1u]);v128_t left=wasm_v128_load(&prefix[i+1u-period]);
  v128_t average=wasm_f64x2_add(wasm_f64x2_div(wasm_f64x2_sub(right,left),divisor),base);wasm_v128_store(&output[i],average);
  if(bad[i+1u]!=bad[i+1u-period])output[i]=nan;
  if(bad[i+2u]!=bad[i+2u-period])output[i+1u]=nan;
 }
 for(;i<n;i++){if(i+1u<period)continue;if(bad[i+1u]!=bad[i+1u-period])continue;output[i]=(prefix[i+1u]-prefix[i+1u-period])/pv+anchor;}
 core_free(sum_ptr,sum_bytes);core_free(bad_ptr,bad_bytes);return 0;
}
