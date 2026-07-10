# Cost and scaling plan

The first release should be cheap to operate and cheap to replace. Those are
different goals: a low monthly bill is not useful if every provider decision
leaks into game rules and makes a later move a rewrite.

## Spend ladder

### Stage 0: development

- Run the Next.js client, Durable Object emulator, simulations, and browser
  tests locally.
- Use the public GitHub repository and standard GitHub-hosted CI runners.
- Use the curated word bank; no AI account or API key is required.
- Do not provision a database, queue, cache, analytics vendor, or account
  provider yet.

### Stage 1: first playable deployment

- Deploy the web client on a free personal-project tier.
- Deploy the SQLite-backed room actor on Cloudflare Workers Free.
- Set hard usage alerts and treat a free-tier refusal as a visible capacity
  signal rather than silently losing room state.
- Keep long-term accounts and global statistics out of the synchronous drawing
  path.

The free tiers are suitable for learning and private play, not a promise that a
popular or commercial game costs nothing. Provider limits and terms must be
rechecked immediately before deployment.

### Stage 2: pay for headroom without redesigning

Upgrade the existing hosting plans first. More room requests, storage, build
capacity, logs, and support should require configuration and billing changes,
not game-rule changes. The same protocol, room identity, tests, and application
artifacts continue to run.

### Stage 3: extract only the measured bottleneck

Consider another deployment boundary only when evidence shows that one part
needs a different scaling, availability, security, or release profile. Likely
candidates are public matchmaking, durable cross-room statistics, moderation,
or offline AI word-bank generation. Live stroke processing remains isolated
from all of them.

## Migration seams already required

| Volatile choice                | Stable boundary                                                              |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Cloudflare room implementation | Versioned WebSocket protocol plus framework-free game rules                  |
| Room storage engine            | Versioned snapshots, compatibility fixtures, and actor-recovery tests        |
| Web hosting provider           | Standard Next.js build and environment-based realtime endpoint               |
| Authentication provider        | Room-scoped player identity independent of the socket or login account       |
| AI model/provider              | `WordBankGenerator` contract, deterministic validation, and curated fallback |
| Test browser or CI vendor      | Playwright/Vitest commands runnable locally without a hosted dashboard       |

These seams protect behavior, not vendor method names. A generic wrapper around
every vendor API would add indirection today without proving migration safety.

## Extraction triggers

An architecture change needs a measured trigger and an ADR. Examples:

- room command processing misses its p95 or p99 latency budget under the
  reference workload;
- one room approaches tested actor memory, message, or storage bounds;
- free-tier limits reject real traffic often enough to harm play;
- public matchmaking needs cross-room queries and abuse controls;
- statistics retention or deletion requirements no longer fit room-private
  storage;
- an AI provider's quality, latency, or price fails the versioned evaluation
  set;
- one module needs independent availability or release cadence.

Until one of those triggers is observed, a modular monorepo and one room actor
per game code remain the lower-risk architecture.

## Manual work and credentials

No credential is required for the current local test suite. A human will be
needed only when an external system is intentionally enabled:

- Cloudflare login/token and account selection for the first realtime deploy;
- web-host linking and domain configuration for the first frontend deploy;
- authentication-provider configuration when accounts are implemented;
- an AI provider key only after a provider adapter and its evaluation gate are
  approved.

Secrets belong in provider environment settings or ignored local files. They
must never be committed or placed in browser-visible configuration.

## Current pricing references

Recheck these before creating a production account or entering billing data:

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
