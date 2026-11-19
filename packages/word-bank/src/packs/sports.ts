import type { WordPackData } from '../play/types'

/**
 * Curated `sports` pack. Ids derive from `sports/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const SPORTS_PACK: WordPackData = {
  id: 'sports',
  words: [
    // Easy
    {
      term: 'soccer ball',
      difficulty: 'easy',
      definition: 'A round black-and-white sphere you kick toward a goal.',
    },
    {
      term: 'basketball',
      difficulty: 'easy',
      definition:
        'A team game where players dribble and shoot an orange sphere through a high hoop.',
    },
    {
      term: 'baseball',
      difficulty: 'easy',
      definition:
        'A bat-and-glove team game where hitters run around four bases.',
    },
    {
      term: 'football',
      difficulty: 'easy',
      definition:
        'A tackle game played with a brown, pointy-ended oval you throw and carry.',
    },
    {
      term: 'tennis',
      difficulty: 'easy',
      definition:
        'A game where players swing rackets to hit a fuzzy yellow ball over a net.',
    },
    {
      term: 'golf',
      difficulty: 'easy',
      definition:
        'A game of hitting a small white ball with clubs into faraway holes.',
    },
    {
      term: 'bowling',
      difficulty: 'easy',
      definition:
        'A game of rolling a heavy ball down a lane to knock over ten pins.',
    },
    {
      term: 'hockey',
      difficulty: 'easy',
      definition:
        'A game on ice where players with long sticks slap a puck into a net.',
      aliases: ['ice hockey'],
    },
    {
      term: 'swimming',
      difficulty: 'easy',
      definition:
        'Moving through water by kicking your legs and stroking with your arms.',
    },
    {
      term: 'surfing',
      difficulty: 'easy',
      definition:
        'Riding a breaking ocean wave while standing on a long board.',
    },
    {
      term: 'skiing',
      difficulty: 'easy',
      definition: 'Gliding down a snowy mountain on two long, narrow boards.',
    },
    {
      term: 'fishing',
      difficulty: 'easy',
      definition:
        'Trying to catch something from a lake with a rod, a line, and a baited hook.',
    },
    {
      term: 'skateboard',
      difficulty: 'easy',
      definition:
        'A short plank on four small wheels that you ride standing up.',
    },
    {
      term: 'roller skate',
      difficulty: 'easy',
      definition: 'A boot with four wheels on the bottom for rolling along.',
    },
    {
      term: 'ice skate',
      difficulty: 'easy',
      definition:
        'A boot with a thin metal blade underneath for gliding on a frozen rink.',
    },
    {
      term: 'jump rope',
      difficulty: 'easy',
      definition:
        'A long cord you swing over your head and hop over again and again.',
    },
    {
      term: 'dumbbell',
      difficulty: 'easy',
      definition:
        'A short bar with a heavy weight on each end, lifted for exercise.',
    },
    {
      term: 'whistle',
      difficulty: 'easy',
      definition:
        'A small tool you blow into to make a sharp, shrill sound, used by coaches.',
    },
    {
      term: 'trophy',
      difficulty: 'easy',
      definition: 'A shiny cup-shaped prize, often gold, given to a winner.',
    },
    {
      term: 'medal',
      difficulty: 'easy',
      definition:
        "A metal disk on a ribbon that is hung around a winner's neck.",
      aliases: ['gold medal'],
    },
    {
      term: 'dice',
      difficulty: 'easy',
      definition:
        'Small cubes with one to six dots on each side, rolled in board games.',
    },
    {
      term: 'playing card',
      difficulty: 'easy',
      definition:
        'One of a deck of fifty-two printed with hearts, spades, clubs, or diamonds.',
    },
    {
      term: 'jigsaw puzzle',
      difficulty: 'easy',
      definition:
        'A picture cut into many interlocking pieces that you fit back together.',
      aliases: ['puzzle'],
    },
    {
      term: 'tic-tac-toe',
      difficulty: 'easy',
      definition:
        'A pencil game of Xs and Os where you try to get three in a row.',
    },
    {
      term: 'seesaw',
      difficulty: 'easy',
      definition:
        'A long plank balanced in the middle that two kids ride up and down.',
      aliases: ['teeter-totter'],
    },
    {
      term: 'swing set',
      difficulty: 'easy',
      definition:
        'A playground frame with seats hanging from chains for swooping back and forth.',
      aliases: ['swing'],
    },
    {
      term: 'hopscotch',
      difficulty: 'easy',
      definition:
        'A playground game of hopping through chalk squares after tossing a stone.',
    },
    {
      term: 'beach ball',
      difficulty: 'easy',
      definition:
        'A big, light, blow-up toy with colorful stripes, tossed around at the shore.',
    },
    {
      term: 'push-up',
      difficulty: 'easy',
      definition:
        'An exercise of lowering and raising your body with your arms while facing the floor.',
    },
    {
      term: 'domino',
      difficulty: 'easy',
      definition:
        'A small black tile with white dots, often lined up to topple in a row.',
    },
    {
      term: 'trampoline',
      difficulty: 'easy',
      definition: 'A stretchy mat on a frame for bouncing.',
    },

    // Medium
    {
      term: 'volleyball',
      difficulty: 'medium',
      definition:
        'A team game of hitting a ball back and forth over a high net with your hands.',
    },
    {
      term: 'dodgeball',
      difficulty: 'medium',
      definition:
        'A gym-class game of throwing soft balls at the other team while they duck.',
    },
    {
      term: 'table tennis',
      difficulty: 'medium',
      definition:
        'A fast indoor game of bouncing a tiny ball over a low net with paddles.',
      aliases: ['ping pong'],
    },
    {
      term: 'badminton',
      difficulty: 'medium',
      definition:
        'A racket game of hitting a feathered shuttlecock high over a net.',
    },
    {
      term: 'archery',
      difficulty: 'medium',
      definition: 'The sport of shooting arrows from a bow at a round target.',
      aliases: ['bow and arrow'],
    },
    {
      term: 'karate',
      difficulty: 'medium',
      definition:
        'A martial art of fast kicks, chops, and blocks, often with a colored belt.',
    },
    {
      term: 'boxing glove',
      difficulty: 'medium',
      definition: 'A big padded mitt worn for punching in a ring.',
    },
    {
      term: 'scuba diving',
      difficulty: 'medium',
      definition: 'Swimming deep underwater with an air tank and a mask.',
      aliases: ['scuba'],
    },
    {
      term: 'rock climbing',
      difficulty: 'medium',
      definition:
        'Scaling a steep wall or cliff using your hands, feet, and ropes.',
    },
    {
      term: 'yoga',
      difficulty: 'medium',
      definition: 'Exercise of stretching into slow, balanced poses on a mat.',
    },
    {
      term: 'treadmill',
      difficulty: 'medium',
      definition:
        'An exercise machine with a moving belt you walk or run on in place.',
    },
    {
      term: 'jumping jack',
      difficulty: 'medium',
      definition:
        'An exercise of hopping while swinging your arms and legs out and in.',
    },
    {
      term: 'cartwheel',
      difficulty: 'medium',
      definition:
        'Rolling sideways over your hands with your legs swinging overhead.',
    },
    {
      term: 'balance beam',
      difficulty: 'medium',
      definition: 'A narrow raised rail that gymnasts walk, leap, and flip on.',
    },
    {
      term: 'hurdle',
      difficulty: 'medium',
      definition: 'A small fence that runners leap over in a track race.',
    },
    {
      term: 'finish line',
      difficulty: 'medium',
      definition:
        'The marked end of a race where runners break a ribbon of tape.',
    },
    {
      term: 'diving board',
      difficulty: 'medium',
      definition:
        'A springy plank above a pool that swimmers bounce off before plunging in.',
    },
    {
      term: 'scoreboard',
      difficulty: 'medium',
      definition: "A big lit-up sign showing each team's points during a game.",
    },
    {
      term: 'dartboard',
      difficulty: 'medium',
      definition:
        'A round, numbered wall target that players throw small feathered pins at.',
      aliases: ['darts'],
    },
    {
      term: 'pool table',
      difficulty: 'medium',
      definition:
        'A felt-topped game surface with six pockets where you sink balls with a cue stick.',
      aliases: ['billiard table'],
    },
    {
      term: 'mini golf',
      difficulty: 'medium',
      definition:
        'A putting game played on small, silly courses with ramps, tunnels, and windmills.',
      aliases: ['miniature golf'],
    },
    {
      term: 'chess',
      difficulty: 'medium',
      definition:
        'A board game where kings, queens, knights, and pawns try to trap the enemy king.',
    },
    {
      term: 'pogo stick',
      difficulty: 'medium',
      definition:
        'A spring-loaded pole with foot pegs that you bounce around on.',
    },
    {
      term: 'monkey bars',
      difficulty: 'medium',
      definition:
        'A playground ladder overhead that kids swing along hand over hand.',
    },
    {
      term: 'arm wrestling',
      difficulty: 'medium',
      definition:
        "Two people locking hands on a table, each trying to force the other's wrist down.",
    },
    {
      term: 'boomerang',
      difficulty: 'medium',
      definition:
        'A curved throwing stick that spins through the air and flies back to you.',
    },
    {
      term: 'air hockey',
      difficulty: 'medium',
      definition:
        'A table game of smacking a gliding puck toward a slot with round paddles.',
    },
    {
      term: 'marbles',
      difficulty: 'medium',
      definition:
        'A game of flicking small glass balls to knock others out of a circle.',
    },

    // Hard
    {
      term: 'tug of war',
      difficulty: 'hard',
      definition: 'Two teams pulling opposite ends of a rope.',
    },
    {
      term: 'hole in one',
      difficulty: 'hard',
      definition: 'Sinking a golf ball in the cup with your very first stroke.',
    },
    {
      term: 'sack race',
      difficulty: 'hard',
      definition:
        'A contest where kids stand in cloth bags and hop toward the finish.',
    },
    {
      term: 'three-legged race',
      difficulty: 'hard',
      definition:
        'A contest where partners tie two of their legs together and run as a team.',
    },
    {
      term: 'relay race',
      difficulty: 'hard',
      definition:
        'A team contest where runners take turns, passing a baton to the next.',
    },
    {
      term: 'musical chairs',
      difficulty: 'hard',
      definition:
        'A party game of circling seats and grabbing one when the song stops.',
    },
    {
      term: 'duck duck goose',
      difficulty: 'hard',
      definition:
        'A circle game where one kid taps heads and the chosen one gives chase.',
    },
    {
      term: 'rock paper scissors',
      difficulty: 'hard',
      definition:
        'A hand game where a fist, a flat palm, or two fingers decides the winner.',
    },
    {
      term: 'thumb war',
      difficulty: 'hard',
      definition:
        "Two players clasp hands and try to pin down the other's short wiggling finger.",
      aliases: ['thumb wrestling'],
    },
    {
      term: 'limbo',
      difficulty: 'hard',
      definition:
        'A party game of bending backward to pass under a bar that keeps getting lower.',
    },
    {
      term: 'water skiing',
      difficulty: 'hard',
      definition:
        'Being towed behind a speedboat while standing on long boards over a lake.',
    },
    {
      term: 'bungee jumping',
      difficulty: 'hard',
      definition:
        'Leaping off a high bridge while tied to a long stretchy cord.',
    },
    {
      term: 'pole vault',
      difficulty: 'hard',
      definition:
        'Planting a long bendy rod to fling yourself over a very high bar.',
    },
    {
      term: 'slam dunk',
      difficulty: 'hard',
      definition: 'Leaping up and jamming a basketball down through the hoop.',
    },
    {
      term: 'home run',
      difficulty: 'hard',
      definition:
        'A hit that sends the baseball out of the park so the batter can circle every base.',
    },
    {
      term: 'touchdown',
      difficulty: 'hard',
      definition:
        'Carrying the football into the end zone to score six points.',
    },
    {
      term: 'hide and seek',
      difficulty: 'hard',
      definition:
        'A game where one player counts while everyone else finds secret spots.',
    },
    {
      term: 'leapfrog',
      difficulty: 'hard',
      definition:
        "A game of vaulting over a crouching friend's back with your legs spread.",
    },
    {
      term: 'snowball fight',
      difficulty: 'hard',
      definition:
        'A playful winter battle of packing and hurling icy white clumps at friends.',
    },
    {
      term: 'jousting',
      difficulty: 'hard',
      definition:
        'Two knights on horses charging at each other with long lances.',
    },
  ],
}
