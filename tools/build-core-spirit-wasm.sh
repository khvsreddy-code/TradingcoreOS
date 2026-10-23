#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CLANG_BIN="${CLANG:-clang}"
mkdir -p "$ROOT/public/coreSpirit"
"$CLANG_BIN" --target=wasm32-unknown-unknown -Oz -flto -msimd128 -nostdlib \
  -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=131072 -Wl,--max-memory=268435456 \
  -o "$ROOT/public/coreSpirit/numerical-kernels-simd.wasm" \
  "$ROOT/src/services/coreSpirit/wasm-kernels/rolling_mean_simd.c"
