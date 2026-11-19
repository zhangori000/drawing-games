import type { WordPackData } from '../play/types'

/**
 * Curated `food` pack. Ids derive from `food/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const FOOD_PACK: WordPackData = {
  id: 'food',
  words: [
    {
      term: 'pizza',
      difficulty: 'easy',
      definition: 'A flat round bread baked with sauce and cheese on top.',
    },
    {
      term: 'banana',
      difficulty: 'easy',
      definition: 'A long curved yellow fruit you peel.',
    },
    {
      term: 'spaghetti',
      difficulty: 'medium',
      definition: 'Long thin noodles, often served with tomato sauce.',
    },
    {
      term: 'sushi',
      difficulty: 'medium',
      definition: 'Japanese rice rolls, often with fish and seaweed.',
    },
    {
      term: 'gingerbread house',
      difficulty: 'hard',
      definition: 'A little house built from spiced cookies and candy.',
    },
    {
      term: 'chocolate fountain',
      difficulty: 'hard',
      definition: 'A tower that pours melted chocolate for dipping.',
    },
  ],
}
