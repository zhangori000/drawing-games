# ADR 0006: Optional quick accounts as one Durable Object per username

- Status: Accepted
- Date: 2026-11-19

## Context

Players want their word history and lifetime stats to survive across rooms
and devices, and the anti-repeat system works much better when it can
remember what a person has already drawn or seen. Accounts must stay
optional: guest play by room code remains the default, and an account must
never be required to recover a live room on the same device (ADR 0002).

The product needs only a username, a password, a small profile, bounded
history, and aggregate stats. It does not need email, password reset by
mail, social login, friends, or cross-account queries yet. AGENTS.md asks for
an explicit decision before adding storage.

## Decision

Store each quick account in its own `AccountActor` Durable Object, addressed
by `idFromName('user:' + normalizedUsername)`, in the existing realtime
Worker.

- **Uniqueness without an index:** the username is the actor name, so a
  second signup for the same name lands on the same actor and is refused.
- **Credentials:** PBKDF2-SHA-256 with 100,000 iterations and a 16-byte salt
  (WebCrypto, the Workers maximum), constant-time comparison, and a lockout
  after 8 failed logins in 10 minutes.
- **Sessions:** bearer tokens `<username>.<32 random bytes>`; the prefix lets
  the Worker route without a lookup, and only `SHA-256(token)` is stored. At
  most 10 sessions per account; idle sessions expire after 180 days. Bearer
  tokens (not cookies) mean CORS can allow any origin without ambient
  authority.
- **Data minimization:** no email or other personal data. History is bounded
  to the newest 1,000 word events and 50 match summaries; stats are
  aggregates. Drawings, guesses, and resume tokens are never stored on the
  account.
- **Room integration:** a room verifies an optional account token on join or
  resume through an in-Worker RPC and receives only the account id, display
  name, and word memory. Rooms report word events at round end and a match
  summary at match end through `ctx.waitUntil`; account failures never block
  or fail a game.

## Consequences

### Positive

- No new vendor, database, or deployable; local development needs nothing.
- Per-account consistency and natural sharding match the room-actor model.
- Account loss or outage degrades to guest behavior instead of breaking play.

### Negative

- No password recovery: a forgotten password means a new account. The UI
  says so plainly.
- Global queries (leaderboards, username search, admin listing) need a
  separate read model later; they must not become a single global actor.
- PBKDF2 is weaker than memory-hard hashes; acceptable for low-value quick
  accounts, revisit before storing anything more sensitive.

## Revisit when

- email-based recovery, friends, or moderation tooling are required;
- a production authentication provider is chosen for admins (see
  `docs/operations/manual-steps.md`); or
- global leaderboards or cross-account analytics are requested.
