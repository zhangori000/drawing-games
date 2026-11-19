import type { WordPackData } from '../play/types'

/**
 * Curated `places` pack. Ids derive from `places/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const PLACES_PACK: WordPackData = {
  id: 'places',
  words: [
    {
      term: 'house',
      difficulty: 'easy',
      definition: 'A building where people live.',
    },
    {
      term: 'castle',
      difficulty: 'easy',
      definition: 'A big stone building with towers, from long ago.',
    },
    {
      term: 'lighthouse',
      difficulty: 'medium',
      definition: 'A tall tower with a bright light that guides ships.',
    },
    {
      term: 'library',
      difficulty: 'medium',
      definition: 'A building full of books you can borrow.',
    },
    {
      term: 'haunted house',
      difficulty: 'hard',
      definition: 'A spooky house said to have ghosts.',
    },
    {
      term: 'treehouse',
      difficulty: 'medium',
      definition: 'A small hut built up in the branches of a tree.',
    },
  ],
}
