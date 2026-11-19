import type { WordPackInfo } from '../play/types'

/**
 * Static pack metadata. Kept free of word data so browsers can import it
 * without bundling the catalog. `defaultEnabled` must match
 * `DEFAULT_ROOM_PACK_IDS` in game-core (a test asserts this).
 */
export const WORD_PACKS: readonly WordPackInfo[] = Object.freeze([
  {
    id: 'everyday',
    name: 'Everyday Objects',
    description: 'Things you can find around a house, school, or office.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'animals',
    name: 'Animals',
    description: 'Pets, wildlife, sea creatures, birds, and bugs.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'food',
    name: 'Food & Drink',
    description: 'Meals, snacks, fruit, desserts, and kitchen favorites.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'nature',
    name: 'Nature & Weather',
    description: 'Landscapes, plants, seasons, and wild weather.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'places',
    name: 'Places & Buildings',
    description: 'Rooms, buildings, landmark types, and destinations.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'jobs',
    name: 'People & Jobs',
    description: 'Occupations, roles, and characters you would recognize.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'sports',
    name: 'Sports & Games',
    description: 'Sports, equipment, board games, and playground games.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'fantasy',
    name: 'Fantasy & Myth',
    description: 'Dragons, wizards, fairy tales, and legendary creatures.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'vehicles',
    name: 'Vehicles & Travel',
    description: 'Things that roll, fly, float, and the trips they take.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'space-science',
    name: 'Space & Science',
    description: 'Planets, labs, inventions, and how things work.',
    defaultEnabled: true,
    kidFriendly: true,
  },
  {
    id: 'actions',
    name: 'Actions',
    description: 'Verbs and activities — draw someone doing it.',
    defaultEnabled: false,
    kidFriendly: true,
  },
  {
    id: 'music-arts',
    name: 'Music & Arts',
    description: 'Instruments, performances, crafts, and art supplies.',
    defaultEnabled: false,
    kidFriendly: true,
  },
  {
    id: 'holidays',
    name: 'Holidays & Parties',
    description: 'Celebrations, traditions, costumes, and party things.',
    defaultEnabled: false,
    kidFriendly: true,
  },
  {
    id: 'phrases',
    name: 'Phrases & Idioms',
    description: 'Common sayings and compound ideas. Hard but hilarious.',
    defaultEnabled: false,
    kidFriendly: false,
  },
])

export const CUSTOM_PACK_ID = 'custom'
export const CUSTOM_PACK_NAME = 'Custom'

export function getWordPackInfo(packId: string): WordPackInfo | undefined {
  return WORD_PACKS.find((pack) => pack.id === packId)
}

export function getWordPackName(packId: string): string {
  if (packId === CUSTOM_PACK_ID) return CUSTOM_PACK_NAME
  return getWordPackInfo(packId)?.name ?? packId
}
