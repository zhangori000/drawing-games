import type { WordPackData } from '../play/types'

/**
 * Curated `fantasy` pack. Ids derive from `fantasy/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const FANTASY_PACK: WordPackData = {
  id: 'fantasy',
  words: [
    {
      term: 'dragon',
      difficulty: 'easy',
      definition: 'A giant flying lizard that breathes fire.',
    },
    {
      term: 'wizard',
      difficulty: 'easy',
      definition: 'A magic user with a pointy hat and a wand.',
    },
    {
      term: 'mermaid',
      difficulty: 'medium',
      definition: 'A sea creature that is half person, half fish.',
    },
    {
      term: 'unicorn',
      difficulty: 'easy',
      definition: 'A horse with a single horn on its forehead.',
    },
    {
      term: 'genie',
      difficulty: 'medium',
      definition: 'A magical being from a lamp who grants wishes.',
    },
    {
      term: 'magic carpet',
      difficulty: 'hard',
      definition: 'A flying rug from old stories.',
    },
  ],
}
