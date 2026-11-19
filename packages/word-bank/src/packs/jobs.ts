import type { WordPackData } from '../play/types'

/**
 * Curated `jobs` pack. Ids derive from `jobs/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const JOBS_PACK: WordPackData = {
  id: 'jobs',
  words: [
    {
      term: 'doctor',
      difficulty: 'easy',
      definition: 'A person who helps sick people get better.',
    },
    {
      term: 'chef',
      difficulty: 'easy',
      definition: 'A person who cooks food in a restaurant.',
    },
    {
      term: 'firefighter',
      difficulty: 'medium',
      definition: 'A person who puts out fires.',
    },
    {
      term: 'astronaut',
      difficulty: 'medium',
      definition: 'A person who travels into space.',
    },
    {
      term: 'lifeguard',
      difficulty: 'medium',
      definition: 'A person who watches swimmers and rescues them.',
    },
    {
      term: 'escape artist',
      difficulty: 'hard',
      definition: 'A performer who frees themselves from chains or locks.',
    },
  ],
}
