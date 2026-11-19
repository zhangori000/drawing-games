import type { WordPackData } from '../play/types'

/**
 * Curated `holidays` pack. Ids derive from `holidays/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const HOLIDAYS_PACK: WordPackData = {
  id: 'holidays',
  words: [
    {
      term: 'birthday cake',
      difficulty: 'easy',
      definition: "A cake with candles for someone's birthday.",
    },
    {
      term: 'balloon',
      difficulty: 'easy',
      definition: 'A rubber bag filled with air or helium.',
    },
    {
      term: 'snowman',
      difficulty: 'medium',
      definition: 'A figure made of stacked snowballs.',
    },
    {
      term: 'fireworks',
      difficulty: 'medium',
      definition: 'Colorful explosions in the sky at celebrations.',
    },
    {
      term: 'piñata',
      difficulty: 'medium',
      definition: 'A decorated container full of candy you hit with a stick.',
      aliases: ['pinata'],
    },
    {
      term: 'trick or treat',
      difficulty: 'hard',
      definition: 'Going door to door in costumes asking for candy.',
    },
  ],
}
