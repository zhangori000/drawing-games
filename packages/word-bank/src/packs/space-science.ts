import type { WordPackData } from '../play/types'

/**
 * Curated `space-science` pack. Ids derive from `space-science/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const SPACE_SCIENCE_PACK: WordPackData = {
  id: 'space-science',
  words: [
    // Easy
    {
      term: 'sun',
      difficulty: 'easy',
      definition:
        'The blazing yellow ball in the sky that gives us daylight and warmth.',
    },
    {
      term: 'moon',
      difficulty: 'easy',
      definition:
        'The rocky ball that circles Earth and glows in the night sky.',
    },
    {
      term: 'star',
      difficulty: 'easy',
      definition:
        'A tiny twinkling point of light in the night sky, often drawn with five points.',
    },
    {
      term: 'planet',
      difficulty: 'easy',
      definition:
        'A huge round world, like Saturn or Mars, that circles a star.',
    },
    {
      term: 'earth',
      difficulty: 'easy',
      definition:
        'The blue-and-green planet we live on, the third from the sun.',
      aliases: ['planet earth'],
    },
    {
      term: 'shooting star',
      difficulty: 'easy',
      definition:
        'A streak of light that zips across the night sky when a space rock burns up.',
      aliases: ['falling star'],
    },
    {
      term: 'rocket',
      difficulty: 'easy',
      definition: 'A tall vehicle that blasts off into space.',
    },
    {
      term: 'alien',
      difficulty: 'easy',
      definition:
        'A creature from another planet, often drawn green with big eyes.',
    },
    {
      term: 'flying saucer',
      difficulty: 'easy',
      definition:
        'A spinning disc-shaped spacecraft said to carry visitors from other worlds.',
      aliases: ['ufo'],
    },
    {
      term: 'robot',
      difficulty: 'easy',
      definition:
        'A machine built to move and do jobs on its own, sometimes shaped like a person.',
    },
    {
      term: 'magnet',
      difficulty: 'easy',
      definition: 'A metal object that pulls iron toward it.',
    },
    {
      term: 'light bulb',
      difficulty: 'easy',
      definition: 'A glass globe that glows when electricity runs through it.',
    },
    {
      term: 'battery',
      difficulty: 'easy',
      definition:
        'A small power pack with plus and minus ends that runs toys and remotes.',
    },
    {
      term: 'gear',
      difficulty: 'easy',
      definition:
        'A wheel with teeth around its edge that turns other wheels in a machine.',
      aliases: ['cog'],
    },
    {
      term: 'thermometer',
      difficulty: 'easy',
      definition: 'A tool that measures how hot or cold something is.',
    },
    {
      term: 'test tube',
      difficulty: 'easy',
      definition:
        'A thin, round-bottomed glass vial that scientists fill with liquids.',
    },

    {
      term: 'beaker',
      difficulty: 'easy',
      definition:
        'A glass lab cup with a little spout and measuring lines up the side.',
    },
    // Medium
    {
      term: 'telescope',
      difficulty: 'medium',
      definition: 'A tube with lenses for seeing faraway things.',
    },
    {
      term: 'microscope',
      difficulty: 'medium',
      definition: 'A lab tool with lenses that makes tiny things look huge.',
    },
    {
      term: 'satellite',
      difficulty: 'medium',
      definition:
        'A machine that circles Earth in space, beaming signals back down.',
    },
    {
      term: 'space shuttle',
      difficulty: 'medium',
      definition:
        'A winged craft that blasted off like a rocket and glided home like a plane.',
    },
    {
      term: 'crater',
      difficulty: 'medium',
      definition:
        'A big bowl-shaped dent in the ground made by a crashing space rock.',
    },
    {
      term: 'asteroid',
      difficulty: 'medium',
      definition: 'A huge lumpy space rock that drifts around the sun.',
    },
    {
      term: 'galaxy',
      difficulty: 'medium',
      definition:
        'A gigantic swirl of billions of stars spinning together in space.',
    },
    {
      term: 'constellation',
      difficulty: 'medium',
      definition:
        'A group of stars that forms a picture when you connect the dots.',
    },
    {
      term: 'solar system',
      difficulty: 'medium',
      definition:
        'The sun and all the planets that travel in circles around it.',
    },
    {
      term: 'solar panel',
      difficulty: 'medium',
      definition: 'A flat dark sheet that turns sunlight into electricity.',
    },
    {
      term: 'X-ray',
      difficulty: 'medium',
      definition: 'A see-through picture of the bones inside your body.',
    },
    {
      term: 'germ',
      difficulty: 'medium',
      definition:
        'A tiny living speck that can make you sick, too small to see.',
      aliases: ['microbe', 'bacteria'],
    },
    {
      term: 'DNA',
      difficulty: 'medium',
      definition:
        'The twisted ladder-shaped code inside every cell that makes you who you are.',
      aliases: ['double helix'],
    },
    {
      term: 'atom',
      difficulty: 'medium',
      definition:
        'The tiniest building block of matter, drawn as a dot with circling paths.',
    },
    {
      term: 'stethoscope',
      difficulty: 'medium',
      definition:
        "A doctor's listening tool with earpieces and a round chest piece.",
    },
    {
      term: 'lab coat',
      difficulty: 'medium',
      definition:
        'A long white jacket that scientists wear to keep their clothes clean.',
    },
    {
      term: 'safety goggles',
      difficulty: 'medium',
      definition:
        'Snug plastic eye protectors worn during science experiments.',
    },
    {
      term: 'fossil',
      difficulty: 'medium',
      definition:
        'The stony print or bones of a plant or animal from long ago.',
    },
    {
      term: 'jetpack',
      difficulty: 'medium',
      definition: 'A rocket-powered backpack that lets a person fly.',
    },
    {
      term: 'laser',
      difficulty: 'medium',
      definition: 'A thin, super-bright beam of light that can cut or point.',
    },
    {
      term: 'metal detector',
      difficulty: 'medium',
      definition:
        'A beeping wand you sweep over sand to find buried coins and treasure.',
    },
    {
      term: 'typewriter',
      difficulty: 'medium',
      definition:
        'An old-fashioned machine with keys that stamps letters onto paper.',
    },
    {
      term: 'pulley',
      difficulty: 'medium',
      definition:
        'A wheel with a rope over it that makes lifting heavy loads easier.',
    },
    {
      term: 'computer chip',
      difficulty: 'medium',
      definition:
        'A tiny square packed with circuits that acts as the brain of a gadget.',
      aliases: ['microchip'],
    },

    {
      term: 'comet',
      difficulty: 'medium',
      definition:
        'An icy space rock with a long glowing tail streaking across the sky.',
    },
    {
      term: 'spacesuit',
      difficulty: 'medium',
      definition:
        'The puffy white outfit and helmet an astronaut wears outside the ship.',
    },
    {
      term: 'wind turbine',
      difficulty: 'medium',
      definition:
        'A tall white tower with giant spinning blades that makes electricity.',
    },
    // Hard
    {
      term: 'black hole',
      difficulty: 'hard',
      definition:
        'A place in space with gravity so strong light cannot escape.',
    },
    {
      term: 'solar eclipse',
      difficulty: 'hard',
      definition: 'When the moon blocks the sun during the day.',
      aliases: ['eclipse'],
    },
    {
      term: 'moon landing',
      difficulty: 'hard',
      definition:
        'Astronauts stepping onto the lunar surface and planting a flag.',
    },
    {
      term: 'space station',
      difficulty: 'hard',
      definition:
        'A huge orbiting lab where astronauts live and work for months.',
    },
    {
      term: 'gravity',
      difficulty: 'hard',
      definition:
        'The invisible pull that makes a dropped apple fall to the ground.',
    },
    {
      term: 'time machine',
      difficulty: 'hard',
      definition:
        'An imaginary invention that carries you into the past or future.',
    },
    {
      term: 'periodic table',
      difficulty: 'hard',
      definition:
        'The big school chart of all the chemical elements in colored boxes.',
    },
    {
      term: 'circuit',
      difficulty: 'hard',
      definition:
        'A loop of wire that lets electricity flow from a battery to a bulb.',
    },
    {
      term: 'static electricity',
      difficulty: 'hard',
      definition:
        'The crackly charge that makes hair stand up when rubbed with a balloon.',
    },
    {
      term: 'food chain',
      difficulty: 'hard',
      definition:
        'The order of who eats whom in nature, like grass to rabbit to fox.',
    },
    {
      term: 'science fair',
      difficulty: 'hard',
      definition:
        'A school event where students show off experiments on poster boards.',
    },
    {
      term: 'conveyor belt',
      difficulty: 'hard',
      definition:
        'A moving strip that carries items along in a factory or at checkout.',
    },
    {
      term: 'molecule',
      difficulty: 'hard',
      definition:
        'A tiny cluster of atoms stuck together, often drawn as balls on sticks.',
    },
    {
      term: 'optical illusion',
      difficulty: 'hard',
      definition:
        'A picture that tricks your eyes into seeing something that is not there.',
    },
    {
      term: 'sundial',
      difficulty: 'hard',
      definition: 'An ancient clock that tells time by where a shadow falls.',
    },
    {
      term: 'virtual reality',
      difficulty: 'hard',
      definition:
        'Wearing a headset that makes you feel like you are inside a computer world.',
      aliases: ['vr'],
    },
    {
      term: 'hibernation',
      difficulty: 'hard',
      definition: 'A long winter sleep that bears and other animals take.',
      aliases: ['hibernating'],
    },
    {
      term: 'camouflage',
      difficulty: 'hard',
      definition:
        'Colors or patterns that help something blend into its surroundings.',
    },
    {
      term: 'prism',
      difficulty: 'hard',
      definition:
        'A clear glass triangle that splits sunlight into a rainbow of colors.',
    },
  ],
}
