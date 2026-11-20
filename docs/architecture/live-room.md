# Live room: playable v1 contract

Status: **build contract for the first end-to-end playable Dual Draw**. It
turns the product spec (`docs/product/dual-draw.md`) into concrete module
responsibilities. Where this file and the product spec differ, this file wins
for v1 and the difference is called out.

Dual Draw is the repo's own two-team, simultaneous draw-and-guess game. It is
built in the same genre as other team drawing games, with its own name,
rules, and look. The v1 goals, in priority order:

1. A complete match is playable end to end in real browsers: create a room,
   join by code or link, lobby, word draft, simultaneous drawing and
   guessing, round results, showdown, final stats, rematch.
2. **Better words.** Balanced draft cards, drawer-only definitions, curated
   packs, custom words, and layered anti-repeat memory.
3. **Better keyboard, no weird zoom.** The drawing never jumps when typing;
   no accidental zoom from focusing inputs, double-tapping, or pinching.
4. **Optional quick accounts** (username + password, no email) that keep
   word history and lifetime stats and feed the anti-repeat memory.
5. **Solo testability.** Practice bots let one person play a full match.

## Module ownership

| Module        | Owner files                                         | Notes                                                  |
| ------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Word packs    | `packages/word-bank/src/packs/*.ts`                 | Curated content only.                                  |
| Word engine   | `packages/word-bank/src/play/*.ts`                  | Pool, draft selection, guess matching.                 |
| Room rules    | `packages/game-core/src/room/*.ts`                  | Deterministic reducer + projection.                    |
| Wire protocol | `packages/protocol/src/*.ts`                        | Commands, domain-event payloads, account HTTP schemas. |
| Room server   | `apps/realtime/src/room/*.ts`                       | `GameRoom` Durable Object + `/rooms` routes.           |
| Accounts      | `apps/realtime/src/accounts/*.ts`                   | `AccountActor` Durable Object + `/accounts` routes.    |
| Web platform  | `apps/web/src/lib/**`, `apps/web/src/components/**` | Connection, identity, canvas, keyboard, accounts.      |
| Web game      | `apps/web/src/app/play/**`                          | All match screens.                                     |

Type contracts are code, not prose:

- `packages/game-core/src/room/types.ts` — `RoomState`, `RoomCommand`,
  `RoomEffect`, `RoomView` (what a browser renders).
- `packages/game-core/src/room/settings.ts` — `RoomSettings`, defaults, limits.
- `packages/game-core/src/room/records.ts` — account-facing records/stats.
- `packages/game-core/src/room/engine.ts` — reducer entry points.
- `packages/word-bank/src/play/types.ts` — playable words and selection input.
- `packages/protocol/src/commands.ts` — every client command.
- `packages/protocol/src/room-events.ts` — `domain.event` payloads.
- `packages/protocol/src/accounts.ts` — account HTTP request schemas.
- `apps/realtime/src/accounts/client.ts` — room → account calls.

Changing a contract signature requires updating every consumer in the same
change. Adding optional fields is fine.

## Local topology

```text
browser ──HTTP──▶ Next.js (apps/web, :3000)
   │
   └──HTTP + WebSocket──▶ Worker (apps/realtime, wrangler dev :8787)
                            ├─ GameRoom DO  (one per room code)
                            └─ AccountActor DO (one per username)
```

`pnpm dev` runs both. The browser derives the realtime base URL from
`NEXT_PUBLIC_REALTIME_URL`, or else `http(s)://<page hostname>:8787`, so a
phone on the same Wi-Fi can open `http://<laptop-ip>:3000` and play.
`next dev` refuses its dev resources (HMR socket, dev chunks) to origins other
than `localhost`, and the page then never hydrates, so `apps/web/next.config.ts`
sets `allowedDevOrigins` to this machine's own addresses and host names
(`src/lib/dev-origins.ts`). They are read when `next dev` starts: restart it
after joining a different network.

## Room rules (game-core reducer)

All randomness uses `state.rngState`; all time uses the `nowMs` argument.
`applyRoomCommand` always runs `advanceRoom(state, nowMs)` first.
Rejections return `{ ok: false, error }` with a short human message and never
throw for player mistakes. Internal fields may be added to `RoomState`
sub-objects (for example a `left` flag on members), but the exported field
names and meanings in `types.ts` must hold.

### Membership and lobby

- `member.join`: rejects with `ROOM_FULL` at 16 members. Names are trimmed,
  whitespace-collapsed, capped at 24 chars, and de-duplicated with a numeric
  suffix (`Mina 2`). The first human becomes host. A member joins the
  requested team if it has fewer than 8 members, otherwise the smaller team
  (ties → A). Joining mid-match is allowed: the newcomer is a guesser now and
  enters the drawer rotation naturally.
- `member.presence` updates `connected`/`lastSeenAtMs`.
- `member.leave`: in the lobby the member is removed. Mid-match the member is
  marked disconnected and left; they are removed when the room returns to the
  lobby. A drawer who leaves mid-turn hands the turn over (see Drawer
  rotation). Host transfers to the earliest-joined connected human, else any
  human.
- Host also transfers automatically when the host has been disconnected for
  15 s and another human is connected (checked in `advanceRoom`). A drawer
  disconnected for 10 s hands the turn to a connected teammate (see Drawer
  rotation).
- `lobby.set-team` (lobby only): anyone may move themselves; the host may
  move anyone including bots. Teams cap at 8.
- `lobby.shuffle-teams` (host, lobby): seeded shuffle of all members into
  balanced teams (size difference ≤ 1).
- `lobby.set-ready` (humans, lobby).
- `lobby.update-settings` (host, lobby): validate against
  `ROOM_SETTINGS_LIMITS`; rounds must be even; unknown pack ids are dropped;
  custom words are trimmed, whitespace-collapsed, stripped of control
  characters, 2–32 chars, case-insensitively de-duplicated, max 300. There
  must be at least one enabled pack, unless `customWordsMode` is `only` and
  there are at least `2 × wordChoiceCount` custom words. Any accepted change
  clears every human's ready flag.
- `LobbyView` also forecasts repeats: `unusedWordCount` (pool words never
  drawn in this room, which survives rematches) and `repeatsFromRound`, the
  first round of the configured match whose cards could include a drawn
  word, i.e. the first round `r` with
  `unusedWordCount − 2·(r − 1) < 2·(wordChoiceCount + replacementsPerDrawer)`
  (`roundWordDemand`), or null. The lobby shows a warning instead of
  "words never come back" when it is set; it does not block Start.
- `lobby.add-bot` (host, lobby): ids `bot_<n>`; names cycle through
  `Pixel Pete, Doodlebot, Sketchy, Inkling, Scribbles, Smudge, Squiggles,
Blotto`. Bots are always connected and ready and never have accounts.
- `lobby.remove-member` (host, lobby, not self).
- `match.start` (host, lobby): each team needs 2–8 members, and every
  connected human other than the host must be ready (the host pressing Start
  is their ready). Blockers appear in `LobbyView.blockers` in plain words,
  e.g. `Moon needs at least 2 players`, `Waiting for Theo to ready up`.

### Drawer rotation

Rotation is round-robin per team in join order, with a cursor: each
round's drawer is the first member after the team's previous drawer (the
one who finished last round's turn, after any takeover) who is within the
reconnect grace (connected, or disconnected for at most 10 s)
(`nextRotationDrawer`). Members who left are skipped; a mid-match joiner
slots in at their join position; if nobody is within grace the next
remaining member draws, and if everyone left the next former member keeps
the seat. So nobody draws twice in a row while a teammate within grace is
waiting, and roster changes never shift or repeat turns (e.g. with P2 away
the whole match, A goes P1, P3, P1, P3). `drawerTurns[team]` still counts
completed turns (one per normal round) but no longer picks the drawer. The
showdown relay uses the same cursor: its first card goes to the member
after the last round's drawer, and each new card to the member after the
previous card's drawer.

**A drawer who leaves mid-turn** (an explicit `member.leave` during
`word-draft`, `drawing`, or on an active showdown card) hands the turn to the
next teammate after them in join order: the first one within reconnect grace,
else any remaining teammate. The new drawer continues the same turn, so the
team never waits out a deadline with nobody drawing: in the draft they get the
same cards, the remaining swaps, and the remaining time (a bot schedules its
pick); while drawing or on a showdown card they get the same word and canvas
for the remaining time (bots re-plan around them; a showdown takeover counts
as a card drawn). The opponent's turn and every deadline are untouched. A team
that already solved, or has nobody left, is unchanged. Results then name the
new drawer, who gets `drew`/`offered`; swap reports stay with whoever swapped.
The rotation continues after whoever finished the turn.
`lobby.remove-member` is lobby-only, so it cannot interrupt a turn.

**A drawer who stays disconnected** past the reconnect grace hands the turn
over the same way. `advanceRoom` has due work (`nextDrawerTakeover`, part of
`getNextWakeAtMs`) at `drawer.lastSeenAtMs + 10 s` for every live turn (a
draft, a drawing, or an active showdown card, of a team that has not solved
it) whose human drawer is disconnected while a teammate is connected and a
third teammate (not an earlier drawer of the turn) could still guess. When it
runs,
the first connected teammate after the drawer in join order (a bot counts)
continues the same cards and swaps, or the same word and canvas, for the
remaining time; a showdown takeover counts as a card drawn, as for a leave.
A drawer back within the grace keeps the turn; one back later is recorded in
`formerDrawerIds` and sits the turn out (no guesses or hint votes on a word
they saw), guessing again from the next turn; the rotation continues after
the teammate who took over. In a pair (or one human with one bot) nobody
would be left to guess, so the turn waits for the drawer. With nobody
connected the turn stays put, and the first teammate to connect (or join)
takes it at once. A drawer who left with nobody to hand to is treated the
same way, without the grace.

### Word draft (the headline improvement)

At round start, for team A then team B:

1. **Pool**: `buildWordPool(settings)` (enabled packs ± custom words).
2. **Slots**: `difficultySlots(settings.difficultyMix, wordChoiceCount, rng)`.
   `balanced` means three cards are always one easy, one medium, one hard,
   each labelled with its bonus (+0/+20/+40) so the choice is meaningful.
3. **Exclusions, filled in stages** (`selectDraftWords`). Never offered:
   the drawer's own live cards and words replaced earlier this round. The
   slots are filled from the strictest stage that still has words, and a
   later stage only fills the slots the earlier ones could not:
   1. words never drawn in this room (across rematches, by id or answer
      key), not in the drawer's `memory.avoid` (drew before, reported "seen
      it"), and not on the other team's cards this round;
   2. never-drawn words from the drawer's `memory.avoid`;
   3. words drawn in this room, least recently drawn first: only the oldest
      few are let back in, a step at a time (avoid memory still excluded);
   4. any word but the other team's cards;
   5. (tiny pools only, fresh deals only) the other team's cards too.

   So a drawn word only comes back once no never-drawn word is left for the
   slot. With at least `roundWordDemand` never-drawn words at each draft no
   card is ever a drawn word (an invariant checks no chosen word repeats in
   a match while the pool has that room). The drawer's view marks such a
   card `drawnBefore`.

4. **Penalties** (lower odds, multiplied, floored at 0.01):
   - offered in this room within the last 6 drafts: ×0.05; offered earlier:
     ×0.35;
   - in the drawer's `memory.soft`: ×0.2;
   - in any teammate's `memory.avoid` or `memory.soft`: ×0.3 each.
5. **Pack variety**: packs of the last two chosen words ×0.6; cards in one
   draft prefer different packs.
6. **Word families**: options must not share a stem (`wordStems`) with each
   other, with the other team's cards, or with the last two drawn words
   (falls back gracefully on tiny pools). `-ing` words also stem to their
   base verb (`running` ~ `home run`, `waving` ~ `wave`); `-ing` nouns
   (`wedding`, `ceiling`) and words that merely end in the letters (`king`,
   `spring`) do not.

Every offered card updates `wordMemory.offeredAt`, and `draftCounter`
increments per team draft. `canvas.reset` is emitted for both team canvases
(`m<match>-r<round>-<team>`). Deadline: `wordDraftSeconds`.

- `draft.select`: the team's drawer only, before the deadline, a current card.
  When both teams have chosen, drawing starts immediately.
- `draft.replace`: drawer only, while unchosen, within
  `replacementsPerDrawer`. The replacement keeps the replaced card's
  difficulty and excludes all current cards (both teams') and previously
  replaced words. It never falls back to stage 5: on a custom-only list so
  short that only the other team's cards remain, the swap is refused with
  "There are no other words left to swap in." (an opponent card could be
  their locked answer).
  `seen-before` adds the word to the drawer's in-room `memory.avoid`;
  `unknown-definition` adds it to `memory.soft`. The UI shows the definition
  first, so "don't know it" is a last resort rather than the only help.
- At the draft deadline each unchosen team gets a random remaining card
  (`chosenBy: 'auto'`), preferring cards never drawn in this room.

### Drawing and guessing

- Drawing starts for both teams together: deadline `drawingSeconds`. Chosen
  ids are appended to `wordMemory.usedWordIds`, packs to `recentPackIds`.
- `drawing.ops`: only a team's current drawer during `drawing` (or their
  showdown card). The reducer counts `stroke.end` ops into `strokeCount`,
  stamps `firstStrokeAtMs`, and emits `canvas.ops` unchanged. Ops from anyone
  else are rejected. Canvas content itself lives in the realtime layer.
- `guess.submit`: a member of a team that has not solved, who is not that
  team's drawer. Text is trimmed and must be 1–60 chars. Rate limit: one
  guess per 400 ms per member, at most 50 per member per round.
  `matchGuess(text, { term, aliases, otherWords: roomPool })` decides the
  verdict. Besides formatting, plurals, and aliases it accepts `-ing` ↔ base
  verb forms of the last word (`juggle`/`juggling`, `run`/`running`,
  `dance`/`dancing`, `lie`/`lying`, `tightrope walk`/`tightrope walking`)
  and of a leading verb followed by an article, possessive,
  preposition, or (for an `-ing` verb) a plural object (`fly a kite`,
  `brush teeth`, `breaking the ice`). A verb form is never accepted when it
  is another word in the pool (`wave` while `waving` is playable), a known
  `-ing` noun (`wed` is not `wedding`), or a stub (`king`, `spring` keep their
  letters; stems need 3+ letters with a vowel). `close` still compares only
  against the answer and its plurals; `partial` also recognises a verb form
  of one answer word. Every guess emits private `guess.feedback`. The team
  feed keeps the last 60 guesses; near-miss verdicts in it are private too
  (see projection secrecy).
- A correct guess locks that team's points:
  `round(50 + 50·remaining/drawingSeconds) + {0,20,40} − hintCost?`, never
  below 0. The other team keeps playing against the same deadline. Both
  solved ends the round early.
- Length hint (`hidden-vote`): from `hintUnlockSeconds` after drawing starts,
  human guessers on a team vote; more than half of that team's human
  guessers approving reveals the pattern to that team only and costs
  `hintCost` if they later solve. `shown` reveals from the start for free;
  `hidden` never reveals.
- `categoryHint` shows guessers the pack name of their own word, so every
  curated word sits in the pack a guesser would look in (body words are in
  Body & Health, not Space & Science). A word that moves packs gets a new id;
  `canonicalWordId` maps its old id (`LEGACY_WORD_IDS`), and member memories
  are canonicalized on join and account link (`capMemory`).
- Own-word clues (`MyTeamRoundView.difficulty`, `category`, and the length
  pattern) are withheld from guessers while `opponentDraftVisibility` is
  `options-and-actions` (`ownWordCluesAllowed`): the word-length mode then
  acts as `hidden` (no blanks, `hint.vote` is refused) and `category` and
  `difficulty` are null for everyone but the drawer. Default visibility is
  `actions-only` (ADR 0008).

### Round results, surrender, showdown, final

- Round end: winner = more round points (tie/none → null); shutdown bounty
  via `calculateShutdownBounty`; streak via `updateWinStreak`; both drawer
  turns advance; per-member stats update; account word events are emitted
  for account members of each team (`drew`, `guessed`, `missed`, `offered`,
  `seen-report`, `unknown-report`). Every member's in-room `memory.soft`
  gains both words; each drawer's `memory.avoid` gains their own word.
- Results last `roundResultsSeconds`; the host may `round.continue` early.
- `surrender.vote` during results: eligibility via `getSurrenderEligibility`
  (≥3 completed rounds, ≥100 behind). Two thirds (rounded up) of the team's
  human members must approve. Success ends the match for the opponent.
- Showdown (if enabled and both teams have at least one card): each team
  redraws its own previously chosen words, shuffled, relay style. A correct
  guess clears the card (+10), advances to the next card and the next relay
  drawer, and resets that team's canvas (`m<match>-sd-<team>-<index>`). The
  first team to clear everything gets +20. Ends when both finish or at the
  deadline. No difficulty, hint, or shutdown modifiers.
- Final (`stats` phase, untimed): winner by total score; `account.match`
  effects for account members. Host chooses `match.rematch`:
  `same-settings` starts a fresh match immediately (falls back to the lobby
  with blockers if teams are invalid); `change-settings` returns to the lobby
  and clears ready flags. Room word memory survives rematches.
- Results and final views carry each revealed word's `wordId` (with the
  term), so guests' browsers can remember the words they saw.
- **Only play someone was there for is credited.** At round end the
  reducer records `round.absentIds` (internal): humans disconnected since
  before the drawing started. An absent drawer (a deadline pick nobody
  saw) gets no `drew`/`offered` and no drawer stats; an absent guesser gets
  no `missed`. Earlier drawers of a turn someone took over
  (`teamRound.formerDrawerIds`, internal) get `offered` for every card and
  no guesser event; they cannot `guess.submit` or `hint.vote` on that word
  (they saw it) and guess again from the next turn (showdown: the next
  card). A showdown card whose relay drawer was away for all of it is not
  `drew` (`ShowdownCardResult.drawerAbsent`). `account.match` goes only to
  members who took part: present for a finished round, a guess, or a
  showdown card.
- **Abandoned matches.** When no human is connected for 60 s
  (`ABANDON_MATCH_MS`; at once if every human left) during a running match,
  due work abandons it: `match.abandoned` (internal) is set, `endedAtMs` is
  stamped with `endedReason: null`, bots stop, and the room returns to the
  lobby (left members pruned, ready flags cleared). No `account.match` is
  emitted; rounds that finished earlier were already reported. So bots never
  play out (and record a 0-point loss for) a practice match whose player
  closed the tab.
- **Late account link.** `member.link-account` with an account during a match
  or on its final (`stats`) screen credits that match to the account once:
  one `account.words` with the member's events for every finished round they
  were in the room for and every finished showdown card (re-derived from
  state with the original `atMs`), plus `account.match` if the match is over.
  Later rounds reach the account as usual. `match.creditedMemberIds`
  (internal) holds members already credited: account members at match start
  or join, and guests once they link. Linking again, unlinking and relinking,
  or linking a different account never credits the match twice; in the lobby
  nothing is credited.

### Practice bots

Bots exist so one person can test the full game. Their behavior is scheduled
by the reducer through `state.bots.schedule` and executed in `advanceRoom`;
`getNextWakeAtMs` includes the next bot action.

- Bot drawer: picks a card 2–5 s into the draft (a never-drawn one when the
  hand has one); then draws a **letter puzzle** (`renderLetterPuzzle`), never
  the word written out: one equal-width blank per letter or digit (spaces are
  gaps; hyphens and apostrophes are drawn), one stroke every 0.25–0.45 s
  (`draw.outline` items), then reveals letters one at a time above their
  blanks (`draw.letter`) in a seeded random order: at most 60 % of them and
  never all, spread from 15 % to 75 % of the time budget (±1.5 s). Equal
  blanks keep narrow and wide letters indistinguishable.
- Bot guessers follow **one timing model whoever draws** (`SOLVE_MODEL`), so
  both teams of a practice match play by the same clock: 1–3 clearly wrong
  guesses (other pool words), then the answer at a uniform share of the time
  budget by difficulty (easy 20–60 %, medium 30–70 %, hard 40–85 %), or, with
  8 % / 12 % / 20 % odds, never (one more wrong guess instead). Showdown cards
  (30 s budget per card) never miss, since there is no per-card deadline.
- A human drawer's canvas must look like a real attempt when the answer is
  due: at least 2 strokes and 1.2 canvas-widths of ink (easy), 4 and 2.5
  (medium), 6 and 4 (hard); otherwise the bot keeps looking and retries every
  4 s until the deadline. Ink is measured by the reducer from human
  `stroke.begin`/`stroke.append` points (`inkLength`, internal).
- Retired `draw.next-stroke` items in a stored schedule are ignored.
- Bots never vote and never record account data.

### Projection secrecy (must be tested with properties)

- A team's draft cards, chosen term, and definition reach only that team's
  drawer. Opponents see cards/actions only during the draft and only as
  `opponentDraftVisibility` allows; a member who joined after the draft's
  cards were dealt never sees that draft's cards. The owning team's guessers
  never see their own term before round results, and no two seats on
  opposite teams together can narrow it to a single card (clues are withheld
  while cards are shown).
- `settings.customWords` reaches only the current host, in every phase;
  everyone else gets `[]` and `settings.customWordCount`. Drawn custom words
  are revealed in results like any word; the rest of the list never is.
- `close`/`partial` verdicts in the team feed reach only the guesser and the
  team's drawer; other teammates see those guesses as `wrong`.
- Guess texts reach only the guesser's own team; correct guesses are shown
  as `text: null`.
- `pattern`/`letterCount` reach guessers only when shown or revealed.
- Results and final views reveal everything about finished rounds.
- Word ids follow the same rule: a viewer's view contains no pool word id
  except the drawer's own cards during their live turn and the chosen words
  of finished rounds in results and final.

### Canvas access

| Phase                | Full strokes                                          | Preview only              |
| -------------------- | ----------------------------------------------------- | ------------------------- |
| word-draft / drawing | own team canvas; opponent canvas once own team solved | opponent canvas otherwise |
| round-results        | both canvases of the round                            | —                         |
| showdown             | own active card; opponent card once own team finished | opponent card otherwise   |
| stats                | every normal-round canvas of the match                | —                         |
| lobby                | —                                                     | —                         |

Non-members get previews during play and full access in results/stats.

## Room server (`GameRoom`)

- Storage uses `ctx.storage.sql` (small key/value table for the state JSON,
  plus `sessions`, `canvases`, and `commands` tables) to avoid KV value-size
  limits. State is loaded in the constructor inside `blockConcurrencyWhile`;
  memory is only a cache.
- `POST /rooms` creates a room with a random 5-character code from
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (retrying on collision via the DO's
  `create` RPC). `GET /rooms/:code` returns `{ exists, phase, memberCount }`.
  Connecting to a room that was never created sends `ROOM_NOT_FOUND` and
  closes with code 4404.
- Handshake: the first command on a socket must be `room.join` or
  `room.resume`. Join generates a member id and a 32-byte resume token, stores
  only `SHA-256(token)`, sends `session.issued` privately, then a snapshot and
  canvases. Resume looks up the hash; unknown or removed seats get
  `UNAUTHORIZED` so the browser can show the join screen. Only one live socket
  per member: a newer socket closes the older one with code 4001 (the client
  must not auto-reconnect after 4001).
- Every command is de-duplicated by `commandId` (bounded table, newest 1000),
  including drawing batches, because undo/redo/clear are not idempotent.
- After each accepted change: persist state, run effects, ack the sender,
  then send each bound socket its own `projectRoomView` — skipped when
  identical to the last view sent to that socket.
- Canvas effects apply ops with the drawing-model reducer, cap each canvas at
  400 strokes / 20,000 points, persist the document (without undo history)
  after semantic ops, and fan out ops to sockets with full access except the
  sender's own socket. Previews are computed with `computeCanvasPreview` and
  throttled to at most one per canvas per 800 ms. When access widens (a team
  solves, results reveal) the newly allowed canvases are sent as snapshots.
- Alarms wake at `min(getNextWakeAtMs, cleanup)`; idle rooms with no sockets
  are deleted after 6 hours of inactivity.
- Account effects call `apps/realtime/src/accounts/client.ts` inside
  `ctx.waitUntil` and never block or fail the game loop.

## Quick accounts (`AccountActor`)

- `POST /accounts {username, password, displayName?}` → `201 {token, profile}`
  or `409 USERNAME_TAKEN`. `POST /accounts/session` logs in (`401` on bad
  credentials; `429` after 8 failures in 10 minutes). `DELETE
/accounts/session` logs out the bearer token. `GET /accounts/me` returns
  `AccountProfileView`. `PATCH /accounts/me {displayName}`.
- One actor per username (`idFromName('user:' + username)`): uniqueness for
  free, no global index. Passwords use PBKDF2-SHA-256 (100,000 iterations,
  16-byte salt) and constant-time comparison. Tokens are
  `<username>.<32 random bytes base64url>`; only SHA-256 hashes are stored;
  at most 10 sessions per account (oldest evicted).
- History keeps the newest 1,000 word events and 50 match summaries.
  `verifySession` derives memory: `avoid` = drew + seen-report ids;
  `soft` = guessed, missed, offered, unknown-report ids (each capped by
  `WORD_MEMORY_LIMITS`).
- Rooms report word events at round end (and per showdown card), a match
  summary at match end, and a one-time backfill when a guest links an
  account mid-match or on the final screen. The actor also ignores repeated
  `(wordId, role, roomCode, atMs)` events and `(roomCode, matchNumber)`
  summaries, so a retried report never double counts.
- Bearer tokens, not cookies, so the Worker can allow any origin.

## Web

### Keyboard and zoom rules

- Every text input is at least 16 px (iOS Safari zooms smaller inputs on
  focus), uses `autocomplete/autocorrect/autocapitalize off`,
  `spellcheck=false`, and `enterkeyhint=send`.
- Submitting a guess never blurs the input, navigates, or scrolls; focus is
  restored with `preventScroll`.
- The play screen is a fixed full-screen layout pinned to the visual
  viewport; the document itself never scrolls (`overscroll-behavior: none`).
  The play route's viewport uses `interactive-widget=resizes-content` and
  `viewport-fit=cover`, and safe-area insets are respected.
- The whole play UI (`GameViewport`) uses `touch-action: pan-x pan-y`: scroll
  panes still scroll, but pinch zoom and double-tap zoom are blocked
  everywhere on the play screen in Chrome/Android/Firefox (`manipulation`
  would still allow pinch). Safari's `gesture*` events are cancelled too, and
  the canvas uses `touch-action: none`. Page zoom is not disabled in the
  viewport meta (no `maximum-scale`), so browser and accessibility zoom still
  work; while the visual viewport is zoomed (`scale > 1.01`) the layout keeps
  its last unzoomed size instead of re-pinning into the zoomed rectangle.
- The canvas has a fixed 4:3 logical aspect ratio, letterboxed in its pane,
  so every device sees the same drawing proportions and the keyboard opening
  only rescales it.
- Optional **compact keyboard** on touch devices: an in-app QWERTY (40 px
  rows, about 180 px tall) that never opens the native keyboard. Default on
  for coarse pointers. A keyboard button in the guess input row switches to
  the native keyboard and back (the choice persists); a "hide keyboard" key
  tucks the keys away for this screen and tapping the input brings them back.
- Keyboard-aware layout: `GameViewport` exposes `keyboardOpen` (device
  keyboard, from the visual viewport) and `inAppKeyboard` (the guess dock
  registers its compact keys with `useInAppKeyboard`). While either is up on
  a phone (`PlayLayout` stacked or landscape), the guesser's layout tightens
  instead of shrinking the drawing: the clue banner collapses to one 44 px
  line, the feed row and opponent tile hide and the dock's status line shows
  the newest teammate guess and an opponent progress chip, and the top bar
  slims to 44 px while the device keyboard is open. On a 390 x 664 phone the
  paper stays 374 x 280 with the compact keys up and about 250 px wide with
  the device keyboard covering 45% of the screen.
- Drawer tools on phones are all on screen at once (no hidden sideways
  scroll): two rows under the canvas in portrait (pen, eraser, size, undo,
  redo, clear; then 12 colors in a grid), and a narrow panel in the landscape
  sidebar. Sizes open from a size button. Desktop keeps the single strip.
- Landscape phones (`wide-short`): nothing floats over the paper. The
  drawer's sidebar is 13 rem (tools, opponent row, feed); a guesser's is
  19 rem (opponent row, feed, dock with the compact keys).
- The word draft on phones (narrower than 640 px or shorter than 560 px)
  shows each card as a compact row (difficulty, term, bonus; tap to pick)
  with the meaning and swap buttons behind a `?` expander, so every card and
  bonus is visible without scrolling.
- Desktop: type anywhere to start a guess; `↑` recalls the last guess;
  drawer shortcuts B/E, 1–9 colors, `[`/`]` size, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z.

### Identity

- Per-room `{memberId, resumeToken}` in localStorage; a per-tab marker in
  sessionStorage. A new tab with a saved seat asks "Continue as X" or "Join as
  someone new", which also makes multi-tab local testing easy.
- Guests keep the last 300 seen word ids locally and send them on join.
- The account token lives in localStorage and is sent on join/resume and via
  `account.link` after signing up mid-session.

## Tests that must exist

- Word engine: selection honors slots, exclusions, determinism, and never
  repeats inside a room until exhaustion; matching table tests; pack
  validation (unique ids and terms across packs, definitions present,
  difficulty spread).
- Reducer: full match walkthrough, each rule above, bots, secrecy
  properties under every visibility setting, determinism.
- Realtime: join/resume/replace, command dedupe, alarm-driven phase changes,
  canvas fan-out and access, account signup/login/verify/record.
- Browser: create → practice bots → play a round on desktop; two real
  players in two contexts; mobile keyboard stability on the play screen; on a
  390 x 664 phone the guesser's paper stays at least 250 px wide with the
  compact keyboard up, all draft cards fit on screen, and every drawing tool
  is visible in portrait and landscape; pinching the play screen never zooms
  it; `?next=` after signing in never leaves the site.
