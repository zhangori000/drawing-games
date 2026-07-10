# Architecture fitness functions

These checks turn architecture claims into evidence. Initial thresholds are
release targets for the first playable version; performance numbers are
hypotheses until measured on representative mobile devices and networks.

## Reference workload

Unless a test names another workload, use one room with 16 players, two active
drawers, 90-second rounds, 30 drawing append batches per second per drawer, and
a burst of 10 guesses per second. Include one slow receiver and one reconnecting
player. Test both a nearby group and a cross-continent group.

## Required portfolio

| Characteristic            | Fitness function                                                                                  | Initial pass condition                                                                                                                                                            | When                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Module integrity          | Analyze workspace imports and cycles                                                              | Packages never import apps; `game-core` has no React, Next.js, Cloudflare, DOM, database, or socket import; no package cycles                                                     | Every PR                          |
| Deterministic rules       | Run the same command sequence with an injected clock and RNG seed                                 | Byte-equivalent state and events on every replay                                                                                                                                  | Every PR                          |
| State-machine safety      | Property-test legal and illegal phase sequences                                                   | No illegal transition; exactly one active drawer per team; deadlines never move from a client command                                                                             | Every PR                          |
| Deadline authority        | Submit guesses and draft choices immediately before and after stored deadlines                    | Server accepts before and rejects after, regardless of client clock or delayed alarm                                                                                              | Every PR                          |
| Retry safety              | Deliver every scoring, vote, Seen, surrender, and drawing operation twice                         | One semantic effect, one score change, and one canonical operation                                                                                                                | Every PR                          |
| Scoring bounds            | Property-test all finite/non-finite time inputs and difficulties                                  | Normal score follows `round(50 + 50r/R) + {0,20,40} - hint`; unhinted range 50–140, hinted minimum 40; never negative                                                             | Every PR                          |
| Shutdown bounds           | Generate scores, winners, and streaks                                                             | Only a previously trailing team breaking the opponent's streak receives `min(30, 10*(streak-1))`; otherwise zero                                                                  | Every PR                          |
| Showdown fairness         | Generate roster sizes and prior word-set sizes                                                    | Drawer turns differ by at most one; each clear is 10 points; first full clear adds 20 once; no difficulty, hint, or shutdown modifier                                             | Every PR                          |
| Projection secrecy        | Snapshot every role under every draft-visibility setting                                          | Owning-team guessers never receive their selected answer; opponent options/actions appear only as configured; raw opponent vectors never appear                                   | Every PR                          |
| Protocol evolution        | Run current readers against the previous supported protocol fixture and vice versa                | Optional fields are tolerated; removed identifiers are not reused; unsupported major versions fail with an explicit upgrade response                                              | Every PR                          |
| Actor recovery            | Evict/restart the room actor in every timed phase and after score/edit operations                 | Restored phase, deadline, membership, prompts, scores, rotations, completed strokes, and command dedupe state match persisted truth                                               | Every PR                          |
| Reconnect experience      | Refresh, background/foreground, replace a socket, and restore from a stale `serverSeq`            | Player returns to the current phase and role—not the lobby—within 3 seconds p95 after connectivity returns; stale socket commands fail                                            | Pre-release and nightly           |
| Local ink latency         | Measure pointer event to local paint on baseline low/mid mobile devices                           | p95 ≤16 ms and p99 ≤33 ms while networking is impaired                                                                                                                            | Pre-release                       |
| Remote ink latency        | Measure accepted point batch to paint on another client at reference load                         | p95 ≤150 ms nearby and ≤300 ms cross-continent; report full histograms, not averages                                                                                              | Pre-release and production canary |
| Room processing           | Measure actor receive-to-broadcast-ready time at reference load                                   | p95 ≤50 ms, p99 ≤100 ms, with no dropped completed operation                                                                                                                      | Pre-release and canary            |
| Bounded load              | Flood drawing, guesses, reconnects, and one slow client                                           | Inbound frames and point counts are capped; client soft backpressure begins by 256 KiB buffered and hard recovery by 1 MiB; one slow client cannot grow room memory without bound | Pre-release                       |
| Longevity                 | Run a two-hour room with realistic bursts, quiet periods, reconnects, and compaction              | No monotonic queue/storage leak; memory after compaction stays within 20% of the first stable hour                                                                                | Nightly                           |
| Mobile viewport stability | Automate focus/type/submit/wrong-guess/retry, then manually verify real Safari and Android        | Document scroll does not jump; canvas top and width change ≤4 CSS px; logical drawing coordinates do not reset; at least 45% remains visible; Enter does not navigate             | Every UI change and pre-release   |
| Accessible input          | Keyboard, touch, pen, zoom, color-vision, and screen-reader checks                                | Controls have names and 44×44 CSS-pixel targets; color is not the only state cue; drawing does not trap page zoom outside the canvas                                              | Pre-release                       |
| AI isolation              | Replace `WordSource` with failure, malformed, slow, toxic, duplicate, and expensive test adapters | Invalid output never enters a room; timeout/cost limits apply; curated fallback starts the game; no provider import enters realtime drawing or game rules                         | When AI adapter is added          |

## Observability required to evaluate the functions

Record histograms for command processing, end-to-end remote drawing, reconnect,
snapshot size, WebSocket buffered bytes, actor CPU/memory, storage writes, and
phase-alarm delay. Tag by coarse region, device class, protocol version, and
game version without logging secret words, resume tokens, raw guesses, or full
drawing content by default.

Track fault and user outcome separately. A socket close is a fault; “player
returned to the same match within three seconds” is the recovery outcome.

## Governance

- A failing safety, secrecy, score, or reconnect function blocks release.
- A latency miss blocks release only after confirming the test environment; the
  result and accepted exception must be recorded.
- Every production incident adds or strengthens at least one emergent fitness
  function when an objective regression check is possible.
- Threshold changes require evidence and a short ADR update; lowering a target
  merely to make CI green is not evidence.
