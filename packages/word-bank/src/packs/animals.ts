import type { WordPackData } from '../play/types'

/**
 * Curated `animals` pack. Ids derive from `animals/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const ANIMALS_PACK: WordPackData = {
  id: 'animals',
  words: [
    {
      term: 'cat',
      difficulty: 'easy',
      definition: 'A small furry pet that purrs and meows.',
    },
    {
      term: 'rabbit',
      difficulty: 'easy',
      definition: 'A small animal with long ears that hops.',
    },
    {
      term: 'octopus',
      difficulty: 'medium',
      definition: 'A sea animal with eight arms.',
    },
    {
      term: 'kangaroo',
      difficulty: 'medium',
      definition:
        'An Australian animal that hops and carries babies in a pouch.',
    },
    {
      term: 'hermit crab',
      difficulty: 'hard',
      definition: 'A crab that lives inside an empty shell it carries around.',
    },
    {
      term: 'praying mantis',
      difficulty: 'hard',
      definition:
        'A green insect that holds its front legs together as if praying.',
    },
  ],
}
