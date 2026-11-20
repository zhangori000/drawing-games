import {
  TEAM_IDS,
  type RoomView,
  type RoundResultTeamView,
} from '@drawing-games/game-core'

/** Word ids to remember after a round, newest first (see `word-history`). */
export interface SeenWordIds {
  /** The word this player drew: never dealt to them as drawer again. */
  readonly avoid: string[]
  /** Everything else they met this round: dealt less often. */
  readonly soft: string[]
}

const nothing = (): SeenWordIds => ({ avoid: [], soft: [] })

/**
 * Decides which word ids a guest should remember after each round, the way
 * an account's history does: the word they drew goes to `avoid`; their
 * team's word as a guesser, every other draft card they were shown as
 * drawer (the round-results view no longer carries draft cards, so they are
 * collected while the draft is visible), and last the other team's word,
 * which the results screen reveals to everyone, go to `soft`. A drawer whose
 * turn someone took over did not draw the word, so it is only `soft` for
 * them. ("Seen it" reports are recorded by the room client when the swap is
 * accepted.)
 */
export class SeenWordsTracker {
  private roundKey: string | null = null
  private draftIds: string[] = []
  private chosenId: string | null = null
  private recordedKey: string | null = null

  /** Returns ids to record once per finished round. */
  observe(view: RoomView): SeenWordIds {
    const matchNumber = view.match?.number ?? 0
    const round = view.round
    if (round && (view.phase === 'word-draft' || view.phase === 'drawing')) {
      this.enterRound(`${matchNumber}:${round.number}`)
      const mine = round.mine
      for (const option of mine?.options ?? []) {
        if (!this.draftIds.includes(option.wordId)) {
          this.draftIds.push(option.wordId)
        }
      }
      if (mine?.word) this.chosenId = mine.word.wordId
    }

    const results = view.results
    if (view.phase !== 'round-results' || !results) return nothing()
    const key = `${matchNumber}:${results.roundNumber}`
    if (key === this.recordedKey) return nothing()
    this.recordedKey = key

    const team = view.me?.team
    const own = team ? results.teams[team] : undefined
    const ownWordId = resultWordId(own)
    const sameRound = this.roundKey === key
    const chosenId = sameRound ? this.chosenId : null
    // Still this team's drawer when the round ended (results name the drawer;
    // a results view without one falls back to "picked the word here").
    const resultDrawer: unknown = own?.drawerId
    const drew =
      typeof resultDrawer === 'string'
        ? resultDrawer === view.me?.memberId
        : chosenId !== null
    const drawnId = drew ? (ownWordId ?? chosenId) : null

    const soft: string[] = []
    if (ownWordId) soft.push(ownWordId)
    if (chosenId) soft.push(chosenId)
    if (sameRound) soft.push(...this.draftIds)
    // Revealed on the results screen too, so it is "seen" (lowest priority:
    // the stored history keeps the newest ids first and drops the oldest).
    for (const other of TEAM_IDS) {
      if (other === team) continue
      const otherWordId = resultWordId(results.teams[other])
      if (otherWordId) soft.push(otherWordId)
    }
    return {
      avoid: drawnId === null ? [] : [drawnId],
      soft: [...new Set(soft)].filter((id) => id !== drawnId),
    }
  }

  private enterRound(key: string): void {
    if (this.roundKey === key) return
    this.roundKey = key
    this.draftIds = []
    this.chosenId = null
  }
}

/**
 * The results view's word id, so guessers remember their team's word too.
 * Still checked at runtime: a realtime deploy older than the web app (they
 * ship separately) sends results without it.
 */
function resultWordId(team: RoundResultTeamView | undefined): string | null {
  const wordId: unknown = team?.wordId
  return typeof wordId === 'string' && wordId.length > 0 ? wordId : null
}
