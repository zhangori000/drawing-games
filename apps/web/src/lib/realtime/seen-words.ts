import {
  TEAM_IDS,
  type RoomView,
  type RoundResultTeamView,
} from '@drawing-games/game-core'

/**
 * Decides which word ids a guest should remember after each round: their
 * team's word, for the drawer every draft card they were shown (the
 * round-results view no longer carries draft cards, so they are collected
 * while the draft is visible), and last the other team's word, which the
 * results screen reveals to everyone.
 */
export class SeenWordsTracker {
  private roundKey: string | null = null
  private draftIds: string[] = []
  private chosenId: string | null = null
  private recordedKey: string | null = null

  /** Returns ids to record (newest first) once per finished round. */
  observe(view: RoomView): string[] {
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
    if (view.phase !== 'round-results' || !results) return []
    const key = `${matchNumber}:${results.roundNumber}`
    if (key === this.recordedKey) return []
    this.recordedKey = key

    const ids: string[] = []
    const team = view.me?.team
    const ownWordId = team ? resultWordId(results.teams[team]) : null
    if (ownWordId) ids.push(ownWordId)
    if (this.roundKey === key) {
      if (this.chosenId) ids.push(this.chosenId)
      ids.push(...this.draftIds)
    }
    // Revealed on the results screen too, so it is "seen" (lowest priority:
    // the stored history keeps the newest ids first and drops the oldest).
    for (const other of TEAM_IDS) {
      if (other === team) continue
      const otherWordId = resultWordId(results.teams[other])
      if (otherWordId) ids.push(otherWordId)
    }
    return [...new Set(ids)]
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
