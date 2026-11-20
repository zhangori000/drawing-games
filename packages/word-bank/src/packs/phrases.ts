import type { WordPackData } from '../play/types'

/**
 * Curated `phrases` pack. Ids derive from `phrases/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const PHRASES_PACK: WordPackData = {
  id: 'phrases',
  words: [
    // Easy
    {
      term: 'thumbs up',
      difficulty: 'easy',
      definition:
        'A closed fist with one short digit sticking up, a sign that means yes or good job.',
    },
    {
      term: 'high five',
      difficulty: 'easy',
      definition:
        'Two people slapping their raised palms together to celebrate.',
    },
    {
      term: 'top dog',
      difficulty: 'easy',
      definition:
        'The boss or winner of a group, the one everybody else looks up to.',
    },
    {
      term: 'big cheese',
      difficulty: 'easy',
      definition:
        'The most important person in charge, like the boss of a whole company.',
    },
    {
      term: 'hot potato',
      difficulty: 'easy',
      definition:
        'A touchy problem that everybody wants to pass along to someone else fast.',
    },
    {
      term: 'heart of gold',
      difficulty: 'easy',
      definition:
        'A very kind and generous nature, like a friend who always helps others.',
    },
    {
      term: 'cash cow',
      difficulty: 'easy',
      definition:
        'Something that keeps bringing in lots of money, like a bestselling product.',
    },
    {
      term: 'pig out',
      difficulty: 'easy',
      definition:
        'To eat a huge amount of food all at once, like at an all-you-can-eat buffet.',
    },
    {
      term: 'sweet dreams',
      difficulty: 'easy',
      definition:
        'A cozy goodnight wish for someone who is about to fall asleep.',
    },
    {
      term: 'big mouth',
      difficulty: 'easy',
      definition: 'Someone who talks too much and can never keep a secret.',
    },
    {
      term: 'egghead',
      difficulty: 'easy',
      definition: 'A very brainy person who loves books, facts, and big ideas.',
    },
    {
      term: 'cool cat',
      difficulty: 'easy',
      definition: 'A calm, stylish person who never seems to get nervous.',
    },
    {
      term: 'crybaby',
      difficulty: 'easy',
      definition:
        'Someone who whines or sobs over every little thing that goes wrong.',
    },
    {
      term: 'bad apple',
      difficulty: 'easy',
      definition: 'One troublemaker who gives a whole group a bad name.',
    },
    {
      term: 'zip it',
      difficulty: 'easy',
      definition: 'A playful way to tell someone to stop talking right now.',
    },
    {
      term: 'love bug',
      difficulty: 'easy',
      definition:
        'A sweet, cuddly person, or the giddy feeling of falling for someone.',
    },
    {
      term: 'eagle eye',
      difficulty: 'easy',
      definition:
        'Super sharp eyesight that spots the tiniest detail from far away.',
    },
    {
      term: 'cat nap',
      difficulty: 'easy',
      definition: 'A short, light snooze in the middle of the day.',
    },
    {
      term: 'lucky duck',
      difficulty: 'easy',
      definition:
        'Someone who keeps getting good luck, like winning every raffle they enter.',
    },

    // Medium
    {
      term: 'piece of cake',
      difficulty: 'medium',
      definition:
        'Something super easy to do, like a test you barely had to study for.',
    },
    {
      term: 'couch potato',
      difficulty: 'medium',
      definition:
        'A lazy person who spends hours lounging on the sofa watching shows.',
    },
    {
      term: 'time flies',
      difficulty: 'medium',
      definition:
        'The hours seem to zoom by, especially when you are having fun.',
    },
    {
      term: 'cold feet',
      difficulty: 'medium',
      definition:
        'Getting suddenly nervous and wanting to back out right before something big.',
    },
    {
      term: 'night owl',
      difficulty: 'medium',
      definition:
        'Someone who loves staying up very late and is most awake after dark.',
    },
    {
      term: 'early bird',
      difficulty: 'medium',
      definition: 'Someone who wakes up or shows up before everyone else.',
    },
    {
      term: 'bookworm',
      difficulty: 'medium',
      definition:
        'A person who loves reading and always has their nose in a novel.',
    },
    {
      term: 'busy bee',
      difficulty: 'medium',
      definition:
        'A person who is always hard at work, buzzing from one task to the next.',
    },
    {
      term: 'eager beaver',
      difficulty: 'medium',
      definition: 'Someone who is extremely excited and willing to work hard.',
    },
    {
      term: 'party animal',
      difficulty: 'medium',
      definition:
        'Someone who loves celebrations and is always the last to leave the dance floor.',
    },
    {
      term: 'copycat',
      difficulty: 'medium',
      definition:
        'Someone who imitates exactly what another person says or does.',
    },
    {
      term: 'smart cookie',
      difficulty: 'medium',
      definition: 'A clever person who figures things out quickly.',
    },
    {
      term: 'snail mail',
      difficulty: 'medium',
      definition:
        'Letters sent the slow way through the post office instead of by email.',
    },
    {
      term: 'bear hug',
      difficulty: 'medium',
      definition: 'A big, tight, squeezing embrace with both arms.',
    },
    {
      term: 'when pigs fly',
      difficulty: 'medium',
      definition: 'A joking way to say something will never, ever happen.',
    },
    {
      term: 'puppy dog eyes',
      difficulty: 'medium',
      definition:
        'A sad, pleading, wide-eyed look someone gives to get what they want.',
      aliases: ['puppy eyes'],
    },
    {
      term: 'butterfingers',
      difficulty: 'medium',
      definition: 'A clumsy person who keeps dropping things.',
    },
    {
      term: 'green thumb',
      difficulty: 'medium',
      definition:
        'A special talent for growing plants and keeping a garden healthy.',
    },
    {
      term: 'sweet tooth',
      difficulty: 'medium',
      definition: 'A strong love of candy, cake, and other sugary treats.',
    },
    {
      term: 'bad hair day',
      difficulty: 'medium',
      definition:
        'When everything goes wrong from the moment you wake up with a wild, messy mop on your head.',
    },
    {
      term: 'brainstorm',
      difficulty: 'medium',
      definition:
        'A burst of quick ideas, often shared by a group trying to solve a problem.',
    },
    {
      term: 'cliffhanger',
      difficulty: 'medium',
      definition:
        'A story that stops at the most exciting moment so you have to wait to find out what happens.',
    },
    {
      term: 'say cheese',
      difficulty: 'medium',
      definition:
        'What a photographer tells you so that you smile for the picture.',
    },
    {
      term: 'fingers crossed',
      difficulty: 'medium',
      definition: 'Hoping really hard that something will turn out well.',
      aliases: ['cross your fingers'],
    },
    {
      term: 'home sweet home',
      difficulty: 'medium',
      definition:
        'A happy saying about the comfort of being back in your own house.',
    },
    {
      term: 'tongue twister',
      difficulty: 'medium',
      definition:
        'A phrase that is very hard to say quickly, like she sells seashells.',
    },
    {
      term: 'glass half full',
      difficulty: 'medium',
      definition: 'Seeing the bright side of things instead of the bad side.',
    },
    {
      term: 'house of cards',
      difficulty: 'medium',
      definition:
        'A plan or setup so shaky that one small push could make it all collapse.',
    },
    {
      term: 'in a pickle',
      difficulty: 'medium',
      definition: 'Stuck in a tricky or awkward situation.',
    },
    {
      term: 'on cloud nine',
      difficulty: 'medium',
      definition: 'Feeling extremely happy, as if floating in the sky.',
      aliases: ['cloud nine'],
    },
    {
      term: 'black sheep',
      difficulty: 'medium',
      definition:
        'The one family member who is very different from all the others.',
    },
    {
      term: 'crocodile tears',
      difficulty: 'medium',
      definition: 'Fake crying that someone puts on to get sympathy.',
    },

    // Hard
    {
      term: 'break the ice',
      difficulty: 'hard',
      definition: 'Do or say something to make strangers feel less awkward.',
    },
    {
      term: 'spill the beans',
      difficulty: 'hard',
      definition: 'Accidentally tell a secret or give away a surprise.',
    },
    {
      term: 'hit the hay',
      difficulty: 'hard',
      definition: 'Go to bed for the night.',
    },
    {
      term: 'under the weather',
      difficulty: 'hard',
      definition: 'Feeling a little sick or not quite well.',
    },
    {
      term: 'over the moon',
      difficulty: 'hard',
      definition: 'Extremely happy and delighted about something.',
    },
    {
      term: 'on thin ice',
      difficulty: 'hard',
      definition:
        'In a risky spot where one more mistake will get you in trouble.',
    },
    {
      term: 'silver lining',
      difficulty: 'hard',
      definition: 'Something good hidden inside a bad situation.',
    },
    {
      term: 'rain check',
      difficulty: 'hard',
      definition:
        'A promise to do something another time when you cannot do it now.',
    },
    {
      term: 'snowball effect',
      difficulty: 'hard',
      definition:
        'When something small keeps growing bigger and faster on its own.',
    },
    {
      term: 'walking on eggshells',
      difficulty: 'hard',
      definition: 'Being extremely careful not to upset someone.',
      aliases: ['walk on eggshells'],
    },
    {
      term: 'wild goose chase',
      difficulty: 'hard',
      definition: 'A long, pointless search for something you will never find.',
    },
    {
      term: 'hold your horses',
      difficulty: 'hard',
      definition: 'Slow down and be patient for a moment.',
    },
    {
      term: 'monkey business',
      difficulty: 'hard',
      definition: 'Silly or sneaky behavior that causes mischief.',
    },
    {
      term: 'lone wolf',
      difficulty: 'hard',
      definition:
        'A person who prefers to do things by themselves rather than with a group.',
    },
    {
      term: 'social butterfly',
      difficulty: 'hard',
      definition:
        'A friendly person who loves chatting with everyone at a gathering.',
    },
    {
      term: 'underdog',
      difficulty: 'hard',
      definition: 'The player or team that everyone expects to lose.',
    },
    {
      term: "lion's share",
      difficulty: 'hard',
      definition: 'The biggest part of something, like most of the pizza.',
    },
    {
      term: 'herding cats',
      difficulty: 'hard',
      definition: 'Trying to organize a group that refuses to cooperate.',
    },
    {
      term: 'can of worms',
      difficulty: 'hard',
      definition:
        'A situation that creates lots of new problems once you start dealing with it.',
    },
    {
      term: 'third wheel',
      difficulty: 'hard',
      definition: 'The extra person tagging along with a couple on a date.',
    },
    {
      term: 'odd one out',
      difficulty: 'hard',
      definition: 'The single thing in a group that does not match the rest.',
      aliases: ['odd man out'],
    },
    {
      term: 'wallflower',
      difficulty: 'hard',
      definition:
        'A shy person who stands quietly by the side at a party or dance.',
    },
    {
      term: 'late bloomer',
      difficulty: 'hard',
      definition:
        'Someone who discovers their talent or grows up later than others.',
    },
    {
      term: 'all ears',
      difficulty: 'hard',
      definition: 'Listening very closely and eagerly.',
    },
    {
      term: 'two left feet',
      difficulty: 'hard',
      definition: 'Being very clumsy, especially when trying to dance.',
    },
    {
      term: 'head over heels',
      difficulty: 'hard',
      definition: 'Completely and happily in love with someone.',
    },
    {
      term: 'break a leg',
      difficulty: 'hard',
      definition: 'A way to wish a performer good luck before a show.',
    },
    {
      term: 'cold shoulder',
      difficulty: 'hard',
      definition:
        'Ignoring someone on purpose to show you are upset with them.',
    },
    {
      term: 'elbow grease',
      difficulty: 'hard',
      definition:
        'Hard physical effort, like scrubbing really hard to clean something.',
    },
    {
      term: 'food for thought',
      difficulty: 'hard',
      definition: 'An idea worth thinking about carefully.',
    },
    {
      term: 'train of thought',
      difficulty: 'hard',
      definition: 'The chain of ideas going through your mind at the moment.',
    },
    {
      term: 'tunnel vision',
      difficulty: 'hard',
      definition:
        'Focusing on one thing so much that you ignore everything around it.',
    },
    {
      term: "bird's-eye view",
      difficulty: 'hard',
      definition: 'Seeing something from high above, looking straight down.',
    },
    {
      term: 'outside the box',
      difficulty: 'hard',
      definition: 'Thinking in a new, creative way instead of the usual way.',
      aliases: ['think outside the box'],
    },
    {
      term: 'in a nutshell',
      difficulty: 'hard',
      definition: 'Said in just a few words, as a short summary.',
    },
    {
      term: 'burst your bubble',
      difficulty: 'hard',
      definition:
        "Ruin someone's happy belief by telling them a disappointing truth.",
    },
    {
      term: 'miss the boat',
      difficulty: 'hard',
      definition: 'Lose a chance because you waited too long.',
      aliases: ['missed the boat'],
    },
    {
      term: 'sink or swim',
      difficulty: 'hard',
      definition: 'Succeed or fail on your own with no help.',
    },
    {
      term: 'tie the knot',
      difficulty: 'hard',
      definition: 'Get married to the person you love.',
    },
    {
      term: 'cutting corners',
      difficulty: 'hard',
      definition:
        'Doing a job the quick, cheap, or lazy way instead of doing it right.',
      aliases: ['cut corners'],
    },
    {
      term: 'rock bottom',
      difficulty: 'hard',
      definition: 'The lowest, worst point that things can possibly reach.',
    },
    {
      term: 'rags to riches',
      difficulty: 'hard',
      definition: 'Going from being very poor to being very wealthy.',
    },
    {
      term: 'break the bank',
      difficulty: 'hard',
      definition: 'Cost so much that it uses up all your money.',
    },
    {
      term: 'packed like sardines',
      difficulty: 'hard',
      definition:
        'Squeezed tightly together with no room to move, as in a crowded elevator.',
    },
    {
      term: 'apples and oranges',
      difficulty: 'hard',
      definition: 'Two things so different that comparing them makes no sense.',
    },
    {
      term: 'sour grapes',
      difficulty: 'hard',
      definition:
        'Pretending you never wanted something after you failed to get it.',
    },
    {
      term: 'drawing a blank',
      difficulty: 'hard',
      definition:
        'Being unable to remember something, no matter how hard you try.',
      aliases: ['draw a blank'],
    },
    {
      term: 'knock on wood',
      difficulty: 'hard',
      definition:
        'Something people say, tapping a table, to keep their good luck going.',
    },
    {
      term: 'let off steam',
      difficulty: 'hard',
      definition:
        'Do something active or loud to release built-up anger or energy.',
      aliases: ['blow off steam'],
    },
    {
      term: 'green with envy',
      difficulty: 'hard',
      definition: 'Very jealous of what someone else has.',
    },
    {
      term: 'caught red-handed',
      difficulty: 'hard',
      definition: 'Spotted in the very act of doing something you should not.',
      aliases: ['red-handed'],
    },
    {
      term: 'backseat driver',
      difficulty: 'hard',
      definition:
        'A passenger who keeps bossing whoever is at the wheel about how to steer.',
    },
    {
      term: 'hang in there',
      difficulty: 'hard',
      definition: 'Keep going and do not give up when things get hard.',
    },
    {
      term: 'rise and shine',
      difficulty: 'hard',
      definition:
        'A cheerful way to tell someone to wake up and get out of bed.',
    },
  ],
}
