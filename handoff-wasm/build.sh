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
  # `-all` on purpose. Naming individual --enable-* flags DISABLES every feature
  # not listed, and older binaryen then strips ones wasm-bindgen's glue relies on
  # (call-indirect-overlong, reference types). That corrupts the function table and
  # the module dies at init with:
  #   WebAssembly.Table.set(): Argument 1 is invalid for table:
  #   function-typed object must be null (if nullable) or a Wasm function object
  wasm-opt -all -Os -o "$WASM.opt" "$WASM"
  mv "$WASM.opt" "$WASM"
  echo "wasm-opt: $WASM is now $(wc -c <"$WASM" | tr -d ' ') bytes"
else
  echo "WARNING: wasm-opt not found on PATH; shipping the unoptimized module" >&2
  echo "         (roughly 2x larger). Install binaryen to shrink it:" >&2
  echo "           brew install binaryen   # or your platform's package manager" >&2
fi

echo "wrote bindings to $OUT_DIR"
