# ADR 0006: Optimize Canvas 2D before adding GPU or Wasm complexity

## Status

Accepted

## Context

Dual Draw needs immediate local ink on phones, low network delay, object erase,
undo/redo, and reconnectable vector state. The first canvas implementation put
every pointer sample through React state, recopied the growing stroke, and
redrew the complete document. Those costs can grow much faster than the actual
2D rendering work and would not be fixed by changing languages or renderers.

Three.js primarily supplies a 3D scene graph over WebGL. Rust/WebAssembly helps
only when profiling isolates a substantial CPU-bound kernel whose savings
outweigh data conversion and a second toolchain. Neither is currently a product
requirement.

## Decision

- Keep Next.js as the product shell and React as the room/control UI.
- Keep the pointer-to-pixel hot path inside a reusable client component rather
  than React state updates per sample.
- Render vector ink incrementally with Canvas 2D and cap every gesture and
  network batch.
- Keep the drawing model, protocol, and renderer boundaries replaceable so a
  later renderer or Wasm kernel does not alter game rules or room identity.
- Measure the reference workload before changing the stack.

## Upgrade triggers

Consider WebGL or WebGPU only after incremental rendering, bounded point data,
and profiling are in place and paint/raster work still causes local ink to miss
the p95 16 ms or p99 33 ms budgets.

Consider Rust/Wasm only when a stable pure computation—such as polyline
simplification, spatial hit testing, or preview rasterization—dominates the
measured budget after the JavaScript algorithm and data structure are improved.

Consider a separate Vite-based game client only when production measurements
show that Next.js hydration/runtime, rather than application code or the
network, dominates time-to-first-draw on representative phones. That would be a
new deployable in this monorepo, not automatically a new repository.

## Consequences

- The current path has the smallest bundle, compatibility, and maintenance cost
  for ordinary 2D strokes.
- We avoid speculative GPU context loss, shader/tooling, Wasm boundary, and
  duplicated rendering complexity.
- More advanced brushes or very large canvases may eventually justify another
  renderer, but the decision will be supported by traces and the existing
  fitness budgets.

## Current limitation

The drawer sees every pointer sample immediately, but teammates currently
receive each completed gesture as one bounded command. Sending in-progress
chunks is the next latency slice; it must define cancellation, stale-tab, and
reconnect behavior before partial strokes become durable room state.
