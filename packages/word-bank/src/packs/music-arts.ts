import type { WordPackData } from '../play/types'

/**
 * Curated `music-arts` pack. Ids derive from `music-arts/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const MUSIC_ARTS_PACK: WordPackData = {
  id: 'music-arts',
  words: [
    // Easy
    {
      term: 'guitar',
      difficulty: 'easy',
      definition:
        'An instrument with six strings and a long neck that you strum or pluck.',
    },
    {
      term: 'drum',
      difficulty: 'easy',
      definition:
        'A hollow, round instrument you beat with sticks or your hands.',
    },
    {
      term: 'piano',
      difficulty: 'easy',
      definition:
        'A large instrument with rows of black and white keys you press to play.',
    },
    {
      term: 'violin',
      difficulty: 'easy',
      definition:
        'A small wooden stringed instrument held under the chin and played with a bow.',
    },
    {
      term: 'trumpet',
      difficulty: 'easy',
      definition:
        'A shiny brass horn with three buttons that you blow into to play loud notes.',
    },
    {
      term: 'flute',
      difficulty: 'easy',
      definition:
        'A long, thin metal instrument held sideways and played by blowing across a hole.',
    },
    {
      term: 'harp',
      difficulty: 'easy',
      definition:
        'A tall, curved frame strung with many strings that you pluck with your fingers.',
    },
    {
      term: 'microphone',
      difficulty: 'easy',
      definition: 'A device you speak or sing into to make your voice louder.',
      aliases: ['mic'],
    },
    {
      term: 'music note',
      difficulty: 'easy',
      definition:
        'A symbol shaped like a dot with a stem and a flag, used to write down a song.',
      aliases: ['musical note', 'note'],
    },
    {
      term: 'headphones',
      difficulty: 'easy',
      definition:
        'A pair of small speakers worn over your ears so you can listen privately.',
    },
    {
      term: 'radio',
      difficulty: 'easy',
      definition:
        'A box with an antenna and dials that plays songs and news sent through the air.',
    },
    {
      term: 'paintbrush',
      difficulty: 'easy',
      definition:
        'A stick with soft bristles at one end, used to spread color on paper or canvas.',
    },
    {
      term: 'crayon',
      difficulty: 'easy',
      definition: 'A stick of colored wax that kids use to color in pictures.',
    },
    {
      term: 'palette',
      difficulty: 'easy',
      definition:
        'A flat board with a thumb hole where a painter mixes blobs of color.',
      aliases: ['paint palette'],
    },
    {
      term: 'glue',
      difficulty: 'easy',
      definition: 'A sticky liquid that holds paper and craft pieces together.',
    },
    {
      term: 'ball of yarn',
      difficulty: 'easy',
      definition:
        'A round bundle of soft, thick thread used for knitting and loved by kittens.',
      aliases: ['yarn'],
    },
    {
      term: 'coloring book',
      difficulty: 'easy',
      definition:
        'Pages of black outline pictures waiting to be filled in with crayons.',
    },
    {
      term: 'triangle',
      difficulty: 'easy',
      definition:
        'A metal bar bent into a three-sided shape that rings when tapped with a rod.',
    },
    {
      term: 'xylophone',
      difficulty: 'easy',
      definition:
        'An instrument with a row of wooden or metal bars you hit with little mallets.',
    },
    {
      term: 'maraca',
      difficulty: 'easy',
      definition:
        'A rattle on a handle, filled with beads, that you shake to keep the beat.',
    },
    {
      term: 'tambourine',
      difficulty: 'easy',
      definition:
        'A small hand drum with metal jingles around its edge that you shake or tap.',
    },
    {
      term: 'clown',
      difficulty: 'easy',
      definition:
        'A circus performer with a red nose, face paint, giant shoes, and silly tricks.',
    },
    {
      term: 'ballerina',
      difficulty: 'easy',
      definition:
        'A dancer in a tutu who spins and balances on the tips of her toes.',
      aliases: ['ballet dancer'],
    },
    {
      term: 'puppet',
      difficulty: 'easy',
      definition:
        'A doll that a performer moves with a hand inside it or with strings.',
    },
    {
      term: 'magician',
      difficulty: 'easy',
      definition:
        'A performer in a top hat who pulls rabbits out of hats and makes things vanish.',
    },
    {
      term: 'disco ball',
      difficulty: 'easy',
      definition:
        'A spinning sphere covered in tiny mirrors that scatters sparkles across a dance floor.',
      aliases: ['mirror ball'],
    },
    {
      term: 'spotlight',
      difficulty: 'easy',
      definition:
        'A bright, narrow beam of light that follows a performer around a stage.',
    },

    // Medium
    {
      term: 'saxophone',
      difficulty: 'medium',
      definition: 'A curved metal horn with many keys, famous in jazz music.',
      aliases: ['sax'],
    },
    {
      term: 'trombone',
      difficulty: 'medium',
      definition: 'A brass horn you play by sliding a long tube in and out.',
    },
    {
      term: 'tuba',
      difficulty: 'medium',
      definition:
        'A huge, deep-sounding brass horn with a wide bell that points up.',
    },
    {
      term: 'accordion',
      difficulty: 'medium',
      definition:
        'A boxy instrument with pleated folds that you squeeze in and out while pressing keys.',
    },
    {
      term: 'harmonica',
      difficulty: 'medium',
      definition:
        'A small instrument with a row of holes that you slide across your lips and blow into.',
    },
    {
      term: 'bagpipe',
      difficulty: 'medium',
      definition:
        'An instrument with a puffy air sack and several long tubes, played by blowing and squeezing.',
    },
    {
      term: 'gong',
      difficulty: 'medium',
      definition:
        'A giant metal disc hanging in a frame that booms when struck with a mallet.',
    },
    {
      term: 'jukebox',
      difficulty: 'medium',
      definition:
        'A big, glowing machine in a diner that plays the song you pick after you drop in a coin.',
    },
    {
      term: 'record player',
      difficulty: 'medium',
      definition:
        'A machine with a spinning platter and a needle that plays big black vinyl discs.',
      aliases: ['turntable'],
    },
    {
      term: 'boombox',
      difficulty: 'medium',
      definition:
        'A large portable stereo with two big speakers and a handle, often carried on a shoulder.',
    },
    {
      term: 'cassette tape',
      difficulty: 'medium',
      definition:
        'A small plastic case holding two little reels of ribbon that stores recorded songs.',
      aliases: ['cassette'],
    },
    {
      term: 'sheet music',
      difficulty: 'medium',
      definition:
        'Pages printed with lines and notes that tell musicians what to play.',
    },
    {
      term: 'music box',
      difficulty: 'medium',
      definition:
        'A little wind-up case that plays a tinkly tune, often with a tiny dancer spinning on top.',
    },
    {
      term: 'easel',
      difficulty: 'medium',
      definition:
        'A tall three-legged stand that holds a canvas while an artist paints.',
    },
    {
      term: 'sketchbook',
      difficulty: 'medium',
      definition:
        'A bound pad of blank pages for doodling and practicing drawings.',
    },
    {
      term: 'sculpture',
      difficulty: 'medium',
      definition:
        'A work of art carved or molded from stone, clay, or metal into a solid shape.',
      aliases: ['statue'],
    },
    {
      term: 'pottery wheel',
      difficulty: 'medium',
      definition:
        'A spinning round table where you shape wet clay into bowls and vases with your hands.',
    },
    {
      term: 'origami',
      difficulty: 'medium',
      definition:
        'The art of folding a single sheet of paper into shapes like cranes and frogs.',
    },
    {
      term: 'quilt',
      difficulty: 'medium',
      definition:
        'A warm bed cover made by sewing many colorful fabric squares together.',
    },
    {
      term: 'glitter',
      difficulty: 'medium',
      definition:
        'Tiny shiny flakes that kids sprinkle onto glue to make their crafts sparkle.',
    },
    {
      term: 'googly eye',
      difficulty: 'medium',
      definition:
        'A little plastic circle with a loose black pupil that wobbles, stuck onto crafts for fun.',
    },
    {
      term: 'sidewalk chalk',
      difficulty: 'medium',
      definition:
        'Fat, colorful sticks kids use to draw pictures on the pavement outside.',
      aliases: ['chalk'],
    },
    {
      term: 'finger painting',
      difficulty: 'medium',
      definition:
        'Making a messy picture by dipping your hands straight into wet colors.',
    },
    {
      term: 'face painting',
      difficulty: 'medium',
      definition:
        "Brushing colorful designs like tiger stripes or butterflies onto someone's cheeks.",
    },
    {
      term: 'comic strip',
      difficulty: 'medium',
      definition:
        'A short story told in a row of drawn boxes with speech bubbles.',
    },
    {
      term: 'tie-dye',
      difficulty: 'medium',
      definition:
        'Twisting and banding a white shirt, then soaking it in colors to make swirly patterns.',
    },
    {
      term: 'wind chime',
      difficulty: 'medium',
      definition:
        'Hanging metal tubes that ring softly when a breeze knocks them together.',
    },
    {
      term: 'friendship bracelet',
      difficulty: 'medium',
      definition:
        'A woven band of colorful string that you make and give to a buddy.',
    },
    {
      term: 'scrapbook',
      difficulty: 'medium',
      definition:
        'An album where you glue photos, tickets, and stickers to save memories.',
    },
    {
      term: 'rock star',
      difficulty: 'medium',
      definition:
        'A famous, wild performer who plays loud guitar music for screaming fans.',
    },

    // Hard
    {
      term: 'orchestra',
      difficulty: 'hard',
      definition:
        'A large group of musicians playing violins, horns, and drums together, led by a conductor.',
    },
    {
      term: 'choir',
      difficulty: 'hard',
      definition:
        'A group of singers who perform together, often in matching robes.',
    },
    {
      term: 'marching band',
      difficulty: 'hard',
      definition:
        'Musicians in matching uniforms who play while stepping in rows, like in a parade.',
    },
    {
      term: 'breakdancing',
      difficulty: 'hard',
      definition:
        'A street dance with fast spins on the floor, sometimes even on your head.',
      aliases: ['breakdance'],
    },
    {
      term: 'tap dancing',
      difficulty: 'hard',
      definition:
        'Stepping to music in special shoes with metal plates that click on the floor.',
      aliases: ['tap dance'],
    },
    {
      term: 'mime',
      difficulty: 'hard',
      definition:
        'A silent performer with a white painted face who pretends to be stuck in an invisible box.',
    },
    {
      term: 'air guitar',
      difficulty: 'hard',
      definition:
        'Pretending to rock out on a stringed instrument that is not really there.',
    },
    {
      term: 'one-man band',
      difficulty: 'hard',
      definition:
        'A single performer playing many instruments strapped to their body at once.',
      aliases: ['one-person band'],
    },
    {
      term: 'lullaby',
      difficulty: 'hard',
      definition: 'A soft, gentle song sung to help a baby fall asleep.',
    },
    {
      term: 'karaoke',
      difficulty: 'hard',
      definition:
        'Singing along to the words of a song shown on a screen, just for fun.',
    },
    {
      term: 'opera singer',
      difficulty: 'hard',
      definition:
        'A performer who sings dramatic stories in a powerful voice, often hitting very high notes.',
    },
    {
      term: 'standing ovation',
      difficulty: 'hard',
      definition: 'When a whole audience rises to its feet and claps loudly.',
    },
    {
      term: 'stage fright',
      difficulty: 'hard',
      definition:
        'Feeling scared and shaky right before you perform in front of a crowd.',
    },
    {
      term: 'jazz hands',
      difficulty: 'hard',
      definition:
        'Spreading your fingers wide and wiggling them at the audience while you perform.',
    },
    {
      term: 'conga line',
      difficulty: 'hard',
      definition:
        'A party dance where a long chain of people hold the waist of the person ahead.',
    },
    {
      term: 'talent show',
      difficulty: 'hard',
      definition:
        'An event where people take turns on stage showing off singing, dancing, or tricks.',
    },
    {
      term: 'paint by numbers',
      difficulty: 'hard',
      definition:
        'An art kit where each small area of a picture is labeled with the color to fill in.',
    },
    {
      term: 'self-portrait',
      difficulty: 'hard',
      definition:
        'A picture an artist makes of their own face, often while looking in a mirror.',
    },
    {
      term: 'mural',
      difficulty: 'hard',
      definition:
        'A huge painting made right on the side of a wall or building.',
    },
    {
      term: 'stained glass',
      difficulty: 'hard',
      definition:
        'Colorful see-through pieces joined with dark lines to form a picture in a window.',
    },
  ],
}
