import type { WordPackData } from '../play/types'

/**
 * Curated `jobs` pack. Ids derive from `jobs/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const JOBS_PACK: WordPackData = {
  id: 'jobs',
  words: [
    // Easy
    {
      term: 'doctor',
      difficulty: 'easy',
      definition:
        'A person in a white coat with a stethoscope who helps sick people get better.',
    },
    {
      term: 'chef',
      difficulty: 'easy',
      definition:
        'A person in a tall white hat who cooks meals in a restaurant kitchen.',
      aliases: ['cook'],
    },
    {
      term: 'teacher',
      difficulty: 'easy',
      definition:
        'A person who stands at the chalkboard and helps students learn in a classroom.',
    },
    {
      term: 'farmer',
      difficulty: 'easy',
      definition:
        'A person in overalls who grows crops and raises animals in the countryside.',
    },
    {
      term: 'police officer',
      difficulty: 'easy',
      definition:
        'A person with a uniform and badge who enforces laws and keeps people safe.',
      aliases: ['cop', 'police', 'policeman', 'policewoman'],
    },
    {
      term: 'firefighter',
      difficulty: 'easy',
      definition:
        'A person in a helmet and heavy coat who sprays water from a hose to put out fires.',
      aliases: ['fireman'],
    },
    {
      term: 'astronaut',
      difficulty: 'easy',
      definition:
        'A person in a puffy suit and helmet who travels into space in a rocket.',
    },
    {
      term: 'cowboy',
      difficulty: 'easy',
      definition:
        'A ranch worker in a wide-brimmed hat and boots who rides horses and swings a lasso.',
      aliases: ['cowgirl'],
    },
    {
      term: 'dentist',
      difficulty: 'easy',
      definition: 'A person who checks and cleans teeth and fixes cavities.',
    },
    {
      term: 'pilot',
      difficulty: 'easy',
      definition: 'A person who flies an airplane from the cockpit.',
    },
    {
      term: 'nurse',
      difficulty: 'easy',
      definition:
        'A person in scrubs who cares for patients in a hospital alongside doctors.',
    },
    {
      term: 'scientist',
      difficulty: 'easy',
      definition:
        'A person in a lab coat and goggles who does experiments with bubbling test tubes.',
    },
    {
      term: 'artist',
      difficulty: 'easy',
      definition:
        'A person with a beret, a palette, and an easel who makes paintings.',
      aliases: ['painter'],
    },
    {
      term: 'fisherman',
      difficulty: 'easy',
      definition:
        'A person who catches fish with a rod or a net, often from a boat.',
    },
    {
      term: 'detective',
      difficulty: 'easy',
      definition:
        'A person with a magnifying glass who searches for clues to solve mysteries.',
    },
    {
      term: 'construction worker',
      difficulty: 'easy',
      definition:
        'A person in a hard hat and safety vest who builds roads and buildings.',
      aliases: ['builder'],
    },
    {
      term: 'mail carrier',
      difficulty: 'easy',
      definition:
        'A person who walks a route delivering letters and packages to every home.',
      aliases: ['mailman', 'postman', 'letter carrier'],
    },
    {
      term: 'bus driver',
      difficulty: 'easy',
      definition:
        'A person who steers a big bus full of passengers along a set route.',
    },

    // Medium
    {
      term: 'lifeguard',
      difficulty: 'medium',
      definition:
        'A person on a tall chair at the beach or pool who watches swimmers and rescues them.',
    },
    {
      term: 'mechanic',
      difficulty: 'medium',
      definition:
        'A person with a wrench and greasy hands who repairs cars in a garage.',
    },
    {
      term: 'plumber',
      difficulty: 'medium',
      definition: 'A person who fixes leaky pipes, sinks, and clogged toilets.',
    },
    {
      term: 'carpenter',
      difficulty: 'medium',
      definition:
        'A person who builds things out of wood using a hammer, a saw, and nails.',
    },
    {
      term: 'judge',
      difficulty: 'medium',
      definition:
        'A person in a black robe who bangs a gavel and makes decisions in a courtroom.',
    },
    {
      term: 'sailor',
      difficulty: 'medium',
      definition: 'A person in a white cap who works on a ship out at sea.',
    },
    {
      term: 'referee',
      difficulty: 'medium',
      definition:
        'A person in a striped shirt who blows a whistle and enforces the rules of a game.',
      aliases: ['ref'],
    },
    {
      term: 'lumberjack',
      difficulty: 'medium',
      definition:
        'A bearded worker in a plaid shirt who chops down trees with an axe.',
    },
    {
      term: 'gardener',
      difficulty: 'medium',
      definition:
        'A person who plants flowers, pulls weeds, and waters plants in a yard.',
    },
    {
      term: 'cashier',
      difficulty: 'medium',
      definition:
        'A person at a register who scans items and takes payment at a store.',
    },
    {
      term: 'waiter',
      difficulty: 'medium',
      definition:
        'A person who takes your order and carries plates of food to your table at a restaurant.',
      aliases: ['waitress', 'server'],
    },
    {
      term: 'janitor',
      difficulty: 'medium',
      definition:
        'A person who mops floors, empties trash, and keeps a school or building clean.',
      aliases: ['custodian'],
    },
    {
      term: 'miner',
      difficulty: 'medium',
      definition:
        'A worker with a helmet light and a pickaxe who digs for coal or gold underground.',
    },
    {
      term: 'veterinarian',
      difficulty: 'medium',
      definition: 'An animal doctor who treats sick pets like dogs and cats.',
      aliases: ['vet'],
    },
    {
      term: 'barber',
      difficulty: 'medium',
      definition:
        'A person who cuts hair and trims beards in a shop with a striped pole out front.',
    },
    {
      term: 'photographer',
      difficulty: 'medium',
      definition: 'A person who takes pictures with a camera for a living.',
    },
    {
      term: 'garbage collector',
      difficulty: 'medium',
      definition:
        'A worker who rides on a big truck and empties trash cans along the street.',
      aliases: ['garbage man', 'trash collector'],
    },
    {
      term: 'zookeeper',
      difficulty: 'medium',
      definition: 'A person who feeds and cares for the animals at a zoo.',
    },
    {
      term: 'librarian',
      difficulty: 'medium',
      definition:
        'A person who helps you find books and asks everyone to be quiet.',
    },
    {
      term: 'tourist',
      difficulty: 'medium',
      definition:
        'A traveler with a camera, a map, and sunglasses visiting famous sights on vacation.',
    },
    {
      term: 'baker',
      difficulty: 'medium',
      definition:
        'A person who makes bread, cakes, and pastries in an oven early every morning.',
    },
    {
      term: 'shepherd',
      difficulty: 'medium',
      definition:
        'A person with a hooked staff who watches over a flock of sheep.',
    },
    {
      term: 'barista',
      difficulty: 'medium',
      definition:
        'A person at a coffee shop who makes lattes and draws foam designs on top.',
    },
    {
      term: 'security guard',
      difficulty: 'medium',
      definition:
        'A person in a uniform who watches over a building to keep it safe from thieves.',
    },
    {
      term: 'beekeeper',
      difficulty: 'medium',
      definition:
        'A person in a protective suit and veil who tends hives and collects honey.',
    },
    {
      term: 'electrician',
      difficulty: 'medium',
      definition: 'A person who installs and fixes wires, outlets, and lights.',
    },
    {
      term: 'dog walker',
      difficulty: 'medium',
      definition:
        "A person paid to take other people's dogs out, often holding several leashes at once.",
    },
    {
      term: 'reporter',
      difficulty: 'medium',
      definition:
        'A person with a microphone who tells the news from the scene of a story.',
      aliases: ['journalist', 'news reporter'],
    },
    {
      term: 'astronomer',
      difficulty: 'medium',
      definition:
        'A scientist who studies stars and planets through a big telescope.',
    },
    {
      term: 'tour guide',
      difficulty: 'medium',
      definition:
        'A person who leads groups of visitors around a famous place and tells them about it.',
    },
    {
      term: 'eye doctor',
      difficulty: 'medium',
      definition:
        'A doctor who tests your vision with a letter chart and prescribes glasses.',
      aliases: ['optometrist'],
    },

    // Hard
    {
      term: 'crossing guard',
      difficulty: 'hard',
      definition:
        'A person in a bright vest who holds up a stop sign so kids can get across the street safely.',
    },
    {
      term: 'park ranger',
      difficulty: 'hard',
      definition:
        'A person in a wide-brimmed hat who looks after forests, trails, and wildlife for visitors.',
      aliases: ['ranger', 'forest ranger'],
    },
    {
      term: 'window washer',
      difficulty: 'hard',
      definition:
        'A worker dangling on a platform high up a skyscraper, scrubbing the glass with a squeegee.',
      aliases: ['window cleaner'],
    },
    {
      term: 'blacksmith',
      difficulty: 'hard',
      definition:
        'A worker who hammers red-hot metal on an anvil to make horseshoes and tools.',
    },
    {
      term: 'tailor',
      difficulty: 'hard',
      definition:
        'A person who measures, cuts, and sews clothes so they fit just right.',
    },
    {
      term: 'florist',
      difficulty: 'hard',
      definition:
        'A person who arranges flowers into bouquets and sells them in a shop.',
    },
    {
      term: 'babysitter',
      difficulty: 'hard',
      definition:
        "A person who watches someone else's kids for a few hours while the parents are out.",
    },
    {
      term: 'programmer',
      difficulty: 'hard',
      definition:
        'A person who writes computer code to build apps, websites, and games.',
      aliases: ['coder'],
    },
    {
      term: 'weather forecaster',
      difficulty: 'hard',
      definition:
        'A person on TV who points at a map of clouds and suns to tell what tomorrow will bring.',
      aliases: ['weatherman', 'meteorologist'],
    },
    {
      term: 'flight attendant',
      difficulty: 'hard',
      definition:
        'A person in uniform who serves snacks and keeps passengers safe on an airplane.',
    },
    {
      term: 'escape artist',
      difficulty: 'hard',
      definition:
        'A performer who wriggles free from chains, locks, or a straitjacket.',
    },
    {
      term: 'archaeologist',
      difficulty: 'hard',
      definition:
        'A scientist who carefully digs up and brushes off ancient bones and buried ruins.',
      aliases: ['archeologist'],
    },
    {
      term: 'pharmacist',
      difficulty: 'hard',
      definition:
        'A person behind a counter who fills prescriptions and counts out pills for patients.',
    },
    {
      term: 'locksmith',
      difficulty: 'hard',
      definition: 'A person who opens locked doors and makes new keys.',
    },
    {
      term: 'welder',
      difficulty: 'hard',
      definition:
        'A worker in a dark mask who joins metal together with a hot, sparking torch.',
    },
    {
      term: 'architect',
      difficulty: 'hard',
      definition: 'A person who designs buildings and draws their blueprints.',
    },
    {
      term: 'author',
      difficulty: 'hard',
      definition: 'A person who writes books for others to read.',
      aliases: ['writer'],
    },
    {
      term: 'butler',
      difficulty: 'hard',
      definition:
        'A servant in a fancy suit who answers the door and serves guests in a mansion.',
    },
    {
      term: 'food critic',
      difficulty: 'hard',
      definition:
        'A person who tastes dishes at restaurants and writes reviews about them.',
    },
    {
      term: 'personal trainer',
      difficulty: 'hard',
      definition:
        'A fitness coach who cheers people through tough workouts at the gym.',
    },
    {
      term: 'train conductor',
      difficulty: 'hard',
      definition:
        'A railroad worker in a cap who punches tickets and shouts all aboard.',
    },
    {
      term: 'lawyer',
      difficulty: 'hard',
      definition:
        'A person in a suit who argues a case in court to defend a client.',
      aliases: ['attorney'],
    },
    {
      term: 'dog groomer',
      difficulty: 'hard',
      definition:
        'A person who bathes, brushes, and trims the fur of pet dogs.',
      aliases: ['pet groomer'],
    },
    {
      term: 'chimney sweep',
      difficulty: 'hard',
      definition:
        'A worker covered in soot who cleans out chimneys with a long brush.',
    },
  ],
}
