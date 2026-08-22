#!/usr/bin/env bash
# Build the browser handoff client and emit JS bindings into ../pwa/public/wasm.
#
# The PWA is a React + Vite app; Vite serves `public/` verbatim, so the module
# lands at /wasm/handoff_wasm.js with its .wasm next to it, which is what
# wasm-bindgen's `--target web` glue expects by default.
#
# Requires:
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli --version 0.2.122   # must match the wasm-bindgen dep
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR=../pwa/public/wasm

cargo build --target wasm32-unknown-unknown --release

mkdir -p "$OUT_DIR"

wasm-bindgen ./target/wasm32-unknown-unknown/release/handoff_wasm.wasm \
  --out-dir "$OUT_DIR" \
  --weak-refs \
  --target web

# Shrink the module — it ships to phones, often on cellular. Optional: without
# binaryen installed we keep the unoptimized artifact rather than failing.
WASM="$OUT_DIR/handoff_wasm_bg.wasm"
if command -v wasm-opt >/dev/null 2>&1; then
  # No --enable-* flags on purpose. wasm-bindgen emits a target-features section
  # and binaryen honours it, so the module keeps exactly the features it needs.
  # Naming features explicitly disables the unnamed ones (that shipped a module
  # with a corrupt function table once); `-all` is worse still, because it turns
  # on compact-imports and emits an encoding engines reject outright with
  # "unknown import kind 0x7f".
  wasm-opt -Os -o "$WASM.opt" "$WASM"
  mv "$WASM.opt" "$WASM"
  echo "wasm-opt: $WASM is now $(wc -c <"$WASM" | tr -d ' ') bytes"

  # Sanity-check the optimised module actually compiles. A wasm-opt flag mix has
  # already shipped a module that only failed at load time in the browser, which
  # is an expensive way to find out. Skipped silently if node is unavailable.
  if command -v node >/dev/null 2>&1; then
    if node --input-type=module -e "
      import fs from 'node:fs'
      new WebAssembly.Module(fs.readFileSync('$WASM'))
    " 2>/dev/null; then
      echo "wasm-opt: module compiles"
    else
      echo "ERROR: the optimised module does not compile; refusing to ship it" >&2
      exit 1
    fi
  fi
else
  echo "WARNING: wasm-opt not found on PATH; shipping the unoptimized module" >&2
  echo "         (roughly 2x larger). Install binaryen to shrink it:" >&2
  echo "           brew install binaryen   # or your platform's package manager" >&2
fi

echo "wrote bindings to $OUT_DIR"
