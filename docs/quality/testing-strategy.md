# Testing strategy

## Mental model

Testing is a risk portfolio. Each important failure should be caught by the
cheapest test that can observe it faithfully. Browser tests prove that the
assembled product works; they should not re-prove every scoring branch that a
millisecond domain test can explain better.

“Shift left” means discovering ambiguity and failure earlier while keeping
real-browser, real-runtime, and production evidence for risks that cannot be
faithfully moved left.

## Test layers

| Layer                    | What it protects here                                                       | Tool                                           | Expected speed           |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| Example unit tests       | Named scoring, settings, phase, drawing, and word-validation cases          | Vitest                                         | Milliseconds             |
| Property tests           | Invariants over many generated values and command sequences                 | fast-check with Vitest                         | Milliseconds to seconds  |
| Contract fixtures        | Old protocol messages and public-view compatibility                         | Zod plus checked-in v1 fixtures                | Milliseconds             |
| Runtime integration      | Durable Object transactions, WebSockets, persistence, dedupe, and eviction  | Cloudflare Workers Vitest pool                 | Seconds                  |
| Headless room simulation | Many fake drawers/guessers, seeded rounds, retries, and fairness invariants | Deterministic game-core simulator              | Seconds                  |
| Browser E2E              | A few critical multi-user and mobile layout journeys                        | Playwright browser contexts                    | Tens of seconds          |
| Nonfunctional checks     | Latency, load, longevity, accessibility, and reconnect budgets              | Focused harnesses and real devices             | Pre-release or scheduled |
| Production learning      | Failures no finite suite predicted                                          | Metrics, traces, canaries, and recovery drills | Continuous after launch  |

## What to test at each layer

### Domain unit and property tests

Keep game rules framework-free and inject time or randomness. High-value
properties include:

- scores are bounded and never decrease when more authoritative time remains;
- duplicate commands have one semantic effect;
- legal command sequences never create an impossible phase or roster;
- drawer turns remain balanced within one turn;
- a chosen word is visible only to its authoritative active drawer;
- undo followed by redo restores the same drawing document;
- malformed or out-of-order drawing operations cannot corrupt state;
- the same seed and command sequence produce the same result.

Generated failures must print their seed and shrink to a small counterexample
so they can be replayed and promoted to a named regression test.

### Protocol contract tests

Runtime schemas are compatibility contracts, not merely TypeScript types.
Every supported major protocol version keeps representative serialized client
and server fixtures. A new version must test:

- old client to new server;
- new client to old server when rollback can create that pairing;
- added, missing, unknown, null, and invalid values;
- ordering, duplication, stale sequence, and error behavior;
- explicit rejection of unsupported major versions.

Breaking changes use a parallel version and a measured retirement window. Do
not scatter nominal-version conditionals through game rules.

### Realtime integration tests

Run the room adapter in Cloudflare's Workers runtime, not a hand-written fake,
when testing transaction, WebSocket, alarm, storage, or eviction semantics.
Exercise:

- several sessions in one room and isolation between room codes;
- commit-before-broadcast ordering and monotonic room sequence;
- command retry deduplication and conflicting ID reuse;
- actor eviction/restart in every timed phase and after scoring/edit changes;
- stale socket replacement and reconnect snapshots;
- delayed alarms, malformed frames, bounded payloads, and slow receivers.

### Fake-player simulation

The headless simulator is the economical way to create many rooms. A scenario
declares fake players, teams, drawers, word choices, guesses, disconnects, and
server time. It uses an explicit seed and produces a compact event transcript.

Run hundreds of seeds in CI and preserve a failing seed. Use this layer for
fairness, secrecy, scoring, surrender, rematch, showdown, and retry invariants.
It deliberately does not claim that canvas rendering or Safari focus works.

### Browser E2E

Use one isolated Playwright `BrowserContext` per fake player so cookies and
storage behave like separate devices. Keep only valuable user journeys:

1. fake drawers receive their selected words while guessers do not;
2. a wrong guess followed by another guess keeps the drawing viewport stable;
3. refresh/background/reconnect restores the current room and role;
4. drawing, object erase, undo, redo, and clear work through real controls;
5. the critical flow passes in Chromium and mobile WebKit.

Use semantic roles and labels rather than CSS selectors. Create state through a
fast owned test driver instead of clicking through every setup screen. Wait on
observable readiness, never arbitrary sleeps. Capture a trace and screenshot
only on failure or first retry.

The current browser suite is a walking skeleton over the implemented room
surface. It must not be described as full realtime-game E2E until the web client
is actually wired through WebSockets to the authoritative room reducer.

## Feedback pipeline

### Local and commit gate

Run formatting, dependency boundaries, static analysis, types, unit/property
tests, protocol fixtures, runtime integration tests, and builds. This gate must
remain deterministic and fast enough to run before every push.

### Pull-request browser gate

Run the small Playwright suite after the fast gate succeeds. Public-repository
standard GitHub runners keep this from requiring a paid test service. A retry
may classify a failure as flaky, but a flaky result is still a defect to fix.

### Scheduled or pre-release gate

Run larger seed counts, load, longevity, mobile-browser, accessibility, and
reconnect/degraded-network scenarios. Promote a check to every pull request
when it becomes fast and reliable enough or protects a frequently changing
high-risk area.

### Production gate

Deploy gradually, observe user outcomes, and retain a recovery switch. Convert
escaped defects into a new specification partition, property, contract,
integration case, browser journey, or production fitness function.

## Anti-flake contract

- no wall-clock sleeps when a condition can be observed;
- inject clocks and random seeds below the browser;
- use a unique room, session, and command namespace per test;
- make setup and cleanup idempotent;
- never share mutable test accounts between parallel workers;
- keep tests independent of execution order;
- include seed, room code, browser, trace, and relevant logs on failure;
- quarantine only as short containment with an owner and removal condition;
- do not accept “passed on retry” as equivalent to a first-run pass.

## Adequacy and stopping rules

Line coverage is an investigation signal, not the goal. A feature is adequately
tested when its important behavior partitions, boundaries, state sequences,
contracts, integration assumptions, and user outcome each have proportionate
evidence.

Mutation testing is valuable for scoring, secrecy, and state-transition rules
once those modules stabilize. Start with a focused scheduled slice; do not slow
every commit by mutating the entire repository.

## Source lenses

This strategy applies the local synthesized notes for _Effective Software
Testing_, _Continuous Delivery_, _Building Evolutionary Architectures_, and
_Release It!_ Current tool behavior was checked against:

- [Playwright browser contexts](https://playwright.dev/docs/api/class-browsercontext)
- [Playwright web-server configuration](https://playwright.dev/docs/test-webserver)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [fast-check](https://fast-check.dev/docs/introduction/)
- [Cloudflare Durable Object testing](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/)
