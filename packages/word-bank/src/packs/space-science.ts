import type { WordPackData } from '../play/types'

/**
 * Curated `space-science` pack. Ids derive from `space-science/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const SPACE_SCIENCE_PACK: WordPackData = {
  id: 'space-science',
  words: [
    {
      term: 'moon',
      difficulty: 'easy',
      definition: 'The big round thing that shines in the night sky.',
    },
    {
      term: 'rocket',
      difficulty: 'easy',
      definition: 'A tall vehicle that blasts off into space.',
    },
    {
      term: 'telescope',
      difficulty: 'medium',
      definition: 'A tube with lenses for seeing faraway things.',
    },
    {
      term: 'magnet',
      difficulty: 'medium',
      definition: 'A metal object that pulls iron toward it.',
    },
    {
      term: 'black hole',
      difficulty: 'hard',
      definition:
        'A place in space with gravity so strong light cannot escape.',
    },
    {
      term: 'solar eclipse',
      difficulty: 'hard',
      definition: 'When the moon blocks the sun during the day.',
    },
  ],
}
