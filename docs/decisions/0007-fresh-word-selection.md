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

1. **A curated pool.** Fifteen packs of concrete, drawable, family-friendly
   words with honest difficulty labels, a drawer-only one-sentence
   definition, and optional accepted aliases. Hosts toggle packs and may add
   custom words (mixed in, or "only my words"). A pack is also the guessers'
   category hint, so a word lives in the pack a guesser would look in:
   body words moved from Space & Science to a new default-on Body & Health
   pack (and elevator/escalator to Places & Buildings). Word ids never
   change meaning: a moved word gets a new id, and its old id resolves to it
   (`LEGACY_WORD_IDS`, `canonicalWordId`), so memories and histories that
   hold the old id keep working.
2. **Balanced slots.** The default `balanced` mix gives one easy, one medium,
   and one hard card, each labelled with its bonus.
3. **Hard exclusions.** Words already drawn in the room (across rematches),
   the drawer's personal `avoid` memory (words they drew or reported as seen),
   and the other team's cards this round. When a small pool runs out, they
   relax per slot, never for the whole draft: never-drawn words the drawer
   has seen come first, then the room's least recently drawn words, and the
   other team's cards last (see `docs/architecture/live-room.md`). Bots and
   the draft deadline pick a never-drawn card when the hand has one, the
   drawer sees drawn cards marked, and the lobby warns from which round a
   room's words must repeat.
4. **Soft penalties.** Recently offered words in the room, the drawer's
   `soft` memory (guessed, missed, offered, "don't know"), and teammates'
   memories lower a word's odds. Recently used packs are de-prioritized and
   one draft prefers distinct packs.
5. **Word families.** Cards in a draft, the two teams' cards, and the last
   drawn words must not share a stem (falls back softly on tiny pools).
6. **Personal memory sources.** Accounts derive memory from server-side
   history (ADR 0006). Guests keep the same split in local storage, newest
   300 of each: words they drew or reported "seen it" on as drawer go to
   `avoid` (stage 1 excludes them, as for an account), every other word they
   met (their team's word, other draft cards, "don't know it", the other
   team's word once round results reveal it) goes to `soft`. Both are sent
   on join. Memory is a personalization signal, not authorization, so a
   client cannot harm anyone else by sending it.

Guess matching is forgiving about formatting (case, accents, spacing,
hyphens, punctuation, leading articles, simple plurals, `-ing` ↔ base verb
forms that are not another word in the pool, aliases) and gives
private "so close" and "one word is right" feedback, but never accepts a
guess that merely contains the answer among other words. A base verb that
is refused only because it is another word in play (`sneeze` for
`sneezing`) is "so close", not wrong.

Word identity for no-repeat follows the matcher: two words whose noun
forms the matcher accepts for each other (`dolphin`/`dolphins`,
`mouse`/`mice`) are one word for the pool, room memory, personal memory,
and the lobby's fresh count (`isSameWord` in word-bank).

## Consequences

### Positive

- A group can play many rounds and rematches without repeats, and players
  who log in stop seeing words they have already drawn anywhere.
- Every draft offers a meaningful risk/reward choice.
- Selection stays deterministic and testable inside the room reducer.

### Negative

- Content quality depends on editorial care; packs need periodic review.
- Small pools (few packs, short custom lists) exhaust room memory sooner; the
  selector then brings back the least recently drawn words, only for the
  slots that need them, instead of failing, and the lobby says so up front.
- Guest memory is unverifiable. Its `avoid` list only removes words from
  that guest's own draft cards (and lowers their teammates' odds, like soft
  memory), so the worst a client can do is make its own drafts staler.

## Compliance

- Pack validation tests: unique ids and terms across packs, definition rules,
  difficulty spread, and a blocklist.
- Selector tests: slots, exclusions, determinism, and no in-room repeats until
  exhaustion.
- Reducer property tests: options, chosen words, and definitions never reach
  a team's own guessers before results.
