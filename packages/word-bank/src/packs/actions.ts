import type { WordPackData } from '../play/types'

/**
 * Curated `actions` pack. Ids derive from `actions/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const ACTIONS_PACK: WordPackData = {
  id: 'actions',
  words: [
    {
      term: 'sleeping',
      difficulty: 'easy',
      definition: 'Resting with your eyes closed.',
    },
    {
      term: 'jumping',
      difficulty: 'easy',
      definition: 'Pushing off the ground into the air.',
    },
    {
      term: 'juggling',
      difficulty: 'medium',
      definition: 'Keeping several objects tossed in the air at once.',
    },
    {
      term: 'sneezing',
      difficulty: 'medium',
      definition: 'A sudden burst of air from your nose: achoo!',
    },
    {
      term: 'sleepwalking',
      difficulty: 'hard',
      definition: 'Walking around while still asleep.',
    },
    {
      term: 'tightrope walking',
      difficulty: 'hard',
      definition: 'Balancing while walking along a high rope.',
    },
  ],
}
