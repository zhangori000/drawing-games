import { describe, expect, it } from 'vitest'

import { customWordList, startHumanRoom, RoomDriver } from './test-driver'

/** Six made-up words per difficulty, tagged the way a host would type them. */
function taggedList(): string[] {
  const words = customWordList(18)
  return words.map((word, index) => {
    const tag = (['easy', 'medium', 'hard'] as const)[index % 3]
    return index % 2 === 0 ? `${word}|${tag}` : `${word} | ${tag.toUpperCase()}`
  })
}

describe('custom word difficulty tags', () => {
  it('stores tags in canonical form and drops malformed ones', () => {
    const driver = new RoomDriver()
    driver.join('host', 'Host')
    driver.settings('host', {
      customWords: [
        'paper shredder | HARD',
        'kite|easy',
        'Kite|hard',
        'pizza night',
        'typo|huge',
        'a|hard',
        `${'a'.repeat(32)}|medium`,
      ],
    })
    expect(driver.state.settings.customWords).toEqual([
      'paper shredder|hard',
      'kite|easy',
      'pizza night',
      `${'a'.repeat(32)}|medium`,
    ])
    // Everyone else only learns how many there are.
    driver.join('p2', 'P2')
    expect(driver.view('p2').settings).toMatchObject({
      customWords: [],
      customWordCount: 4,
    })
  })

  it('deals tagged custom words as a balanced draft with no definitions', () => {
    const driver = startHumanRoom({
      settings: { customWordsMode: 'only', customWords: taggedList() },
    })
    const drawer = driver.drawer('A')
    const options = driver.view(drawer).round?.mine?.options ?? []
    expect(options.map((option) => option.difficulty).sort()).toEqual([
      'easy',
      'hard',
      'medium',
    ])
    for (const option of options) {
      expect(option).toMatchObject({
        packId: 'custom',
        definition: null,
        unrated: false,
      })
    }
    expect(options.map((option) => option.bonus).sort()).toEqual([0, 20, 40])
  })

  it('marks untagged custom words unrated for the drawer and in results only', () => {
    const driver = startHumanRoom({
      settings: { customWordsMode: 'only', customWords: customWordList(18) },
    })
    const drawerA = driver.drawer('A')
    const options = driver.view(drawerA).round?.mine?.options ?? []
    expect(options).toHaveLength(3)
    for (const option of options) {
      expect(option).toMatchObject({
        difficulty: 'medium',
        bonus: 20,
        unrated: true,
        definition: null,
      })
    }
    driver.pickWords()
    expect(driver.view(drawerA).round?.mine?.word).toMatchObject({
      unrated: true,
      definition: null,
      difficulty: 'medium',
    })
    // A guesser's stake reads like any medium word: "Custom" would tell
    // them it is one of the host's words even with the category hint off.
    const guesserA = driver.guesser('A')
    expect(driver.view(guesserA).round?.mine).toMatchObject({
      difficulty: 'medium',
      word: null,
    })
    expect(JSON.stringify(driver.view(guesserA).round)).not.toContain('unrated')

    driver.solve('A')
    driver.advanceTo(driver.state.phaseDeadlineAtMs!)
    expect(driver.state.phase).toBe('round-results')
    const result = driver.view(guesserA).results?.teams.A
    expect(result).toMatchObject({ unrated: true, difficulty: 'medium' })
    // Scored exactly like a medium word.
    expect(
      driver.state.match!.round!.teams.A.solution?.breakdown,
    ).toMatchObject({ difficultyBonus: 20 })
  })
})
