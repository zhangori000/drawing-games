import type { WordPackData } from '../play/types'

/**
 * Curated `sports` pack. Ids derive from `sports/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const SPORTS_PACK: WordPackData = {
  id: 'sports',
  words: [
    {
      term: 'soccer ball',
      difficulty: 'easy',
      definition: 'A round black-and-white ball you kick.',
    },
    {
      term: 'skateboard',
      difficulty: 'easy',
      definition: 'A small board on wheels you ride standing up.',
    },
    {
      term: 'bowling',
      difficulty: 'medium',
      definition: 'Rolling a heavy ball to knock down pins.',
    },
    {
      term: 'trampoline',
      difficulty: 'medium',
      definition: 'A stretchy mat on a frame for bouncing.',
    },
    {
      term: 'hole in one',
      difficulty: 'hard',
      definition: 'Getting a golf ball in the hole with a single shot.',
    },
    {
      term: 'tug of war',
      difficulty: 'hard',
      definition: 'Two teams pulling opposite ends of a rope.',
    },
  ],
}
