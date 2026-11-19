import type { WordPackData } from '../play/types'

/**
 * Curated `vehicles` pack. Ids derive from `vehicles/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const VEHICLES_PACK: WordPackData = {
  id: 'vehicles',
  words: [
    {
      term: 'car',
      difficulty: 'easy',
      definition: 'A road vehicle with four wheels and an engine.',
    },
    {
      term: 'bicycle',
      difficulty: 'easy',
      definition: 'A two-wheeled ride you pedal.',
      aliases: ['bike'],
    },
    {
      term: 'helicopter',
      difficulty: 'medium',
      definition: 'An aircraft with spinning blades on top.',
    },
    {
      term: 'submarine',
      difficulty: 'medium',
      definition: 'A ship that travels underwater.',
    },
    {
      term: 'hot air balloon',
      difficulty: 'hard',
      definition: 'A huge balloon lifted by hot air with a basket below.',
    },
    {
      term: 'traffic jam',
      difficulty: 'hard',
      definition: 'A long line of cars stuck and barely moving.',
    },
  ],
}
