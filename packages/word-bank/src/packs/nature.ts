import type { WordPackData } from '../play/types'

/**
 * Curated `nature` pack. Ids derive from `nature/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const NATURE_PACK: WordPackData = {
  id: 'nature',
  words: [
    // Easy
    {
      term: 'tree',
      difficulty: 'easy',
      definition: 'A tall plant with a woody trunk, branches, and leaves.',
    },
    {
      term: 'rainbow',
      difficulty: 'easy',
      definition: 'A colorful striped arc that appears in the sky after rain.',
    },
    {
      term: 'cloud',
      difficulty: 'easy',
      definition: 'A white, fluffy puff of water droplets floating in the sky.',
    },
    {
      term: 'lightning',
      difficulty: 'easy',
      definition:
        'A bright zigzag flash of electricity that shoots down from a storm.',
      aliases: ['lightning bolt'],
    },
    {
      term: 'snowflake',
      difficulty: 'easy',
      definition:
        'A tiny six-sided ice crystal that drifts down from the sky in winter.',
    },
    {
      term: 'rain',
      difficulty: 'easy',
      definition: 'Drops of water falling from gray clouds in the sky.',
    },
    {
      term: 'puddle',
      difficulty: 'easy',
      definition: 'A small pool of water on the ground left after a rainstorm.',
    },
    {
      term: 'mountain',
      difficulty: 'easy',
      definition:
        'A very tall, rocky landform with steep sides and a pointed peak, often topped with snow.',
    },
    {
      term: 'beach',
      difficulty: 'easy',
      definition:
        'A sandy shore beside the ocean where people swim and build sandcastles.',
    },
    {
      term: 'island',
      difficulty: 'easy',
      definition: 'A piece of land with water all around it.',
    },
    {
      term: 'wave',
      difficulty: 'easy',
      definition:
        'A curling wall of ocean water that rolls in and crashes on the shore.',
    },
    {
      term: 'volcano',
      difficulty: 'easy',
      definition: 'A mountain that can erupt with hot lava and smoke.',
    },
    {
      term: 'tornado',
      difficulty: 'easy',
      definition: 'A spinning funnel of wind reaching down from a storm.',
    },
    {
      term: 'flower',
      difficulty: 'easy',
      definition:
        'The colorful, sweet-smelling part of a plant with petals around its center.',
    },
    {
      term: 'rose',
      difficulty: 'easy',
      definition: 'A red flower with tightly layered petals and a thorny stem.',
    },
    {
      term: 'sunflower',
      difficulty: 'easy',
      definition:
        'A very tall plant with a giant yellow bloom and a dark, seed-filled center.',
    },
    {
      term: 'cactus',
      difficulty: 'easy',
      definition:
        'A spiky green desert plant that stores water inside its thick stems.',
    },
    {
      term: 'palm tree',
      difficulty: 'easy',
      definition:
        'A tall tropical tree with a bare trunk and big fan-shaped leaves on top.',
    },
    {
      term: 'pine tree',
      difficulty: 'easy',
      definition:
        'A tall evergreen tree shaped like a triangle, with needles instead of leaves.',
    },
    {
      term: 'leaf',
      difficulty: 'easy',
      definition:
        'A flat green part of a plant that grows on a stem and changes color in fall.',
    },
    {
      term: 'acorn',
      difficulty: 'easy',
      definition: 'A small brown nut with a little cap that falls from an oak.',
    },
    {
      term: 'seashell',
      difficulty: 'easy',
      definition:
        'A hard, often spiral covering left by a sea creature and found on the beach.',
      aliases: ['shell'],
    },
    {
      term: 'icicle',
      difficulty: 'easy',
      definition:
        'A pointed spike of ice that hangs from a roof edge in freezing weather.',
    },
    {
      term: "bird's nest",
      difficulty: 'easy',
      definition:
        'A cup-shaped bed of twigs and grass that a bird builds to hold its eggs.',
      aliases: ['nest', 'bird nest'],
    },
    {
      term: 'spider web',
      difficulty: 'easy',
      definition:
        'A sticky net of silky threads spun by an eight-legged bug to catch flies.',
      aliases: ['cobweb', 'web'],
    },
    {
      term: 'feather',
      difficulty: 'easy',
      definition:
        "One of the light, soft pieces that cover a bird's body and wings.",
    },
    {
      term: 'fire',
      difficulty: 'easy',
      definition:
        'Hot, flickering orange flames that burn wood and give off light and smoke.',
    },

    // Medium
    {
      term: 'waterfall',
      difficulty: 'medium',
      definition: 'A river pouring over the edge of a cliff into a pool below.',
    },
    {
      term: 'river',
      difficulty: 'medium',
      definition:
        'A long stream of flowing water that winds across the land to the sea.',
    },
    {
      term: 'pond',
      difficulty: 'medium',
      definition:
        'A small, still body of water where frogs, ducks, and lily pads live.',
    },
    {
      term: 'cave',
      difficulty: 'medium',
      definition:
        'A big, dark hollow inside a hill or cliff that you can walk into.',
    },
    {
      term: 'cliff',
      difficulty: 'medium',
      definition: 'A steep, high wall of rock with a big drop at the edge.',
    },
    {
      term: 'desert',
      difficulty: 'medium',
      definition: 'A hot, dry, sandy land with cactuses and very little rain.',
    },
    {
      term: 'jungle',
      difficulty: 'medium',
      definition:
        'A thick, steamy tropical forest full of vines, huge leaves, and wild animals.',
      aliases: ['rainforest'],
    },
    {
      term: 'sand dune',
      difficulty: 'medium',
      definition:
        'A big hill of sand shaped by the wind in a desert or near a beach.',
      aliases: ['dune'],
    },
    {
      term: 'iceberg',
      difficulty: 'medium',
      definition:
        'A giant chunk of floating ice with most of it hidden under the water.',
    },
    {
      term: 'sunset',
      difficulty: 'medium',
      definition:
        'The sun sinking below the horizon and turning the evening sky orange and pink.',
    },
    {
      term: 'swamp',
      difficulty: 'medium',
      definition:
        'A muddy, wet land with murky water, tall grass, and twisted trees.',
    },
    {
      term: 'geyser',
      difficulty: 'medium',
      definition:
        'A hole in the ground that shoots a tall blast of hot water and steam into the air.',
    },
    {
      term: 'tulip',
      difficulty: 'medium',
      definition:
        'A cup-shaped spring flower with smooth petals on a tall green stem.',
    },
    {
      term: 'dandelion',
      difficulty: 'medium',
      definition:
        'A yellow weed that turns into a fluffy white puffball you can blow away.',
    },
    {
      term: 'four-leaf clover',
      difficulty: 'medium',
      definition:
        'A rare little green plant with four heart-shaped leaves that is said to bring good luck.',
    },
    {
      term: 'lily pad',
      difficulty: 'medium',
      definition: 'A big round floating leaf in a pond where a frog might sit.',
    },
    {
      term: 'bamboo',
      difficulty: 'medium',
      definition: 'A tall, hollow, jointed grass that pandas love to munch on.',
    },
    {
      term: 'seaweed',
      difficulty: 'medium',
      definition:
        'A slimy green or brown plant that grows in the ocean and washes up on beaches.',
    },
    {
      term: 'pine cone',
      difficulty: 'medium',
      definition:
        'A brown, woody, scaly seed holder that falls from evergreen trees.',
    },
    {
      term: 'tree stump',
      difficulty: 'medium',
      definition:
        'The short bottom of a trunk left in the ground after a tree is cut down.',
      aliases: ['stump'],
    },
    {
      term: 'beehive',
      difficulty: 'medium',
      definition:
        'A busy home where bees make honey, often hanging from a branch.',
      aliases: ['hive'],
    },
    {
      term: 'anthill',
      difficulty: 'medium',
      definition:
        'A small mound of dirt with tunnels where a colony of ants lives.',
    },
    {
      term: 'fern',
      difficulty: 'medium',
      definition: 'A leafy green forest plant with long, feathery fronds.',
    },
    {
      term: 'forest',
      difficulty: 'medium',
      definition:
        'A large area of land covered with many trees growing close together.',
    },
    {
      term: 'lava',
      difficulty: 'medium',
      definition: 'Glowing, melted rock that flows out of an erupting volcano.',
    },

    // Hard
    {
      term: 'quicksand',
      difficulty: 'hard',
      definition:
        'Wet, soupy sand that you slowly sink into if you step in it.',
    },
    {
      term: 'fog',
      difficulty: 'hard',
      definition:
        'A thick, low cloud near the ground that makes it hard to see far.',
    },
    {
      term: 'blizzard',
      difficulty: 'hard',
      definition:
        'A fierce winter storm with howling wind and heavy, blowing snow.',
    },
    {
      term: 'hailstorm',
      difficulty: 'hard',
      definition:
        'A storm that pelts the ground with hard little balls of ice.',
    },
    {
      term: 'heat wave',
      difficulty: 'hard',
      definition:
        'A stretch of extremely hot days when everyone sweats and looks for shade.',
    },
    {
      term: 'earthquake',
      difficulty: 'hard',
      definition:
        'A sudden shaking of the ground that can crack roads and topple buildings.',
    },
    {
      term: 'avalanche',
      difficulty: 'hard',
      definition: 'A huge mass of snow suddenly sliding down a mountainside.',
    },
    {
      term: 'northern lights',
      difficulty: 'hard',
      definition:
        'Glowing ribbons of green and purple light that ripple across the night sky near the poles.',
      aliases: ['aurora', 'aurora borealis'],
    },
    {
      term: 'hot spring',
      difficulty: 'hard',
      definition:
        'A natural pool of warm, steaming water heated deep underground.',
    },
    {
      term: 'oasis',
      difficulty: 'hard',
      definition: 'A green spot in the desert with water and palm trees.',
    },
    {
      term: 'coral reef',
      difficulty: 'hard',
      definition:
        'A colorful underwater ridge built by tiny sea creatures where lots of fish live.',
    },
    {
      term: 'tide pool',
      difficulty: 'hard',
      definition:
        'A rocky puddle of seawater, full of tiny sea life, left behind when the tide goes out.',
    },
    {
      term: 'canyon',
      difficulty: 'hard',
      definition:
        'A deep, narrow valley with steep rocky walls carved by a river.',
    },
    {
      term: 'stalactite',
      difficulty: 'hard',
      definition:
        'A pointy, icicle-shaped rock that hangs from the ceiling of a cave.',
    },
    {
      term: 'sinkhole',
      difficulty: 'hard',
      definition:
        'A big hole that suddenly opens in the ground when the earth underneath collapses.',
    },
    {
      term: 'venus flytrap',
      difficulty: 'hard',
      definition: 'A plant with jaw-like leaves that snap shut to trap bugs.',
      aliases: ['flytrap'],
    },
    {
      term: 'weeping willow',
      difficulty: 'hard',
      definition:
        'A tree with long, drooping branches that hang all the way down to the ground.',
      aliases: ['willow'],
    },
    {
      term: 'tumbleweed',
      difficulty: 'hard',
      definition:
        'A dry, tangled ball of dead plant that rolls across the desert in the wind.',
    },
    {
      term: 'autumn',
      difficulty: 'hard',
      definition:
        'The season when leaves turn orange and red and drift down from the trees.',
      aliases: ['fall'],
    },
    {
      term: 'shadow',
      difficulty: 'hard',
      definition:
        'The dark shape that appears on the ground when something blocks the light.',
    },
    {
      term: 'cherry blossom',
      difficulty: 'hard',
      definition:
        'A pink flower that covers certain trees in spring, with petals drifting in the breeze.',
    },
    {
      term: 'hurricane',
      difficulty: 'hard',
      definition:
        'A giant spinning storm from the ocean with heavy rain and fierce winds.',
    },
  ],
}
