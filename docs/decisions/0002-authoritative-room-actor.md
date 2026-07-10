# ADR 0002: Use one authoritative room actor per game room

- Status: Accepted
- Date: 2026-07-10

## Context

Dual Draw has tightly related, time-sensitive invariants: only the current
drawer may draw, guesses must arrive before a deadline, each team's prompt must
remain secret from its guessers, points must be awarded once, and refresh must
restore the same player. Distributing those decisions across clients or several
stateless servers would introduce ordering, locking, pub/sub, and retry
ambiguity before the product has proven demand.

Cloudflare Durable Objects provide a natural coordination unit for a room, with
private strongly consistent storage, WebSocket support, and alarms. Rooms are
independent, so the product scales by creating many room objects rather than
one global coordinator.

## Decision

Map each unguessable internal `roomId` to one `RoomActor` Durable Object. The
human-friendly game code resolves to that ID but is not an authentication
secret.

The room actor is authoritative for:

- membership, teams, roles, ready state, and connection generations;
- settings, independent drawer rotation and drafts, and prompt secrecy;
- phase transitions and absolute server deadlines;
- accepted guesses, round results, scoring, surrender, and rematch;
- canonical drawing-operation ordering and role-specific projections; and
- monotonically increasing `roomVersion` and `serverSeq` values.

Clients send commands. They may optimistically render their own ink, but they
never authoritatively mutate game state.

## Identity is not a socket

Joining creates a stable `playerId` and a random room-scoped `resumeToken`. The
server stores a token hash. A connection handshake binds the current socket to
that player and assigns a new connection generation; commands from an older
generation are rejected.

A reconnect includes the last applied `serverSeq`. The actor returns either the
missing bounded event tail or a fresh role-specific snapshot. Closing a socket
changes presence, not membership. A logged-in account may later recover or link
room membership, but account identity is not the live-room consistency key.

## Ordering, retries, and time

Every command includes a `clientCommandId`. Game commands retain a bounded
deduplication record; drawing operation IDs are intrinsically idempotent.
Retries therefore cannot score twice or duplicate a stroke when the client does
not know whether a reply was lost.

The actor persists `phaseStartedAt` and `phaseDeadlineAt`. The client countdown
is only a view. Before handling a command, the actor advances expired phases;
an alarm provides eventual progress when the room is otherwise quiet. A delayed
alarm may delay the broadcast, but it cannot make a late guess valid.

Use monotonic durations inside one execution when available, but use persisted
server timestamps for cross-restart deadlines. Never compare competing client
clocks.

## Persistence model

Persist the current room snapshot plus a bounded event/reconnect tail. This is
not full event sourcing.

Persist before announcing changes that affect membership, secrets, phase,
deadlines, guesses, score, rotation, surrender, or rematch. Batch completed
drawing actions and checkpoint canvases. Presence and an unfinished pointer
stroke may be reconstructed or discarded.

The actor must restore solely from storage after eviction or deployment; its
in-memory state is a cache.

## Projections and secrecy

The canonical room state is never broadcast wholesale. The actor builds a view
for each role and for the configured opponent-draft visibility mode. Each final
answer is available only to that team's active drawer; the owning team's
guessers never receive it. Raw opponent vectors are never sent during the
round; the optional opponent preview is a coarse derived stream.

## Consequences

### Positive

- One ordering authority makes game invariants and duplicate handling tractable.
- There is no external Redis lock, room pub/sub bus, or sticky load balancer.
- Failure recovery has a single durable state boundary.
- Rooms shard naturally and one noisy room does not own global state.

### Negative

- Each room's throughput and memory are bounded by one Durable Object.
- The realtime backend is coupled to Cloudflare APIs and failure semantics.
- Cross-room queries, global leaderboards, and matchmaking need separate read
  models or services; they must not turn one global actor into a bottleneck.
- Role-specific fan-out and reconnect logic require careful tests.

## Alternatives considered

- **Stateless WebSocket servers plus Redis/database pub-sub:** more portable and
  horizontally flexible, but immediately adds distributed coordination.
- **Client authority or peer-to-peer:** low server cost, but weak cheat
  resistance, difficult recovery, and no trustworthy scoring clock.
- **One actor per player or canvas:** increases cross-actor transactions for a
  room whose rules are strongly coupled.

## Revisit when

- representative room load exceeds the object's CPU, memory, connection, or
  message budget after batching and admission control;
- globally distributed rooms miss the latency objective after measurement;
- a game has independent subdomains that do not share atomic rules; or
- provider portability becomes more valuable than the current simplicity.

Research rationale: [sources.md](../research/sources.md), especially the DDIA
failure/compatibility material, Release It! stability patterns, and Cloudflare
Durable Objects documentation.
