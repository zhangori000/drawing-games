import type { WordPackData } from '../play/types'

/**
 * Curated `everyday` pack. Ids derive from `everyday/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const EVERYDAY_PACK: WordPackData = {
  id: 'everyday',
  words: [
    {
      term: 'umbrella',
      difficulty: 'easy',
      definition: 'A folding cover you hold over your head in the rain.',
    },
    {
      term: 'toothbrush',
      difficulty: 'easy',
      definition: 'A small brush for cleaning your teeth.',
    },
    {
      term: 'alarm clock',
      difficulty: 'medium',
      definition: 'A clock that rings to wake you up.',
    },
    {
      term: 'backpack',
      difficulty: 'easy',
      definition: 'A bag with shoulder straps worn on your back.',
    },
    {
      term: 'magnifying glass',
      difficulty: 'medium',
      definition: 'A round lens with a handle that makes things look bigger.',
    },
    {
      term: 'paper shredder',
      difficulty: 'hard',
      definition: 'A machine that cuts paper into thin strips.',
    },
  ],
}
