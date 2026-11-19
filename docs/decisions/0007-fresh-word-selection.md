# ADR 0007: Layered word memory and balanced draft cards

- Status: Accepted
- Date: 2026-11-19

## Context

Word choice is the most common complaint about team drawing games: the same
prompts come back within a session, all draft cards feel equally easy or
obscure, words are undrawable or unknown, and packs are coarse. Dual Draw
already scores by difficulty (+0/+20/+40), so a draft should present a real
trade-off, and a replacement ("seen it" / "don't know it") should be a last
resort rather than the only help.

## Decision

Draft cards are chosen by a pure, seeded selector in
`packages/word-bank/src/play` that the deterministic room reducer calls with:

1. **A curated pool.** Fourteen packs of concrete, drawable, family-friendly
   words with honest difficulty labels, a drawer-only one-sentence
   definition, and optional accepted aliases. Hosts toggle packs and may add
   custom words (mixed in, or "only my words").
2. **Balanced slots.** The default `balanced` mix gives one easy, one medium,
   and one hard card, each labelled with its bonus.
3. **Hard exclusions.** Words already drawn in the room (across rematches),
   the drawer's personal `avoid` memory (words they drew or reported as seen),
   and the other team's cards this round.
4. **Soft penalties.** Recently offered words in the room, the drawer's
   `soft` memory (guessed, missed, offered, "don't know"), and teammates'
   memories lower a word's odds. Recently used packs are de-prioritized and
   one draft prefers distinct packs.
5. **Word families.** Cards in a draft, the two teams' cards, and the last
   drawn words must not share a stem (falls back softly on tiny pools).
6. **Personal memory sources.** Accounts derive memory from server-side
   history (ADR 0006). Guests keep the last 300 seen word ids in local storage
   and send them on join as soft memory. Memory is a personalization signal,
   not authorization, so a client cannot harm anyone else by sending it.

Guess matching is forgiving about formatting (case, accents, spacing,
hyphens, punctuation, leading articles, simple plurals, `-ing` ↔ base verb
forms that are not another word in the pool, aliases) and gives
private "so close" and "one word is right" feedback, but never accepts a
guess that merely contains the answer among other words.

## Consequences

### Positive

- A group can play many rounds and rematches without repeats, and players
  who log in stop seeing words they have already drawn anywhere.
- Every draft offers a meaningful risk/reward choice.
- Selection stays deterministic and testable inside the room reducer.

### Negative

- Content quality depends on editorial care; packs need periodic review.
- Small pools (few packs, short custom lists) exhaust room memory sooner; the
  selector then relaxes to the oldest-used words instead of failing.
- Soft memory from guests is unverifiable and only ever lowers odds.

## Compliance

- Pack validation tests: unique ids and terms across packs, definition rules,
  difficulty spread, and a blocklist.
- Selector tests: slots, exclusions, determinism, and no in-room repeats until
  exhaustion.
- Reducer property tests: options, chosen words, and definitions never reach
  a team's own guessers before results.
