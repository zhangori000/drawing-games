import type { WordPackData } from '../play/types'

/**
 * Curated `actions` pack. Ids derive from `actions/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const ACTIONS_PACK: WordPackData = {
  id: 'actions',
  words: [
    // Easy
    {
      term: 'sleeping',
      difficulty: 'easy',
      definition: 'Resting in bed with your eyes closed for the night.',
    },
    {
      term: 'jumping',
      difficulty: 'easy',
      definition: 'Pushing off the ground into the air.',
    },
    {
      term: 'crying',
      difficulty: 'easy',
      definition: 'Shedding tears because you are sad or hurt.',
    },
    {
      term: 'laughing',
      difficulty: 'easy',
      definition: 'Making happy ha-ha sounds because something is funny.',
    },
    {
      term: 'eating',
      difficulty: 'easy',
      definition: 'Putting food in your mouth, chewing, and swallowing.',
    },
    {
      term: 'running',
      difficulty: 'easy',
      definition: 'Moving fast on foot with long, quick strides.',
    },
    {
      term: 'waving',
      difficulty: 'easy',
      definition:
        'Moving your raised hand side to side to say hello or goodbye.',
    },
    {
      term: 'reading',
      difficulty: 'easy',
      definition: 'Looking at the words in a book and understanding them.',
    },
    {
      term: 'writing',
      difficulty: 'easy',
      definition: 'Putting words on paper with a pen or pencil.',
    },
    {
      term: 'cooking',
      difficulty: 'easy',
      definition: 'Making a meal by heating food on a stove or in an oven.',
    },
    {
      term: 'clapping',
      difficulty: 'easy',
      definition:
        'Smacking your palms together again and again to show you liked something.',
    },
    {
      term: 'hugging',
      difficulty: 'easy',
      definition: 'Wrapping your arms around someone to show you care.',
    },
    {
      term: 'winking',
      difficulty: 'easy',
      definition: 'Quickly closing one eye as a playful signal.',
    },
    {
      term: 'pointing',
      difficulty: 'easy',
      definition: 'Aiming your finger at something to show where it is.',
    },
    {
      term: 'yawning',
      difficulty: 'easy',
      definition:
        'Opening your mouth wide and breathing in deeply because you are sleepy.',
    },
    {
      term: 'yelling',
      difficulty: 'easy',
      definition:
        'Using your loudest voice, often with your hands cupped around your mouth.',
      aliases: ['shouting'],
    },
    {
      term: 'crawling',
      difficulty: 'easy',
      definition: 'Moving on your hands and knees, like a baby does.',
    },
    {
      term: 'driving',
      difficulty: 'easy',
      definition: 'Steering a car down the road from behind the wheel.',
    },
    {
      term: 'digging',
      difficulty: 'easy',
      definition:
        'Scooping dirt out of the ground with a shovel to make a hole.',
    },
    {
      term: 'sweeping',
      difficulty: 'easy',
      definition: 'Brushing dust and dirt off the floor with a broom.',
    },
    {
      term: 'knocking',
      difficulty: 'easy',
      definition: 'Rapping your knuckles on a door so someone will open it.',
    },
    {
      term: 'camping',
      difficulty: 'easy',
      definition:
        'Staying outdoors overnight in a tent, often beside a crackling fire.',
    },
    {
      term: 'climbing a tree',
      difficulty: 'easy',
      definition: 'Pulling yourself up from branch to branch on a big trunk.',
    },
    {
      term: 'brushing teeth',
      difficulty: 'easy',
      definition:
        'Scrubbing the inside of your mouth with a bristly stick and minty paste.',
      aliases: ['brushing your teeth'],
    },
    {
      term: 'flying a kite',
      difficulty: 'easy',
      definition:
        'Holding a string while a paper or fabric toy soars on the wind.',
    },
    {
      term: 'blowing bubbles',
      difficulty: 'easy',
      definition:
        'Puffing through a soapy wand to send floating soap spheres into the air.',
    },
    {
      term: 'taking a bath',
      difficulty: 'easy',
      definition: 'Soaking and washing yourself in a tub full of water.',
    },
    {
      term: 'washing hands',
      difficulty: 'easy',
      definition: 'Scrubbing your palms with soap and water at a sink.',
      aliases: ['washing your hands'],
    },
    {
      term: 'watching TV',
      difficulty: 'easy',
      definition: 'Sitting on the couch staring at shows on a screen.',
      aliases: ['watching television'],
    },

    // Medium
    {
      term: 'sneezing',
      difficulty: 'medium',
      definition: 'A sudden, noisy burst of air from your nose, like ah-choo.',
    },
    {
      term: 'juggling',
      difficulty: 'medium',
      definition: 'Keeping several objects tossed in the air at once.',
    },
    {
      term: 'whistling',
      difficulty: 'medium',
      definition: 'Making a high tune by blowing air through puckered lips.',
    },
    {
      term: 'shivering',
      difficulty: 'medium',
      definition: 'Shaking all over because you are very cold.',
    },
    {
      term: 'tickling',
      difficulty: 'medium',
      definition: 'Wiggling your fingers on someone to make them giggle.',
    },
    {
      term: 'stretching',
      difficulty: 'medium',
      definition:
        'Reaching your arms and legs out long to loosen up your muscles.',
    },
    {
      term: 'smelling',
      difficulty: 'medium',
      definition:
        'Breathing in through your nose to catch a scent, like from a flower.',
      aliases: ['sniffing'],
    },
    {
      term: 'shaking hands',
      difficulty: 'medium',
      definition:
        "Gripping someone's palm and pumping it up and down as a greeting.",
      aliases: ['handshake'],
    },
    {
      term: 'raising your hand',
      difficulty: 'medium',
      definition:
        'Lifting your arm up high in class so the teacher will call on you.',
      aliases: ['raising a hand'],
    },
    {
      term: 'shopping',
      difficulty: 'medium',
      definition:
        'Browsing a store and filling a cart or bags with things to buy.',
    },
    {
      term: 'raking leaves',
      difficulty: 'medium',
      definition:
        'Pulling fallen foliage into a pile with a long-toothed garden tool.',
    },
    {
      term: 'mowing the lawn',
      difficulty: 'medium',
      definition:
        'Pushing a noisy machine across a yard to cut the grass short.',
    },
    {
      term: 'washing dishes',
      difficulty: 'medium',
      definition:
        'Scrubbing dirty plates and cups with soapy water at the sink.',
    },
    {
      term: 'making the bed',
      difficulty: 'medium',
      definition:
        'Smoothing out the sheets and blanket and fluffing the pillow after waking up.',
      aliases: ['making a bed'],
    },
    {
      term: 'ironing',
      difficulty: 'medium',
      definition:
        'Pressing wrinkles out of clothes with a hot, flat appliance.',
    },
    {
      term: 'shaving',
      difficulty: 'medium',
      definition: 'Scraping off facial hair with a razor after spreading foam.',
    },
    {
      term: 'texting',
      difficulty: 'medium',
      definition: 'Tapping out quick messages with your thumbs on a phone.',
    },
    {
      term: 'hiking',
      difficulty: 'medium',
      definition: 'Taking a long walk on a trail through hills or mountains.',
    },
    {
      term: 'sunbathing',
      difficulty: 'medium',
      definition: 'Lying on a towel outside to soak up warm rays.',
    },
    {
      term: 'building a sandcastle',
      difficulty: 'medium',
      definition:
        'Packing a bucket at the beach to make towers, walls, and a moat.',
    },
    {
      term: 'bird watching',
      difficulty: 'medium',
      definition:
        'Peering through binoculars to spot and name feathered wildlife.',
    },
    {
      term: 'picking flowers',
      difficulty: 'medium',
      definition: 'Plucking blooms from a garden or meadow to make a bouquet.',
    },
    {
      term: 'milking a cow',
      difficulty: 'medium',
      definition: "Squeezing a farm animal's udder to fill a pail.",
    },
    {
      term: 'roasting marshmallows',
      difficulty: 'medium',
      definition:
        'Holding fluffy white treats on a stick over a campfire until golden.',
    },
    {
      term: 'cheering',
      difficulty: 'medium',
      definition:
        'Shouting and waving your arms to support a team or performer.',
    },
    {
      term: 'flipping a coin',
      difficulty: 'medium',
      definition:
        'Tossing a small metal disk up with your thumb to call heads or tails.',
      aliases: ['tossing a coin', 'coin toss'],
    },
    {
      term: 'peeking',
      difficulty: 'medium',
      definition:
        'Sneaking a quick look through a gap or between your fingers.',
    },
    {
      term: 'spilling milk',
      difficulty: 'medium',
      definition:
        'Knocking over a full glass so a white puddle runs across the table.',
    },
    {
      term: 'feeding a baby',
      difficulty: 'medium',
      definition:
        "Spooning food into an infant's mouth, sometimes making airplane noises.",
    },
    {
      term: 'recycling',
      difficulty: 'medium',
      definition:
        'Sorting used bottles, cans, and paper into special bins so they can be reused.',
    },

    // Hard
    {
      term: 'sleepwalking',
      difficulty: 'hard',
      definition:
        'Wandering around with your arms out while you are still asleep.',
    },
    {
      term: 'tightrope walking',
      difficulty: 'hard',
      definition:
        'Balancing step by step along a thin wire stretched high above the ground.',
    },
    {
      term: 'daydreaming',
      difficulty: 'hard',
      definition:
        'Staring off into space while your mind drifts to pleasant thoughts.',
    },
    {
      term: 'eavesdropping',
      difficulty: 'hard',
      definition:
        "Secretly listening to someone else's conversation, maybe with a glass on the wall.",
    },
    {
      term: 'multitasking',
      difficulty: 'hard',
      definition: 'Doing many different jobs at the same time.',
    },
    {
      term: 'waiting in line',
      difficulty: 'hard',
      definition: 'Standing behind other people until it is finally your turn.',
      aliases: ['standing in line'],
    },
    {
      term: 'counting sheep',
      difficulty: 'hard',
      definition:
        'Picturing fluffy animals hopping a fence one by one to fall asleep.',
    },
    {
      term: 'skipping stones',
      difficulty: 'hard',
      definition:
        'Flicking flat rocks across a pond so they bounce off the water.',
      aliases: ['skipping rocks'],
    },
    {
      term: 'blushing',
      difficulty: 'hard',
      definition:
        'Turning red in the cheeks because you feel shy or embarrassed.',
    },
    {
      term: 'shrugging',
      difficulty: 'hard',
      definition:
        "Lifting your shoulders and turning up your palms to say I don't know.",
    },
    {
      term: 'getting lost',
      difficulty: 'hard',
      definition:
        'Not knowing where you are or how to get back, maybe while holding a map.',
    },
    {
      term: 'photobombing',
      difficulty: 'hard',
      definition:
        "Sneaking into the background of someone else's picture to be silly.",
    },
    {
      term: 'gargling',
      difficulty: 'hard',
      definition:
        'Bubbling water in the back of your throat with your head tipped back.',
    },
    {
      term: 'throwing a tantrum',
      difficulty: 'hard',
      definition:
        'A child screaming, kicking, and flailing on the floor in a fit.',
      aliases: ['temper tantrum'],
    },
    {
      term: 'whispering',
      difficulty: 'hard',
      definition:
        "Talking very softly into someone's ear so others can't hear.",
    },
    {
      term: 'tiptoeing',
      difficulty: 'hard',
      definition:
        'Walking quietly on the very fronts of your feet so no one hears you.',
    },
    {
      term: 'slipping',
      difficulty: 'hard',
      definition:
        'Losing your footing on something slick, like a banana peel or ice.',
    },
    {
      term: 'rolling your eyes',
      difficulty: 'hard',
      definition:
        'Turning your gaze up and around to show you are annoyed or bored.',
      aliases: ['eye rolling'],
    },
    {
      term: 'getting dizzy',
      difficulty: 'hard',
      definition:
        "Spinning until the world seems to whirl and you can't stand up straight.",
    },
    {
      term: 'holding your breath',
      difficulty: 'hard',
      definition:
        'Puffing out your cheeks and keeping air in, like when going underwater.',
    },
    {
      term: 'passing a note',
      difficulty: 'hard',
      definition:
        'Secretly handing a folded message to a classmate during a lesson.',
    },
  ],
}
