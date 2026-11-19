import type { WordPackData } from '../play/types'
import { EVERYDAY_PACK } from './everyday'
import { ANIMALS_PACK } from './animals'
import { FOOD_PACK } from './food'
import { NATURE_PACK } from './nature'
import { PLACES_PACK } from './places'
import { JOBS_PACK } from './jobs'
import { ACTIONS_PACK } from './actions'
import { SPORTS_PACK } from './sports'
import { FANTASY_PACK } from './fantasy'
import { VEHICLES_PACK } from './vehicles'
import { SPACE_SCIENCE_PACK } from './space-science'
import { MUSIC_ARTS_PACK } from './music-arts'
import { HOLIDAYS_PACK } from './holidays'
import { PHRASES_PACK } from './phrases'

/** Every curated pack, in display order (matches WORD_PACKS). */
export const CURATED_PACKS: readonly WordPackData[] = Object.freeze([
  EVERYDAY_PACK,
  ANIMALS_PACK,
  FOOD_PACK,
  NATURE_PACK,
  PLACES_PACK,
  JOBS_PACK,
  ACTIONS_PACK,
  SPORTS_PACK,
  FANTASY_PACK,
  VEHICLES_PACK,
  SPACE_SCIENCE_PACK,
  MUSIC_ARTS_PACK,
  HOLIDAYS_PACK,
  PHRASES_PACK,
])

export * from './meta'
