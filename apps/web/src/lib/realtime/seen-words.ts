import type { RoomView } from '@drawing-games/game-core'

/**
 * Decides which word ids a guest should remember after each round: their
 * team's word and, for the drawer, every draft card they were shown (the
 * round-results view no longer carries draft cards, so they are collected
 * while the draft is visible).
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
    const ownWordId = team ? readWordId(results.teams[team]) : null
    if (ownWordId) ids.push(ownWordId)
    if (this.roundKey === key) {
      if (this.chosenId) ids.push(this.chosenId)
      ids.push(...this.draftIds)
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
 * `RoundResultTeamView` does not carry a word id in the v1 contract; read it
 * when a server adds one (optional field) so guessers can remember their
 * team's word too.
 */
function readWordId(team: object | undefined): string | null {
  if (!team || !('wordId' in team)) return null
  return typeof team.wordId === 'string' ? team.wordId : null
}
