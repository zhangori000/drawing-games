# ADR 0008: Opponents see draft swaps, not cards, by default

- Status: Accepted
- Date: 2026-11-20

## Context

The first product contract defaulted casual rooms to "options + actions":
during the word draft each team saw the other drawer's cards and swaps. It
accepted that an opponent could relay that shortlist to the owning team's
guessers, and promised that guessers otherwise learn only their team's
selection status.

The game also gives guessers clues about their own word, which are core to
the product (better word selection and hints): the difficulty with its
visible bonus, the category, and letter blanks. Playtesting showed each of
these picks out one card of the shortlist. A balanced draft always has one
easy, one medium, and one hard card; drafts prefer a different pack per card;
and terms differ in length. One person with a second tab on the other team
could read the cards, match the "Hard" chip or the category, and solve in a
single guess, in every draft under default settings.

## Decision

- The default `opponentDraftVisibility` is `actions-only`: opponents see that
  a card was swapped and why, never the words. Guessers keep every clue.
- `options-and-actions` stays available. When a room uses it, the room sends
  guessers no clue that tells cards apart: their word's difficulty and
  category are withheld, the word-length mode acts as `hidden` (no blanks,
  no reveal vote), and the lobby explains why. Drawers and round results are
  unchanged. The rule lives in `ownWordCluesAllowed` in game-core, used by the
  projection, the hint vote, and the lobby UI.
- A member who joins after a draft's cards were dealt never receives that
  draft's opponent cards.

## Consequences

### Positive

- Default rooms keep every guesser clue without a cheap exact-answer leak.
- Rooms that want the transparent draft still get it, with an honest trade:
  a shortlist can be relayed, but no clue narrows it further.
- A property test checks that for any two seats on opposite teams, what they
  saw together never narrows a word to fewer than two of its cards.

### Negative

- The social "watch the other drawer choose" moment is now opt-in.
- Hosts who opt in lose category, bonus, and letter clues for guessers.

## Compliance

- `packages/game-core/src/room/opponent-draft.test.ts`: default, clue gating,
  hint vote refusal, mid-draft joiners, and the two-seat property.
- `packages/game-core/src/room/secrecy.test.ts`: per-viewer projection
  secrecy under every visibility setting.
