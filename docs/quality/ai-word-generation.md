# AI word-generation quality contract

Status: baseline for any future model-backed `WordBankGenerator` adapter. The
current product uses the deterministic curated generator and makes no network
or paid AI call.

## Mental model

Evaluation is a portfolio, not one score. Exact checks decide whether data may
enter a room. Offline judgment asks whether accepted data is actually fun,
relevant, drawable, fair, and safe. Production signals detect drift but do not
become automatic training truth.

## Blocking runtime gates

Every adapter response passes the `packages/word-bank` validator. A bank is
accepted only when it has the requested number of unique candidates and every
accepted candidate has:

- plain bounded text with no control characters or markup;
- at most the configured number of words and characters;
- an allowed `easy`, `medium`, or `hard` difficulty;
- no exact normalized match in Seen/excluded or caller-blocked terms;
- bounded, plain-text tags; and
- valid provider-neutral generator/model provenance.

Timeout, exception, missing metadata, malformed payload, duplicate-heavy
output, or insufficient valid candidates must exercise the curated fallback.
If fallback fails, room creation fails safely rather than trusting partial data.

These gates are necessary, not sufficient. Exact term blocking does not detect
innuendo, stereotypes, sensitive events, obscure references, or prompt-topic
irrelevance.

## Versioned evaluation set

`WORD_BANK_EVALUATION_FIXTURES` begins with mixed animals, hard space, easy food
with a Seen exclusion, and an unknown-topic fallback. Each future incident or
important product segment should add a small representative fixture rather than
only enlarging a generic benchmark.

Each fixture runs two layers:

1. **Exact checks:** count, normalization uniqueness, allowed difficulty,
   exclusions, required tags, and contract version.
2. **Calibrated review:** topic relevance, drawability without spelling the
   answer, difficulty, age/cultural appropriateness, and variety.

Before enabling an adapter, expand coverage for supported locales, multi-word
topics, adversarial topic text, rare but valid topics, ambiguous difficulty,
proper nouns, sensitive categories, and repeated generation across seeds.

## Review rubric and release threshold

For a versioned sample, reviewers score each candidate 0–2 on relevance,
drawability, difficulty calibration, appropriateness, and novelty:

- 0: unusable or harmful;
- 1: usable with a concern; and
- 2: clearly suitable.

Initial release gate:

- 100% pass all exact checks;
- zero severity-high safety findings;
- at least 95% receive nonzero relevance, drawability, and appropriateness;
- at least 80% receive reviewer-agreed difficulty within one adjacent band;
- no normalized duplicates inside a bank; and
- curated fallback succeeds for every injected timeout/error fixture.

Use at least two reviewers for a new topic/locale slice and record disagreement.
An AI judge may help triage volume only after calibration against these human
labels; its model, rubric, prompt, and version become evaluation provenance.

## Contract suite for every adapter

Run the same adapter-facing tests for:

- valid output and complete lineage;
- timeout and abort;
- thrown and redacted provider errors;
- invalid JSON-like shape and missing fields;
- duplicates after case, whitespace, and Unicode normalization;
- excluded/blocked terms;
- unsupported difficulty and excessive length;
- fewer valid candidates than requested;
- provider/model/configuration version changes; and
- deterministic fallback after each failure.

No test needs a live paid endpoint. A separate, opt-in integration check may be
added with explicit credentials and cost limits when a provider is chosen.

## Production feedback and drift

Slice acceptance, fallback, latency, cost, Seen reports, and postgame completion
by generator version, model revision, configuration version, topic, locale, and
difficulty. Do not log secret prompts into general telemetry or store raw
provider responses by default.

Seen reports, rerolls, and abandoned rooms are useful signals but ambiguous:
players may know a word, dislike it, find it too hard, or simply change their
mind. Review samples and add confirmed failures to the evaluation set before
changing prompts, policies, or training data.

Stop or roll back an adapter when fallback rate, safety findings, difficulty
disagreement, or user abandonment crosses a predeclared threshold. The curated
generator remains the recovery path while evidence is gathered.
