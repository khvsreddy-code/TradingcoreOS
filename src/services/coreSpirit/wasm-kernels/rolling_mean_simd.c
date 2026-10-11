#include <stdint.h>
#include <stddef.h>
#include <wasm_simd128.h>

#define MAX_ELEMENTS 4194304u
#define WASM_PAGE_BYTES 65536u
#define ALIGN_UP(value, alignment) (((value) + (alignment) - 1u) & ~((alignment) - 1u))

typedef struct HeapBlock {
  uint32_t size;
  uint32_t is_free;
  uint32_t prev;
  uint32_t next;
} HeapBlock;

extern unsigned char __heap_base;

static uint32_t heap_head = 0;
static uint32_t heap_tail = 0;
static uint32_t heap_top = 0;

static HeapBlock *block_at(uint32_t offset) {
  return (HeapBlock *)(uintptr_t)offset;
}

static int ensure_memory(uint32_t required_bytes) {
  const uint32_t current_pages = (uint32_t)__builtin_wasm_memory_size(0);
  const uint32_t required_pages = (required_bytes + WASM_PAGE_BYTES - 1u) / WASM_PAGE_BYTES;
  if (required_pages <= current_pages) return 1;
  return __builtin_wasm_memory_grow(0, required_pages - current_pages) >= 0;
}

/* A small coalescing allocator keeps repeated historical kernel calls bounded. */
__attribute__((export_name("alloc"))) uint32_t core_spirit_alloc(uint32_t requested_bytes) {
  const uint32_t size = ALIGN_UP(requested_bytes ? requested_bytes : 8u, 8u);
  if (size > 0x7ffffff0u) return 0;
  if (heap_top == 0) {
    heap_top = ALIGN_UP((uint32_t)(uintptr_t)&__heap_base, 16u);
  }

  for (uint32_t offset = heap_head; offset != 0;) {
    HeapBlock *block = block_at(offset);
    if (block->is_free && block->size >= size) {
      const uint32_t remainder = block->size - size;
      if (remainder >= sizeof(HeapBlock) + 16u) {
        const uint32_t split_offset = offset + (uint32_t)sizeof(HeapBlock) + size;
        HeapBlock *split = block_at(split_offset);
        split->size = remainder - (uint32_t)sizeof(HeapBlock);
        split->is_free = 1;
        split->prev = offset;
        split->next = block->next;
        if (block->next != 0) block_at(block->next)->prev = split_offset;
        else heap_tail = split_offset;
        block->next = split_offset;
        block->size = size;
      }
      block->is_free = 0;
      return offset + (uint32_t)sizeof(HeapBlock);
    }
    offset = block->next;
  }

  const uint32_t block_offset = heap_top;
  const uint32_t end_offset = block_offset + (uint32_t)sizeof(HeapBlock) + size;
  if (end_offset < block_offset || !ensure_memory(end_offset)) return 0;

  HeapBlock *block = block_at(block_offset);
  block->size = size;
  block->is_free = 0;
  block->prev = heap_tail;
  block->next = 0;
  if (heap_tail != 0) block_at(heap_tail)->next = block_offset;
  else heap_head = block_offset;
  heap_tail = block_offset;
  heap_top = end_offset;
  return block_offset + (uint32_t)sizeof(HeapBlock);
}

__attribute__((export_name("free"))) void core_spirit_free(uint32_t pointer, uint32_t ignored_size) {
  (void)ignored_size;
  if (pointer == 0 || pointer < sizeof(HeapBlock)) return;

  const uint32_t offset = pointer - (uint32_t)sizeof(HeapBlock);
  HeapBlock *block = block_at(offset);
  block->is_free = 1;

  if (block->next != 0) {
    HeapBlock *next = block_at(block->next);
    if (next->is_free && offset + sizeof(HeapBlock) + block->size == block->next) {
      block->size += (uint32_t)sizeof(HeapBlock) + next->size;
      block->next = next->next;
      if (next->next != 0) block_at(next->next)->prev = offset;
      else heap_tail = offset;
    }
  }

  if (block->prev != 0) {
    const uint32_t previous_offset = block->prev;
    HeapBlock *previous = block_at(previous_offset);
    if (previous->is_free && previous_offset + sizeof(HeapBlock) + previous->size == offset) {
      previous->size += (uint32_t)sizeof(HeapBlock) + block->size;
      previous->next = block->next;
      if (block->next != 0) block_at(block->next)->prev = previous_offset;
      else heap_tail = previous_offset;
    }
  }
}

static int valid_memory_range(uint32_t pointer, uint32_t bytes) {
  const uint32_t total_bytes = (uint32_t)__builtin_wasm_memory_size(0) * WASM_PAGE_BYTES;
  return pointer <= total_bytes && bytes <= total_bytes - pointer;
}

static double quiet_nan(void) {
  union {
    uint64_t bits;
    double value;
  } number;
  number.bits = UINT64_C(0x7ff8000000000000);
  return number.value;
}

/* ABI: input pointer table/count, output pointer table/count, bar count,
   float64 parameter pointer/count. Current bundled module exports rollingMean. */
__attribute__((export_name("runKernel"))) int32_t core_spirit_run_kernel(
    uint32_t input_table_pointer,
    uint32_t input_count,
    uint32_t output_table_pointer,
    uint32_t output_count,
    uint32_t length,
    uint32_t parameters_pointer,
    uint32_t parameters_count) {
  if (input_count != 1u || output_count != 1u || parameters_count < 1u || length > MAX_ELEMENTS) return 1;
  if (!valid_memory_range(input_table_pointer, input_count * 4u) ||
      !valid_memory_range(output_table_pointer, output_count * 4u) ||
      !valid_memory_range(parameters_pointer, parameters_count * 8u)) return 2;

  const uint32_t input_pointer = ((uint32_t *)(uintptr_t)input_table_pointer)[0];
  const uint32_t output_pointer = ((uint32_t *)(uintptr_t)output_table_pointer)[0];
  if (!valid_memory_range(input_pointer, length * 8u) ||
      !valid_memory_range(output_pointer, length * 8u)) return 3;

  const double period_value = ((double *)(uintptr_t)parameters_pointer)[0];
  if (!(period_value >= 1.0) || period_value > (double)MAX_ELEMENTS ||
      period_value != (double)(uint32_t)period_value) return 4;

  const uint32_t period = (uint32_t)period_value;
  double *input = (double *)(uintptr_t)input_pointer;
  double *output = (double *)(uintptr_t)output_pointer;
  const double nan = quiet_nan();
  for (uint32_t index = 0; index < length; ++index) output[index] = nan;
  if (length == 0u || period > length) return 0;

  /* Center prefix sums to preserve precision for high price-level instruments. */
  double anchor = 0.0;
  for (uint32_t index = 0; index < length; ++index) {
    if (__builtin_isfinite(input[index])) {
      anchor = input[index];
      break;
    }
  }

  const uint32_t prefix_sum_bytes = (length + 1u) * 8u;
  const uint32_t invalid_count_bytes = (length + 1u) * 4u;
  const uint32_t prefix_pointer = core_spirit_alloc(prefix_sum_bytes);
  const uint32_t invalid_pointer = core_spirit_alloc(invalid_count_bytes);
  if (prefix_pointer == 0 || invalid_pointer == 0) {
    if (prefix_pointer != 0) core_spirit_free(prefix_pointer, prefix_sum_bytes);
    if (invalid_pointer != 0) core_spirit_free(invalid_pointer, invalid_count_bytes);
    return 5;
  }

  double *prefix = (double *)(uintptr_t)prefix_pointer;
  uint32_t *invalid = (uint32_t *)(uintptr_t)invalid_pointer;
  prefix[0] = 0.0;
  invalid[0] = 0u;
  for (uint32_t index = 0; index < length; ++index) {
    const double value = input[index];
    const int finite = __builtin_isfinite(value);
    prefix[index + 1u] = prefix[index] + (finite ? value - anchor : 0.0);
    invalid[index + 1u] = invalid[index] + (finite ? 0u : 1u);
  }

  /* SIMD calculates two adjacent moving means per iteration. Invalid windows
     are overwritten with NaN to match CoreSpirit's CPU semantic reference. */
  const v128_t divisor = wasm_f64x2_splat(period_value);
  const v128_t base = wasm_f64x2_splat(anchor);
  uint32_t index = period - 1u;
  for (; index + 1u < length; index += 2u) {
    const v128_t right = wasm_v128_load(&prefix[index + 1u]);
    const v128_t left = wasm_v128_load(&prefix[index + 1u - period]);
    const v128_t averages = wasm_f64x2_add(wasm_f64x2_div(wasm_f64x2_sub(right, left), divisor), base);
    wasm_v128_store(&output[index], averages);
    if (invalid[index + 1u] != invalid[index + 1u - period]) output[index] = nan;
    if (invalid[index + 2u] != invalid[index + 2u - period]) output[index + 1u] = nan;
  }

  for (; index < length; ++index) {
    if (index + 1u < period) continue;
    if (invalid[index + 1u] != invalid[index + 1u - period]) continue;
    output[index] = (prefix[index + 1u] - prefix[index + 1u - period]) / period_value + anchor;
  }

  core_spirit_free(prefix_pointer, prefix_sum_bytes);
  core_spirit_free(invalid_pointer, invalid_count_bytes);
  return 0;
}
