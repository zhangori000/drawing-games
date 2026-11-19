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
  lobby. Host transfers to the earliest-joined connected human, else any human.
- Host also transfers automatically when the host has been disconnected for
  15 s and another human is connected (checked in `advanceRoom`).
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
- `lobby.add-bot` (host, lobby): ids `bot_<n>`; names cycle through
  `Pixel Pete, Doodlebot, Sketchy, Inkling, Scribbles, Smudge, Squiggles,
Blotto`. Bots are always connected and ready and never have accounts.
- `lobby.remove-member` (host, lobby, not self).
- `match.start` (host, lobby): each team needs 2–8 members, and every
  connected human other than the host must be ready (the host pressing Start
  is their ready). Blockers appear in `LobbyView.blockers` in plain words,
  e.g. `Moon needs at least 2 players`, `Waiting for Theo to ready up`.

### Drawer rotation

Each team keeps `drawerTurns[team]`. The drawer is
`roster[turns % roster.length]`, skipping members disconnected for more than
10 s (reconnect grace); if everyone is gone the base pick stands. Both teams
advance by one turn after every normal round.

### Word draft (the headline improvement)

At round start, for team A then team B:

1. **Pool**: `buildWordPool(settings)` (enabled packs ± custom words).
2. **Slots**: `difficultySlots(settings.difficultyMix, wordChoiceCount, rng)`.
   `balanced` means three cards are always one easy, one medium, one hard,
   each labelled with its bonus (+0/+20/+40) so the choice is meaningful.
3. **Hard exclusions** (never offered):
   - every word already drawn in this room, across rematches (until fewer
     than `4 × wordChoiceCount` words would remain; then only the most recent
     half of the used list stays excluded);
   - the drawer's `memory.avoid` (drew before, reported "seen it");
   - the other team's cards this round.
4. **Penalties** (lower odds, multiplied, floored at 0.01):
   - offered in this room within the last 6 drafts: ×0.05; offered earlier:
     ×0.35;
   - in the drawer's `memory.soft`: ×0.2;
   - in any teammate's `memory.avoid` or `memory.soft`: ×0.3 each.
5. **Pack variety**: packs of the last two chosen words ×0.6; cards in one
   draft prefer different packs.
6. **Word families**: options must not share a stem (`wordStems`) with each
   other, with the other team's cards, or with the last two drawn words
   (falls back gracefully on tiny pools).

Every offered card updates `wordMemory.offeredAt`, and `draftCounter`
increments per team draft. `canvas.reset` is emitted for both team canvases
(`m<match>-r<round>-<team>`). Deadline: `wordDraftSeconds`.

- `draft.select`: the team's drawer only, before the deadline, a current card.
  When both teams have chosen, drawing starts immediately.
- `draft.replace`: drawer only, while unchosen, within
  `replacementsPerDrawer`. The replacement keeps the replaced card's
  difficulty and excludes all current cards and previously replaced words.
  `seen-before` adds the word to the drawer's in-room `memory.avoid`;
  `unknown-definition` adds it to `memory.soft`. The UI shows the definition
  first, so "don't know it" is a last resort rather than the only help.
- At the draft deadline each unchosen team gets a random remaining card
  (`chosenBy: 'auto'`).

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
  `matchGuess(text, { term, aliases })` decides the verdict. Every guess
  emits private `guess.feedback`. The team feed keeps the last 60 guesses.
- A correct guess locks that team's points:
  `round(50 + 50·remaining/drawingSeconds) + {0,20,40} − hintCost?`, never
  below 0. The other team keeps playing against the same deadline. Both
  solved ends the round early.
- Length hint (`hidden-vote`): from `hintUnlockSeconds` after drawing starts,
  human guessers on a team vote; more than half of that team's human
  guessers approving reveals the pattern to that team only and costs
  `hintCost` if they later solve. `shown` reveals from the start for free;
  `hidden` never reveals.
- `categoryHint` shows guessers the pack name of their own word.

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

### Practice bots

Bots exist so one person can test the full game. Their behavior is scheduled
by the reducer through `state.bots.schedule` and executed in `advanceRoom`;
`getNextWakeAtMs` includes the next bot action.

- Bot drawer: picks a card 2–5 s into the draft; then draws the word as
  single-stroke letters (`renderTextStrokes`) one stroke every 0.7–1.2 s.
- Bot guessers: 1–3 wrong guesses (other pool words) at random times, then a
  correct guess. With a bot drawer: a few seconds after most letters are
  drawn. With a human drawer: at a random point in 35–85 % of the round, but
  only once the drawer has at least 3 strokes (otherwise retry 5 s later).
- Bots never vote and never record account data.

### Projection secrecy (must be tested with properties)

- A team's draft cards, chosen term, and definition reach only that team's
  drawer. Opponents see cards/actions only during the draft and only as
  `opponentDraftVisibility` allows. The owning team's guessers never see
  their own term before round results.
- Guess texts reach only the guesser's own team; correct guesses are shown
  as `text: null`.
- `pattern`/`letterCount` reach guessers only when shown or revealed.
- Results and final views reveal everything about finished rounds.

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
- The whole play UI uses `touch-action: manipulation` (no double-tap zoom);
  the canvas uses `touch-action: none` and cancels Safari `gesture*` events,
  so pinching or double-tapping while drawing never zooms the page. Page zoom
  is not globally disabled (accessibility).
- The canvas has a fixed 4:3 logical aspect ratio, letterboxed in its pane,
  so every device sees the same drawing proportions and the keyboard opening
  only rescales it.
- Optional **compact keyboard** on touch devices: an in-app QWERTY that never
  opens the native keyboard, so the viewport never resizes. Default on for
  coarse pointers; one tap switches to the native keyboard; the choice
  persists.
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
  players in two contexts; mobile keyboard stability on the play screen.
