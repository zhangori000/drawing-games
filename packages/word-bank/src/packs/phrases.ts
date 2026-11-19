import type { WordPackData } from '../play/types'

/**
 * Curated `phrases` pack. Ids derive from `phrases/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const PHRASES_PACK: WordPackData = {
  id: 'phrases',
  words: [
    {
      term: 'piece of cake',
      difficulty: 'hard',
      definition: 'Something very easy to do.',
    },
    {
      term: 'break the ice',
      difficulty: 'hard',
      definition: 'Do something to make people feel less awkward.',
    },
    {
      term: 'raining cats and dogs',
      difficulty: 'hard',
      definition: 'Raining very heavily.',
    },
    {
      term: 'couch potato',
      difficulty: 'medium',
      definition: 'A lazy person who watches lots of TV.',
    },
    {
      term: 'time flies',
      difficulty: 'hard',
      definition: 'Time seems to pass very quickly.',
    },
    {
      term: 'cold feet',
      difficulty: 'medium',
      definition: 'Feeling nervous right before something big.',
    },
  ],
}
