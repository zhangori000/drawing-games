import type { WordPackData } from '../play/types'

/**
 * Curated `nature` pack. Ids derive from `nature/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const NATURE_PACK: WordPackData = {
  id: 'nature',
  words: [
    {
      term: 'tree',
      difficulty: 'easy',
      definition: 'A tall plant with a trunk, branches, and leaves.',
    },
    {
      term: 'rainbow',
      difficulty: 'easy',
      definition: 'An arc of colors in the sky after rain.',
    },
    {
      term: 'waterfall',
      difficulty: 'medium',
      definition: 'A river dropping over the edge of a cliff.',
    },
    {
      term: 'volcano',
      difficulty: 'medium',
      definition: 'A mountain that can erupt with lava.',
    },
    {
      term: 'quicksand',
      difficulty: 'hard',
      definition: 'Wet sand that you sink into if you step on it.',
    },
    {
      term: 'tornado',
      difficulty: 'medium',
      definition: 'A spinning funnel of wind reaching down from a storm.',
    },
  ],
}
