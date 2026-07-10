# Drawing Games

Drawing Games is a home for fast, social drawing games. The first game is
**Dual Draw**: two teams race on separate prompts, with one active drawer and
several guessers per team.

The vector canvas is locally playable at `/games/dual-draw/lab`. A four-seat
browser playtest lives at `/games/dual-draw/room/PLAY1`; it exercises the real
role-safe projection and keyboard-stable layout through an in-memory test
adapter. It is not yet the production Durable Object game loop. The first
network milestone is one complete vertical slice: create a room, join by code,
draft words, draw and guess in real time, refresh the browser, and resume the
same match.

A local word-library console lives at `/admin/words`. It can create custom
collections, add or edit canonical words, derive the Master list, validate
atomic JSON imports, and export a backup. It intentionally uses browser-local
storage until production authentication and durable admin storage exist.

## Why this shape

- **One modular monorepo:** future games share product, identity, UI, and
  protocol foundations without forcing every game to use the same runtime.
- **Next.js web app:** the player-facing site and game UI live in `apps/web`.
- **Cloudflare room service:** `apps/realtime` routes each game code to one
  Durable Object that owns that room's ordered state.
- **Framework-free game rules:** scoring, phases, and validation belong in
  packages that can be tested without a browser or network.
- **Vector drawings:** strokes are data, enabling object erasing, undo, redo,
  reconnect, and the postgame drawing recap.

See [the architecture overview](docs/architecture/overview.md) for the complete
mental model and [the Dual Draw product spec](docs/product/dual-draw.md) for the
proposed rules and unresolved product questions.

## Workspace

```text
apps/
  web/          Next.js player experience
  realtime/     Cloudflare Worker and per-room Durable Object
packages/
  game-core/    Deterministic game state and rules
  drawing-model/Vector stroke operations and undo/redo semantics
  protocol/     Versioned client/server messages and validation
  word-bank/    Canonical catalog, collections, and future generation port
docs/           Product, architecture, decisions, research, and quality gates
```

Applications may depend on packages. Packages must not depend on applications.
A future game that truly needs a different backend may add another deployable
under `apps/`; that is not, by itself, a reason to create another repository.

## Local development

Prerequisites are Node.js 24 and pnpm 11.

```bash
corepack enable
pnpm install
pnpm dev
```

Run the full repository checks with:

```bash
pnpm check
```

Install the local test browsers once, then run the complete browser gate:

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm test:e2e:mobile
```

Focused feedback loops are also available:

```bash
pnpm test:unit
pnpm test:drawing
pnpm test:simulation
pnpm test:integration
pnpm check:all
```

`pnpm test:drawing` checks the vector model, real desktop controls (tap, drag,
object erase, undo, redo, and clear), Android touch, and mobile WebKit touch.
For a visual check, run `pnpm dev`, open
`http://localhost:3000/games/dual-draw/lab`, and draw directly with a mouse,
finger, or pen. The lab is local-only, so this needs no account or API key.
If `pnpm dev` is already running on port 3000, reuse it with
`PLAYWRIGHT_PORT=3000 pnpm test:drawing`.

No external account, API key, database, or paid AI service is required for
local development or tests.

## Decision record

- [ADR 0001: modular monorepo](docs/decisions/0001-modular-monorepo.md)
- [ADR 0002: authoritative room actor](docs/decisions/0002-authoritative-room-actor.md)
- [ADR 0003: vector drawing model](docs/decisions/0003-vector-drawing-model.md)
- [ADR 0004: provider-neutral word-bank generation](docs/decisions/0004-provider-neutral-word-bank-generation.md)
- [ADR 0005: governed word catalog](docs/decisions/0005-governed-word-catalog.md)
- [Testing strategy](docs/quality/testing-strategy.md)
- [Cost and scaling plan](docs/quality/cost-and-scaling.md)
- [AI word-generation quality contract](docs/quality/ai-word-generation.md)
- [Architecture fitness functions](docs/quality/fitness-functions.md)
- [Manual steps and credential status](docs/operations/manual-steps.md)
- [Research sources](docs/research/sources.md)

## Product principle

Optimize first for the moment friends actually feel: drawing appears
immediately, the keyboard does not hide the canvas, and returning from another
app restores the current match. Accounts, AI word generation, public
matchmaking, and additional games come after that experience is dependable.
