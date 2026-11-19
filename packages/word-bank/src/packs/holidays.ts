import type { WordPackData } from '../play/types'

/**
 * Curated `holidays` pack. Ids derive from `holidays/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const HOLIDAYS_PACK: WordPackData = {
  id: 'holidays',
  words: [
    // Easy
    {
      term: 'birthday cake',
      difficulty: 'easy',
      definition:
        'A frosted dessert topped with lit candles that you blow out while making a wish.',
    },
    {
      term: 'balloon',
      difficulty: 'easy',
      definition:
        'A colorful rubber bag filled with air or helium, often tied to a string.',
    },
    {
      term: 'gift',
      difficulty: 'easy',
      definition:
        'Something wrapped in pretty paper with a bow, given to someone to celebrate.',
      aliases: ['present'],
    },
    {
      term: 'party hat',
      difficulty: 'easy',
      definition:
        'A pointy paper cone with an elastic strap, worn on your head at celebrations.',
    },
    {
      term: 'snowman',
      difficulty: 'easy',
      definition:
        'A winter figure of three stacked white balls with a carrot nose and stick arms.',
    },
    {
      term: 'fireworks',
      difficulty: 'easy',
      definition:
        'Colorful bursts of light that boom and crackle across the night sky at celebrations.',
    },
    {
      term: 'sparkler',
      difficulty: 'easy',
      definition:
        'A thin wire stick that you hold while it fizzes and throws off bright sparks.',
    },
    {
      term: 'candle',
      difficulty: 'easy',
      definition: 'A stick of wax with a wick that burns with a small flame.',
    },
    {
      term: 'christmas tree',
      difficulty: 'easy',
      definition:
        'An evergreen decorated with lights and ornaments, with gifts piled underneath in December.',
    },
    {
      term: 'christmas lights',
      difficulty: 'easy',
      definition:
        'Strings of tiny colorful bulbs hung on houses and trees in December.',
    },
    {
      term: 'ornament',
      difficulty: 'easy',
      definition:
        'A shiny ball or small figure hung on a holiday tree as decoration.',
    },
    {
      term: 'wreath',
      difficulty: 'easy',
      definition:
        'A ring of evergreen branches with a bow, hung on a front door for the holidays.',
    },
    {
      term: 'santa hat',
      difficulty: 'easy',
      definition:
        'A floppy red cap with fluffy white trim and a white pom-pom on the tip.',
    },
    {
      term: 'snow globe',
      difficulty: 'easy',
      definition:
        'A clear dome holding water and a tiny scene that swirls with white flakes when shaken.',
    },
    {
      term: "jack-o'-lantern",
      difficulty: 'easy',
      definition:
        'A pumpkin carved with a spooky face and lit from inside by a candle on Halloween.',
      aliases: ['carved pumpkin'],
    },
    {
      term: 'scarecrow',
      difficulty: 'easy',
      definition:
        'A straw-stuffed figure in old clothes set on a pole to keep birds away from crops.',
    },
    {
      term: 'mask',
      difficulty: 'easy',
      definition:
        'A covering for your eyes or face, worn with a costume to hide who you are.',
    },
    {
      term: 'bunny ears',
      difficulty: 'easy',
      definition:
        'A costume headband with two tall, fluffy shapes that make you look like a rabbit.',
    },
    {
      term: 'easter egg',
      difficulty: 'easy',
      definition:
        'An oval treat painted in pastel colors that kids hunt for on a spring holiday.',
    },
    {
      term: 'valentine',
      difficulty: 'easy',
      definition:
        'A card covered in hearts that you give to someone special in February.',
    },
    {
      term: 'piñata',
      difficulty: 'easy',
      definition:
        'A paper animal stuffed with candy that blindfolded kids swing at with a stick.',
    },
    {
      term: 'wedding',
      difficulty: 'easy',
      definition:
        'A ceremony where two people in fancy clothes get married in front of family and friends.',
    },

    // Medium
    {
      term: 'stocking',
      difficulty: 'medium',
      definition:
        'A big sock hung by the fireplace to be filled with small gifts on a winter holiday.',
    },
    {
      term: 'jingle bell',
      difficulty: 'medium',
      definition:
        'A tiny round metal ball with a slit and a loose bead inside that rings when shaken.',
    },
    {
      term: 'ugly sweater',
      difficulty: 'medium',
      definition:
        'A tacky holiday top covered in reindeer, snowflakes, or blinking lights, worn for laughs.',
      aliases: ['christmas sweater'],
    },
    {
      term: 'wrapping paper',
      difficulty: 'medium',
      definition:
        'Colorful printed sheets used to cover presents before giving them.',
    },
    {
      term: 'birthday card',
      difficulty: 'medium',
      definition:
        "A folded greeting with a cheerful picture, signed and given on someone's special day.",
    },
    {
      term: 'confetti',
      difficulty: 'medium',
      definition:
        'Tiny bits of colored paper tossed into the air to celebrate.',
    },
    {
      term: 'streamer',
      difficulty: 'medium',
      definition:
        'A long twisted ribbon of crepe paper hung across a room to decorate for a party.',
    },
    {
      term: 'party horn',
      difficulty: 'medium',
      definition:
        'A curled paper tube that unrolls and toots when you blow into it at celebrations.',
      aliases: ['party blower', 'noisemaker'],
    },
    {
      term: 'balloon animal',
      difficulty: 'medium',
      definition:
        'A long, skinny rubber tube twisted into the shape of a dog, giraffe, or other creature.',
    },
    {
      term: 'goody bag',
      difficulty: 'medium',
      definition:
        'A little sack of candy and small toys handed to each guest as they leave a party.',
      aliases: ['goodie bag'],
    },
    {
      term: 'bounce house',
      difficulty: 'medium',
      definition:
        'A big inflatable castle that kids jump around inside at parties.',
      aliases: ['bouncy castle'],
    },
    {
      term: 'photo booth',
      difficulty: 'medium',
      definition:
        'A curtained nook at parties where you pose with silly props and get a strip of snapshots.',
    },
    {
      term: 'glow stick',
      difficulty: 'medium',
      definition:
        'A plastic tube you bend and shake until it shines in bright neon colors in the dark.',
    },
    {
      term: 'paper lantern',
      difficulty: 'medium',
      definition:
        'A glowing round light with a thin folded shell, hung in strings at festivals.',
    },
    {
      term: 'fake mustache',
      difficulty: 'medium',
      definition:
        'A stick-on strip of pretend hair worn above the lip as a silly disguise.',
    },
    {
      term: 'wig',
      difficulty: 'medium',
      definition:
        'A cap of fake hair worn over your own, often in wild colors for a costume.',
    },
    {
      term: 'superhero costume',
      difficulty: 'medium',
      definition:
        'A dress-up outfit with a cape, mask, and emblem so you look like a hero with powers.',
    },
    {
      term: 'lei',
      difficulty: 'medium',
      definition:
        'A necklace made of flowers, given as a welcome or worn at celebrations.',
      aliases: ['flower necklace'],
    },
    {
      term: 'flower crown',
      difficulty: 'medium',
      definition:
        'A ring of fresh blooms woven together and worn on your head at spring celebrations.',
    },
    {
      term: 'easter basket',
      difficulty: 'medium',
      definition:
        'A woven carrier filled with fake grass, candy, and painted eggs for a spring holiday.',
    },
    {
      term: 'graduation cap',
      difficulty: 'medium',
      definition:
        'A flat, square black hat with a tassel, worn on the day you finish school.',
    },
    {
      term: 'diploma',
      difficulty: 'medium',
      definition:
        'A rolled-up certificate tied with a ribbon that shows you finished school.',
    },
    {
      term: 'wedding ring',
      difficulty: 'medium',
      definition:
        'A gold or silver band that two people exchange when they get married.',
    },
    {
      term: 'flower girl',
      difficulty: 'medium',
      definition:
        'A young child who walks down the aisle ahead of the bride, scattering petals.',
    },
    {
      term: 'sleepover',
      difficulty: 'medium',
      definition:
        "A night when friends stay at someone's house in sleeping bags and pajamas.",
      aliases: ['slumber party', 'pajama party'],
    },
    {
      term: 'pillow fight',
      difficulty: 'medium',
      definition:
        'A playful battle where friends swing soft cushions at each other.',
    },
    {
      term: 'tea party',
      difficulty: 'medium',
      definition:
        'A pretend gathering where little cups are poured for friends and stuffed animals.',
    },
    {
      term: 'parade',
      difficulty: 'medium',
      definition:
        'A line of marching bands, floats, and giant balloons moving down a street to celebrate.',
    },
    {
      term: 'thanksgiving',
      difficulty: 'medium',
      definition:
        'A fall holiday when families share a big turkey dinner and say what they are grateful for.',
    },

    // Hard
    {
      term: 'trick or treat',
      difficulty: 'hard',
      definition:
        'Going door to door in costumes on Halloween night, asking neighbors for candy.',
      aliases: ['trick-or-treating'],
    },
    {
      term: 'egg hunt',
      difficulty: 'hard',
      definition:
        'A spring tradition where kids search the yard for hidden colorful treats.',
    },
    {
      term: 'surprise party',
      difficulty: 'hard',
      definition:
        'A celebration kept secret until the guest of honor walks in and everyone jumps out.',
    },
    {
      term: 'costume party',
      difficulty: 'hard',
      definition:
        'A celebration where every guest dresses up as a character, creature, or silly thing.',
    },
    {
      term: 'pool party',
      difficulty: 'hard',
      definition:
        'A summer celebration with friends splashing around in swim floats and goggles.',
    },
    {
      term: 'block party',
      difficulty: 'hard',
      definition:
        'A street celebration where neighbors close off the road to share food, music, and games.',
    },
    {
      term: 'party crasher',
      difficulty: 'hard',
      definition:
        'Someone who shows up to a celebration without being invited.',
    },
    {
      term: 'baby shower',
      difficulty: 'hard',
      definition:
        'A party where friends bring gifts for parents who are expecting a newborn.',
    },
    {
      term: 'prom',
      difficulty: 'hard',
      definition:
        'A fancy high school dance where students dress up in gowns and tuxedos.',
    },
    {
      term: 'family reunion',
      difficulty: 'hard',
      definition:
        'A big get-together where relatives from far away gather, often for a group photo.',
    },
    {
      term: 'potluck',
      difficulty: 'hard',
      definition:
        'A meal where every guest brings a homemade dish to share with the group.',
    },
    {
      term: 'ribbon cutting',
      difficulty: 'hard',
      definition:
        'A ceremony where someone snips a wide band with giant scissors to open a new building.',
    },
    {
      term: 'pie-eating contest',
      difficulty: 'hard',
      definition:
        'A race to gobble down a whole dessert the fastest, usually with your hands behind your back.',
    },
    {
      term: 'secret santa',
      difficulty: 'hard',
      definition:
        'A gift swap where each person is assigned someone to buy for without telling them.',
    },
    {
      term: 'secret admirer',
      difficulty: 'hard',
      definition:
        'Someone who sends sweet notes or gifts to a person without saying who they are.',
    },
    {
      term: 'mistletoe',
      difficulty: 'hard',
      definition:
        'A sprig of green leaves and white berries hung in a doorway during the winter holidays.',
    },
    {
      term: 'nutcracker',
      difficulty: 'hard',
      definition:
        'A wooden soldier doll with a hinged jaw, used as a winter holiday decoration.',
    },
    {
      term: "new year's eve",
      difficulty: 'hard',
      definition:
        'The last night of December, when everyone counts down to midnight and cheers.',
      aliases: ['new year'],
    },
    {
      term: 'groundhog day',
      difficulty: 'hard',
      definition:
        'A February tradition where people watch to see if a furry animal sees its shadow.',
    },
    {
      term: "april fools' day",
      difficulty: 'hard',
      definition:
        'A spring holiday for playing harmless pranks and silly jokes on friends.',
      aliases: ['april fools'],
    },
    {
      term: 'cornucopia',
      difficulty: 'hard',
      definition:
        'A horn-shaped basket overflowing with fruits and vegetables, used as a fall decoration.',
      aliases: ['horn of plenty'],
    },
    {
      term: 'wishbone',
      difficulty: 'hard',
      definition:
        'A forked bit from a roasted turkey that two people tug apart to see whose wish comes true.',
    },
    {
      term: 'black friday',
      difficulty: 'hard',
      definition:
        'The day after Thanksgiving, when crowds rush into stores for big holiday sales.',
    },
  ],
}
