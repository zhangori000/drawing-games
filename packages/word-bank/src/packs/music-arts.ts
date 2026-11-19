import type { WordPackData } from '../play/types'

/**
 * Curated `music-arts` pack. Ids derive from `music-arts/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const MUSIC_ARTS_PACK: WordPackData = {
  id: 'music-arts',
  words: [
    {
      term: 'guitar',
      difficulty: 'easy',
      definition: 'A stringed instrument you strum.',
    },
    {
      term: 'drum',
      difficulty: 'easy',
      definition: 'An instrument you hit with sticks.',
    },
    {
      term: 'paintbrush',
      difficulty: 'medium',
      definition: 'A brush used to put paint on paper or canvas.',
    },
    {
      term: 'saxophone',
      difficulty: 'medium',
      definition: 'A curved brass instrument with keys, played by blowing.',
    },
    {
      term: 'orchestra',
      difficulty: 'hard',
      definition: 'A large group of musicians playing together.',
    },
    {
      term: 'sculpture',
      difficulty: 'hard',
      definition: 'Art made by carving or shaping a solid material.',
    },
  ],
}
