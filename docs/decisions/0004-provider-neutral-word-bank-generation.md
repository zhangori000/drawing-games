# ADR 0004: Put generated word banks behind a provider-neutral domain port

- Status: Accepted
- Date: 2026-07-10

## Context

A future room may ask AI for a themed word bank. That is useful content
generation, not a reason to put a model inside game rules or the realtime
drawing path. Model output is probabilistic and may be malformed, duplicated,
unsafe, irrelevant, badly calibrated, slow, or unavailable. Provider APIs and
model names will also change faster than the game domain.

The product must still start when generation fails. A fun schema-valid word is
not automatically safe, drawable, or correctly difficult, so runtime
validation and offline evaluation solve different problems.

## Decision

Create `packages/word-bank` as the domain owner of:

- `WordBankGenerator`, a small asynchronous port whose output remains `unknown`
  until runtime validation;
- provider-neutral request, candidate, result, and provenance types;
- deterministic normalization, exclusion, deduplication, size, difficulty, and
  caller-supplied blocklist checks;
- a zero-network curated generator used by default and after primary failure;
- bounded generator deadlines with abort signals;
- versioned evaluation fixtures and exact fixture checks; and
- a typed result that distinguishes invalid requests from exhausted fallback.

Future AI SDKs, credentials, prompts, HTTP calls, retry policy, and vendor error
types belong in an application-side adapter. They must not become dependencies
of `word-bank`, `game-core`, or the realtime drawing path.

## Provenance contract

Every accepted bank records:

- source: `curated` or `model-generated`;
- generator ID, version, and optional configuration version;
- optional opaque model ID and revision;
- optional trace ID and generation timestamp;
- validation contract version;
- route: primary, fallback, or local-only; and
- a bounded fallback reason when applicable.

There is deliberately no provider enum. An adapter may place a vendor-specific
name in an opaque identifier, but domain behavior never branches on it. Raw
provider responses, prompts, secrets, and exception messages are not stored in
the bank.

## Failure behavior

The domain accepts only enough unique, validated candidates to satisfy the
request. Invalid extras are dropped and reported. If a primary generator throws,
times out, omits required lineage, or leaves too few candidates, the complete
request is retried against the deterministic curated generator. Partial model
and fallback banks are not silently mixed because that would blur per-bank
lineage and evaluation.

If the request itself is invalid, no generator runs. If both generators fail,
the caller receives a typed failure and must not start a room with unvalidated
content.

## Consequences

### Positive

- The playable game has no AI availability, cost, credential, or SDK dependency.
- Provider migration is an adapter change rather than a domain rewrite.
- Every generated bank crosses the same deterministic contract.
- Provenance supports regression slicing, drift detection, and incident review.
- Evaluation fixtures exist before a model is selected.

### Negative

- A caller must maintain safety policy and human-review processes; a blocklist
  cannot establish semantic safety.
- Strict fallback can discard some usable primary candidates.
- Topic relevance, drawability, cultural fit, and difficulty need judgment
  beyond unit tests.
- The curated catalog needs ordinary editorial ownership and versioning.

## Not decided here

- AI provider, model, SDK, deployment, prompt, or API-key handling;
- whether generation happens before room creation or through a background job;
- generated-bank persistence and retention;
- languages beyond the catalog's current English examples; or
- public-room moderation policy.

Those choices require measured product need and their own adapter/operations
decision. The release gates are defined in
[AI word-generation quality](../quality/ai-word-generation.md).
