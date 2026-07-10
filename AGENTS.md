# Drawing Games project guidance

## Product center

This is a game platform, starting with the simultaneous two-team drawing game
described in `docs/product/dual-draw.md`. Preserve a smooth mobile drawing
experience and reconnectability before adding breadth.

## Architecture boundaries

- Keep game rules deterministic and framework-free in `packages/game-core`.
- Keep vector drawing operations in `packages/drawing-model`.
- Keep the versioned network contract in `packages/protocol`.
- Apps may depend on packages. Packages must never depend on apps.
- The room server is authoritative for phases, deadlines, roles, guesses, and
  points. Never trust a client clock or reconnect retry as unique.
- A WebSocket connection is transport, not player identity. Refreshing or
  backgrounding the browser must preserve room membership.
- Do not add a database, queue, cache, AI provider, or microservice without a
  concrete measured need and an architecture decision record.

## Development

- Use pnpm from the repository root.
- Add tests with business-rule changes, especially scoring and state-machine
  transitions.
- Do not commit or push unless the user asks.
