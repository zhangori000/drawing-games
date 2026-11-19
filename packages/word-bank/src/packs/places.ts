import type { WordPackData } from '../play/types'

/**
 * Curated `places` pack. Ids derive from `places/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const PLACES_PACK: WordPackData = {
  id: 'places',
  words: [
    {
      term: 'house',
      difficulty: 'easy',
      definition:
        'A building where a family lives, with a roof, a door, and windows.',
    },
    {
      term: 'castle',
      difficulty: 'easy',
      definition:
        'A huge stone fortress with towers, high walls, and a drawbridge.',
    },
    {
      term: 'school',
      difficulty: 'easy',
      definition:
        'A building where kids go every weekday to learn from teachers.',
    },
    {
      term: 'hospital',
      difficulty: 'easy',
      definition:
        'A big building where doctors and nurses care for sick people.',
    },
    {
      term: 'barn',
      difficulty: 'easy',
      definition: 'A big red farm building where animals and hay are kept.',
    },
    {
      term: 'igloo',
      difficulty: 'easy',
      definition: 'A dome-shaped shelter built from blocks of packed snow.',
    },
    {
      term: 'pyramid',
      difficulty: 'easy',
      definition:
        'A huge ancient stone tomb with four triangle sides that meet at a point.',
    },
    {
      term: 'skyscraper',
      difficulty: 'easy',
      definition: 'A very tall city building with many floors and windows.',
    },
    {
      term: 'doghouse',
      difficulty: 'easy',
      definition: 'A small wooden shelter in the yard for a pet pup.',
    },
    {
      term: 'jail',
      difficulty: 'easy',
      definition:
        'A building with barred cells where people who break the law are locked up.',
    },
    {
      term: 'bank',
      difficulty: 'easy',
      definition: 'A building where people keep their money safe in a vault.',
    },
    {
      term: 'zoo',
      difficulty: 'easy',
      definition:
        'A park where people visit lions, monkeys, and other wild animals.',
    },
    {
      term: 'factory',
      difficulty: 'easy',
      definition:
        'A big building with smokestacks where workers and machines make things.',
    },
    {
      term: 'playground',
      difficulty: 'easy',
      definition:
        'An outdoor area with slides, swings, and monkey bars for kids.',
    },
    {
      term: 'swimming pool',
      difficulty: 'easy',
      definition:
        'A big tank of water set into the ground for splashing and doing laps.',
    },
    {
      term: 'sandbox',
      difficulty: 'easy',
      definition: 'A low wooden frame full of sand where kids dig and build.',
    },
    {
      term: 'windmill',
      difficulty: 'easy',
      definition: 'A tall tower with big turning blades that the breeze spins.',
    },
    {
      term: 'bedroom',
      difficulty: 'easy',
      definition: 'The room in a home with your bed, where you sleep at night.',
    },
    {
      term: 'bathroom',
      difficulty: 'easy',
      definition: 'The room with a toilet, sink, and tub where you wash up.',
    },
    {
      term: 'kitchen',
      difficulty: 'easy',
      definition:
        'The room in a home with a stove and fridge where meals are cooked.',
    },
    {
      term: 'classroom',
      difficulty: 'easy',
      definition: 'A room at school with desks, a board, and a teacher.',
    },
    {
      term: 'living room',
      difficulty: 'easy',
      definition:
        'The cozy space in a home with a couch and TV where the family hangs out.',
    },
    {
      term: 'garage',
      difficulty: 'easy',
      definition:
        'A building or room where a car is parked, behind a big roll-up door.',
    },
    {
      term: 'fire station',
      difficulty: 'easy',
      definition:
        'A building with big garage doors where the crew that fights blazes waits with red trucks.',
      aliases: ['firehouse'],
    },
    {
      term: 'gas station',
      difficulty: 'easy',
      definition:
        'A stop along the road where drivers pump fuel into their cars.',
    },
    {
      term: 'lighthouse',
      difficulty: 'medium',
      definition:
        'A tall tower by the sea with a bright, spinning lamp that guides ships.',
    },
    {
      term: 'library',
      difficulty: 'medium',
      definition: 'A building full of books that you can borrow for free.',
    },
    {
      term: 'treehouse',
      difficulty: 'medium',
      definition:
        'A little hut built up among the branches, reached by a rope ladder.',
    },
    {
      term: 'post office',
      difficulty: 'medium',
      definition:
        'A building where you mail letters and packages and buy stamps.',
    },
    {
      term: 'grocery store',
      difficulty: 'medium',
      definition: 'A big shop with aisles and carts where you buy food.',
      aliases: ['supermarket'],
    },
    {
      term: 'bakery',
      difficulty: 'medium',
      definition: 'A shop where bread, cakes, and pastries are made and sold.',
    },
    {
      term: 'restaurant',
      difficulty: 'medium',
      definition:
        'A place where you sit at a table and order a meal from a menu.',
    },
    {
      term: 'barbershop',
      difficulty: 'medium',
      definition:
        'A shop with a red-and-white striped pole where people get haircuts.',
    },
    {
      term: 'airport',
      difficulty: 'medium',
      definition: 'A place with long runways where planes take off and land.',
    },
    {
      term: 'train station',
      difficulty: 'medium',
      definition:
        'A building with platforms where passengers wait to board railway cars.',
    },
    {
      term: 'movie theater',
      difficulty: 'medium',
      definition:
        'A dark room with a giant screen and rows of seats where films are shown.',
      aliases: ['cinema'],
    },
    {
      term: 'museum',
      difficulty: 'medium',
      definition:
        'A building where old, rare, or famous objects are displayed for visitors.',
    },
    {
      term: 'arcade',
      difficulty: 'medium',
      definition:
        'A noisy room full of coin-operated video games and prize machines.',
    },
    {
      term: 'log cabin',
      difficulty: 'medium',
      definition:
        'A small cozy house in the woods built from stacked tree trunks.',
    },
    {
      term: 'greenhouse',
      difficulty: 'medium',
      definition:
        'A glass building where plants are kept warm so they grow all year.',
    },
    {
      term: 'lemonade stand',
      difficulty: 'medium',
      definition:
        "A kid's table on the sidewalk selling cups of a sweet yellow drink.",
    },
    {
      term: 'wishing well',
      difficulty: 'medium',
      definition:
        'A round stone shaft with a tiny roof and bucket where people toss coins for luck.',
    },
    {
      term: 'closet',
      difficulty: 'medium',
      definition:
        'A small space with a door where you hang clothes and store shoes.',
    },
    {
      term: 'balcony',
      difficulty: 'medium',
      definition:
        'A small railed platform sticking out from an upper floor of a building.',
    },
    {
      term: 'cafeteria',
      difficulty: 'medium',
      definition:
        'A big school dining room where students line up with trays for lunch.',
    },
    {
      term: 'hotel',
      difficulty: 'medium',
      definition:
        'A building with many rooms where travelers pay to sleep for a night.',
    },
    {
      term: 'aquarium',
      difficulty: 'medium',
      definition:
        'A building with giant glass tanks where visitors watch fish and sharks.',
    },
    {
      term: 'ball pit',
      difficulty: 'medium',
      definition:
        'A play area filled with colorful plastic spheres that kids dive into.',
    },
    {
      term: 'stadium',
      difficulty: 'medium',
      definition:
        'A huge open arena with rows of seats around a field for big games.',
    },
    {
      term: 'clock tower',
      difficulty: 'medium',
      definition:
        'A tall building with a giant timepiece on its face that chimes the hour.',
    },
    {
      term: 'ice cream shop',
      difficulty: 'medium',
      definition: 'A store that scoops frozen treats into cones and cups.',
      aliases: ['ice cream parlor', 'ice cream store'],
    },
    {
      term: 'pet store',
      difficulty: 'medium',
      definition:
        'A shop that sells puppies, fish, birds, and supplies for animals.',
      aliases: ['pet shop'],
    },
    {
      term: 'backyard',
      difficulty: 'medium',
      definition:
        'The grassy space behind a home, often with a fence and a swing set.',
    },
    {
      term: 'haunted house',
      difficulty: 'hard',
      definition: 'A spooky old home said to be full of ghosts.',
    },
    {
      term: 'laundromat',
      difficulty: 'hard',
      definition:
        'A shop full of coin-operated washers and dryers for cleaning clothes.',
    },
    {
      term: 'shopping mall',
      difficulty: 'hard',
      definition:
        'A huge indoor building packed with stores, escalators, and a food court.',
      aliases: ['mall'],
    },
    {
      term: 'amusement park',
      difficulty: 'hard',
      definition:
        'A place full of roller coasters, spinning rides, and carnival games.',
      aliases: ['theme park'],
    },
    {
      term: 'attic',
      difficulty: 'hard',
      definition:
        'The dusty space under the roof of a house, used for storing old stuff.',
    },
    {
      term: 'basement',
      difficulty: 'hard',
      definition:
        'The level of a house below the ground, often reached by stairs.',
    },
    {
      term: 'farmers market',
      difficulty: 'hard',
      definition:
        'Outdoor stalls where growers sell fresh fruit, vegetables, and honey.',
    },
    {
      term: 'pier',
      difficulty: 'hard',
      definition:
        'A long wooden walkway on posts that sticks out over the water.',
      aliases: ['dock'],
    },
    {
      term: 'ghost town',
      difficulty: 'hard',
      definition:
        'An abandoned old western village where nobody lives anymore.',
    },
    {
      term: 'neighborhood',
      difficulty: 'hard',
      definition:
        'A group of houses and streets where people live close to each other.',
    },
    {
      term: 'pillow fort',
      difficulty: 'hard',
      definition:
        'A hideout kids build indoors from couch cushions, blankets, and chairs.',
    },
    {
      term: 'water tower',
      difficulty: 'hard',
      definition:
        "A giant tank on tall legs that stores a town's drinking supply.",
    },
    {
      term: 'waiting room',
      difficulty: 'hard',
      definition:
        'A space with rows of chairs and old magazines where you sit until your name is called.',
    },
    {
      term: 'summer camp',
      difficulty: 'hard',
      definition:
        'A place where kids stay in cabins for weeks, canoeing and roasting marshmallows.',
    },
    {
      term: 'construction site',
      difficulty: 'hard',
      definition:
        'An area where workers in hard hats use cranes to put up a new building.',
    },
    {
      term: 'junkyard',
      difficulty: 'hard',
      definition:
        'A lot piled high with old cars, scrap metal, and broken stuff.',
      aliases: ['scrapyard'],
    },
    {
      term: 'hedge maze',
      difficulty: 'hard',
      definition:
        'A puzzle of tall green bushes with winding paths and dead ends.',
    },
    {
      term: 'escape room',
      difficulty: 'hard',
      definition:
        'A locked chamber full of puzzles and clues that a team must solve to get out.',
    },
    {
      term: 'animal shelter',
      difficulty: 'hard',
      definition:
        'A place that cares for stray pets until they find a new family.',
    },
    {
      term: 'drive-thru',
      difficulty: 'hard',
      definition:
        'A restaurant window where you order and get food without leaving your car.',
      aliases: ['drive-through'],
    },
    {
      term: "principal's office",
      difficulty: 'hard',
      definition:
        'The room where the head of a school works and where students get sent for trouble.',
    },
  ],
}
