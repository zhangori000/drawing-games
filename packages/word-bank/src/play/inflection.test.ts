import { describe, expect, it } from 'vitest'

import {
  MIN_VERB_STEM,
  baseVerbForms,
  ingForms,
  isIngForm,
  verbFormKeys,
} from './inflection'
import { getAllPlayableWords } from './pool'
import { answerTokens } from './text'

describe('isIngForm', () => {
  it.each(['running', 'lying', 'skiing', 'juggling', 'ceiling', 'wedding'])(
    '%s is shaped like an -ing form',
    (token) => {
      expect(isIngForm(token)).toBe(true)
    },
  )

  it.each([
    'king',
    'ring',
    'thing',
    'spring',
    'string',
    'sing',
    'swing',
    'ing',
  ])('%s only ends in the letters', (token) => {
    expect(isIngForm(token)).toBe(false)
  })
})

describe('ingForms', () => {
  it.each([
    ['jump', ['jumping']],
    ['surf', ['surfing']],
    ['juggle', ['juggling']],
    ['dance', ['dancing']],
    ['dive', ['diving']],
    ['write', ['writing']],
    ['run', ['running']],
    ['swim', ['swimming']],
    ['dig', ['digging']],
    ['shop', ['shopping']],
    ['lie', ['lying']],
    ['tie', ['tying']],
    ['die', ['dying']],
    ['ski', ['skiing']],
    ['see', ['seeing']],
    ['tiptoe', ['tiptoeing']],
    ['dye', ['dyeing']],
    ['glue', ['gluing']],
    ['cry', ['crying']],
    ['play', ['playing']],
    ['snow', ['snowing']],
    ['fix', ['fixing']],
    ['whisper', ['whispering']],
    ['open', ['opening']],
    ['iron', ['ironing']],
    ['visit', ['visiting', 'visitting']],
    ['begin', ['begining', 'beginning']],
    ['eavesdrop', ['eavesdroping', 'eavesdropping']],
    ['picnic', ['picnicking', 'picnicing']],
    ['sing', ['singing']],
    ['swing', ['swinging']],
  ])('%s → %j', (token, expected) => {
    expect(ingForms(token).sort()).toEqual([...expected].sort())
  })

  it.each([
    // Already an -ing form.
    'running',
    'juggling',
    'ceiling',
    // Plurals are nouns, not verbs.
    'hands',
    'bubbles',
    'marbles',
    'sunglasses',
    // Stubs, no vowel, non-Latin.
    'go',
    'tv',
    'zzz',
    'кот',
    'café',
  ])('%s has no -ing form', (token) => {
    expect(ingForms(token)).toEqual([])
  })

  it('never turns a noun into a different -ing noun', () => {
    expect(ingForms('bed')).toEqual([])
    expect(ingForms('dress')).toEqual([])
    expect(ingForms('wed')).toEqual([])
    expect(ingForms('stock')).toEqual([])
    expect(ingForms('top')).toEqual([])
  })

  it('allows -ing nouns when the token is certainly a verb', () => {
    expect(ingForms('build')).toEqual([])
    expect(ingForms('build', { knownVerb: true })).toEqual(['building'])
  })
})

describe('baseVerbForms', () => {
  it.each([
    ['jumping', ['jump']],
    ['surfing', ['surf']],
    ['eating', ['eat']],
    ['reading', ['read']],
    ['cooking', ['cook']],
    ['sleepwalking', ['sleepwalk']],
    ['crawling', ['crawl']],
    ['bowling', ['bowl']],
    // Doubled consonants undo; natural pairs stay.
    ['running', ['run']],
    ['swimming', ['swim']],
    ['digging', ['dig']],
    ['shrugging', ['shrug']],
    ['eavesdropping', ['eavesdrop']],
    ['cutting', ['cut']],
    ['yelling', ['yell']],
    ['spilling', ['spill']],
    ['kissing', ['kiss']],
    ['sniffing', ['sniff']],
    // Silent e comes back.
    ['dancing', ['dance']],
    ['juggling', ['juggle']],
    ['tickling', ['tickle']],
    ['recycling', ['recycle']],
    ['diving', ['dive']],
    ['driving', ['drive']],
    ['writing', ['write']],
    ['hiking', ['hike']],
    ['shaving', ['shave']],
    ['smiling', ['smile']],
    ['styling', ['style']],
    ['sneezing', ['sneeze']],
    ['judging', ['judge']],
    ['charging', ['charge']],
    ['arguing', ['argue']],
    ['coming', ['come']],
    // -ie became -y.
    ['lying', ['lie']],
    ['tying', ['tie']],
    ['dying', ['die']],
    // Vowel endings.
    ['skiing', ['ski']],
    ['seeing', ['see']],
    ['tiptoeing', ['tiptoe']],
    ['crying', ['cry']],
    ['flying', ['fly']],
    ['playing', ['play']],
    // Multi-syllable stems.
    ['whispering', ['whisper']],
    ['shivering', ['shiver']],
    ['ironing', ['iron']],
    ['opening', ['open']],
    ['visiting', ['visit', 'visite']],
    ['hibernating', ['hibernat', 'hibernate']],
    // Endings that may have had a silent e.
    ['sunbathing', ['sunbath', 'sunbathe']],
    ['raising', ['rais', 'raise']],
    ['changing', ['chang', 'change']],
    ['using', ['use']],
    ['singing', ['sing']],
    ['bringing', ['bring']],
  ])('%s → %j', (token, expected) => {
    expect(baseVerbForms(token).sort()).toEqual([...expected].sort())
  })

  it.each([
    // Not -ing forms at all.
    'king',
    'ring',
    'thing',
    'spring',
    'string',
    'swing',
    'sing',
    'jump',
    // Would leave fewer than MIN_VERB_STEM letters.
    'being',
    'doing',
    'going',
    // -ing nouns whose stem is a different word or a stub.
    'wedding',
    'bedding',
    'pudding',
    'ceiling',
    'icing',
    'evening',
    'morning',
    'stocking',
    'lightning',
    'dumpling',
    'earring',
    'herring',
    'thanksgiving',
    'lining',
    'landing',
    'charming',
    // Non-Latin or accented tokens are left alone.
    'кошкаing',
  ])('%s has no base form', (token) => {
    expect(baseVerbForms(token)).toEqual([])
  })

  it('allows -ing nouns when the token starts a verb phrase', () => {
    expect(baseVerbForms('building')).toEqual([])
    expect(baseVerbForms('building', { knownVerb: true })).toEqual(['build'])
  })

  it('never returns a stub or a vowel-less form', () => {
    for (const { term, aliases } of getAllPlayableWords()) {
      for (const answer of [term, ...aliases]) {
        for (const token of answerTokens(answer)) {
          for (const form of baseVerbForms(token, { knownVerb: true })) {
            expect(form.length).toBeGreaterThanOrEqual(MIN_VERB_STEM)
            expect(form).toMatch(/[aeiouy]/)
            expect(token.startsWith(form.slice(0, -1))).toBe(true)
          }
        }
      }
    }
  })

  it('round-trips with ingForms for every verb it derives in the catalog', () => {
    const problems: string[] = []
    for (const { term, aliases } of getAllPlayableWords()) {
      for (const answer of [term, ...aliases]) {
        for (const token of answerTokens(answer)) {
          const bases = baseVerbForms(token, { knownVerb: true })
          if (bases.length === 0) continue
          const roundTrips = bases.some((base) =>
            ingForms(base, { knownVerb: true }).includes(token),
          )
          if (!roundTrips) problems.push(`${token} → ${bases.join('/')}`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})

describe('verbFormKeys', () => {
  const keys = (term: string) => verbFormKeys(answerTokens(term)).sort()

  it('inflects a single word either way', () => {
    expect(keys('juggling')).toEqual(['juggle'])
    expect(keys('juggle')).toEqual(['juggling'])
    expect(keys('swing')).toEqual(['swinging'])
    expect(keys('wedding')).toEqual([])
  })

  it('inflects the last word of a multi-word answer', () => {
    expect(keys('tightrope walking')).toEqual(['tightropewalk'])
    expect(keys('tap dancing')).toEqual(['tapdance'])
    expect(keys('water skiing')).toEqual(['waterski'])
    expect(keys('scuba diving')).toEqual(['scubadive'])
    expect(keys('ice skate')).toEqual(['iceskating'])
  })

  it('leaves -ing nouns and noun compounds alone', () => {
    expect(keys('wedding ring')).toEqual([])
    expect(keys('silver lining')).toEqual([])
    expect(keys('moon landing')).toEqual([])
    // A leading -ing modifier is not a verb phrase without a marker.
    expect(keys('swimming pool')).toEqual([])
    expect(keys('shooting star')).toEqual([])
    expect(keys('washing machine')).toEqual([])
  })

  it('inflects the leading verb of a verb phrase', () => {
    expect(keys('flying a kite')).toEqual(['flyakite'])
    expect(keys('making the bed')).toEqual(['makethebed'])
    expect(keys('raising your hand')).toEqual(
      ['raisyourhand', 'raiseyourhand'].sort(),
    )
    expect(keys('building a sandcastle')).toEqual(['buildasandcastle'])
    expect(keys('walking on eggshells')).toEqual(['walkoneggshells'])
    expect(keys('brushing teeth')).toEqual(['brushteeth'])
    expect(keys('washing hands')).toEqual(['washhands'])
    expect(keys('break the ice')).toEqual(['breakingtheice'])
    expect(keys('spill the beans')).toEqual(['spillingthebeans'])
  })

  it('never shortens a word that only ends in -ing letters', () => {
    for (const term of ['king', 'onion ring', 'hot spring', 'thing']) {
      const key = answerTokens(term).join('')
      for (const form of verbFormKeys(answerTokens(term))) {
        expect(form.length).toBeGreaterThan(key.length)
      }
    }
  })

  it('handles empty and one-token input', () => {
    expect(verbFormKeys([])).toEqual([])
    expect(verbFormKeys(['run'])).toEqual(['running'])
  })
})
