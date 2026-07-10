# ADR 0001: Use a modular monorepo

- Status: Accepted
- Date: 2026-07-10

## Context

Drawing Games is one product that may host many games. Those games will share
navigation, identity, design language, room codes, observability, and some
protocol concepts, but a future game may need a different realtime or storage
model.

Splitting repositories now would make ordinary cross-cutting changes slower and
would not remove runtime coupling by itself. Conversely, putting all rules in a
single application would make the first game quick to start but increasingly
hard to reason about or extract.

Repository topology and runtime topology are separate choices: one repository
can build several independently deployed applications.

## Decision

Use one pnpm/Turborepo monorepo with explicit domain and infrastructure
boundaries:

```text
apps/web             player-facing Next.js application
apps/realtime        Cloudflare realtime room application
packages/game-core   deterministic shared game primitives and Dual Draw rules
packages/drawing-model
packages/protocol
```

Future games start as their own rules module/package and reuse the existing apps
where appropriate. If a game proves that it needs a different runtime, add a
separate deployable under `apps/` while keeping versioned package contracts.

Do not create an empty `packages/games/shared` framework before a second game
provides evidence of genuine commonality. Dual Draw remains cohesive in
`game-core` for the first playable loop. When game two arrives, move each game's
rules behind an explicit game contract and extract only behavior used by both:

```text
packages/games/dual-draw
packages/games/<second-game>
packages/game-kernel        # only proven shared contracts and primitives
```

This is a compatibility-preserving package migration, not a repository split.

Do not create a service or repository merely because a noun exists. Extract a
physical boundary only when an independently measured need—scaling, release
cadence, security isolation, technology, data ownership, or team ownership—pays
for network and operational complexity.

## Dependency rules

- Applications may depend on packages; packages may not depend on applications.
- Game rules may depend on stable domain types, not React, Next.js, Cloudflare,
  sockets, wall clocks, or databases.
- The drawing model does not import room transport.
- The protocol exposes public messages, not internal aggregate objects.
- Game packages do not import one another's internals.

## Consequences

### Positive

- One change can update a rule, contract, server, client, and test atomically.
- Shared tooling and types reduce setup cost while the product is small.
- Logical game boundaries become extraction seams without prepaying for RPC.
- A future game can still use another deployment architecture.

### Negative

- Cross-package imports are easy, so boundaries require automated checks.
- CI can become slow as games accumulate and will need affected-task caching.
- A shared release can accidentally couple apps unless contracts and deployment
  workflows remain explicit.

## Compliance

- Static dependency checks forbid imports against the direction above.
- Each game-core package must run tests without application dependencies.
- Cycles between top-level packages fail CI.
- Any new app, database, queue, cache, AI provider, or repository requires an
  ADR naming the measured need and operational owner.

## Revisit when

- a game requires independent security or legal ownership;
- repository access control cannot safely express team boundaries;
- unrelated apps routinely block one another's delivery despite affected builds;
- a package has a stable external consumer and needs its own lifecycle; or
- measured operational needs justify another deployable. A new deployable does
  not automatically justify a new repository.

Research rationale: [sources.md](../research/sources.md), especially the modular
monolith, architecture-style selection, and microservices references.
