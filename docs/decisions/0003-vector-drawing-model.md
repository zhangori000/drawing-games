# ADR 0003: Represent drawings as vector operations

- Status: Accepted
- Date: 2026-07-10

## Context

The product requires object erasing, undo, redo, clear, low-latency fan-out,
refresh recovery, opponent previews, replay, and a postgame drawing recap. A
canvas bitmap is a rendering result; by itself it cannot explain which stroke
to erase or which action to undo.

Only one active drawer writes to each team canvas in the first version. That
makes a server-ordered operation stream sufficient; a multi-writer CRDT would
add complexity without solving a current problem.

## Decision

Store drawing intent as normalized vector data and semantic operations. A
stroke has a stable ID, author, tool attributes, normalized points, and a
canonical server order. Initial operation vocabulary:

```text
stroke.begin
stroke.append
stroke.end
stroke.delete
stroke.restore
canvas.clear
action.undo
action.redo
```

The reducer defines visibility; renderers do not mutate history. Object erase
hit-tests strokes and emits a delete operation. Undo targets the latest eligible
semantic action by the active drawer, including erase and clear. Redo remains
available until a new forward action creates a branch. Clear is an operation,
not destructive loss of the prior stroke set.

Coordinates are stored relative to the logical canvas, not device pixels, so a
drawing survives different screens and orientation. Color, width, pressure,
and future tool fields are versioned and bounded.

## Fast path

1. Pointer Events feed a local in-progress stroke.
2. The client renders it immediately without waiting for the network.
3. Points are resampled and batched every 20–40 ms or at a count/byte cap.
4. The room validates role, phase, limits, and operation ID; it assigns
   canonical order and broadcasts to that team's viewers.
5. Server confirmation reconciles the optimistic operation. Rejection removes
   or corrects it.

The client monitors `WebSocket.bufferedAmount`. Above a soft limit it increases
point simplification and coalesces unsent append batches; above a hard limit it
ends the stroke safely and reconnects rather than consuming unbounded memory.
Exact thresholds are fitness-function parameters, not protocol guarantees.

## Persistence and recovery

Completed strokes and semantic edits are persisted in batches. Periodic vector
snapshots compact old operations; a bounded tail supports reconnect and replay.
An incomplete pointer stroke may be lost on crash or refresh, but completed
strokes, erase, undo, redo, and clear must survive actor eviction.

Operation IDs make retransmission idempotent. The protocol must tolerate an
older reader ignoring optional new tool fields without changing existing field
meaning.

## Opponent preview

Do not send raw opponent vectors and rely on a CSS blur. The room derives a
coarse occupancy/color grid, updates it at low frequency, and sends only that
projection. The browser may blur or pixelate it further. The preview therefore
cannot be made sharp merely by editing client CSS or replaying raw messages.

This reduces, but cannot eliminate, gameplay clues. Preview strength remains a
pregame setting.

## Resource limits

The protocol and server enforce maximum message bytes, points per append,
points per stroke, strokes per round, coordinate ranges, and allowed tool
values. Point simplification and snapshot compaction keep long drawings from
becoming an accidental memory or storage denial of service.

## Consequences

### Positive

- Object erase, undo/redo, reversible clear, scaling, and replay are natural.
- Drawings can be reconstructed after refresh without image diffs.
- The postgame recap and statistics can reason about strokes and actions.
- Network messages are usually smaller than repeatedly sending bitmaps.

### Negative

- Every client must render the same versioned semantics consistently.
- Hit testing, history compaction, and optimistic reconciliation require care.
- Very long point streams need explicit simplification and admission control.
- Exact visual reproduction across renderers needs golden tests.

## Alternatives considered

- **Bitmap snapshots:** simple to render, but poor for object erase, history,
  bandwidth, and replay.
- **Pixel/tile diffs:** can reduce bitmap traffic but still lose semantic
  actions and make undo expensive.
- **CRDT drawing document:** useful for simultaneous multi-writer canvases and
  offline merging; unnecessary while each canvas has one authoritative writer
  and one ordered room actor.

## Revisit when

- a game requires several offline or concurrent drawers on the same canvas;
- vector rendering cannot meet measured device performance after simplification;
- brushes require raster effects whose semantics cannot be represented
  compactly; or
- storage/replay cost exceeds the defined budget.

Research rationale: [sources.md](../research/sources.md), especially the DDIA
encoding/distributed-systems guidance and browser Pointer/WebSocket references.
