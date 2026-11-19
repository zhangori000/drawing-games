import type { WordPackData } from '../play/types'

/**
 * Curated `fantasy` pack. Ids derive from `fantasy/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const FANTASY_PACK: WordPackData = {
  id: 'fantasy',
  words: [
    // Easy
    {
      term: 'dragon',
      difficulty: 'easy',
      definition: 'A giant scaly beast with wings that breathes fire.',
    },
    {
      term: 'wizard',
      difficulty: 'easy',
      definition:
        'An old magic user with a long beard, a pointy hat, and a staff or wand.',
    },
    {
      term: 'unicorn',
      difficulty: 'easy',
      definition: 'A white horse with a single spiral horn on its forehead.',
    },
    {
      term: 'mermaid',
      difficulty: 'easy',
      definition: 'A sea creature that is half person and half fish.',
    },
    {
      term: 'fairy',
      difficulty: 'easy',
      definition: 'A tiny magical person with sparkly wings and a wand.',
    },
    {
      term: 'ghost',
      difficulty: 'easy',
      definition:
        'A floating, see-through spirit, often drawn as a white sheet with eyes.',
    },
    {
      term: 'witch',
      difficulty: 'easy',
      definition:
        'A spell-casting woman in a pointy black hat who flies on a broomstick.',
    },
    {
      term: 'king',
      difficulty: 'easy',
      definition:
        'A royal ruler who wears a crown, holds a scepter, and sits on a throne.',
    },
    {
      term: 'queen',
      difficulty: 'easy',
      definition: 'A royal lady who wears a crown and rules over a kingdom.',
    },
    {
      term: 'princess',
      difficulty: 'easy',
      definition:
        'A young royal daughter in a tiara and gown who lives in a castle.',
    },
    {
      term: 'crown',
      difficulty: 'easy',
      definition:
        'A golden ring with points and jewels worn on the head by royalty.',
    },
    {
      term: 'magic wand',
      difficulty: 'easy',
      definition:
        'A small stick waved to cast spells, often with a star or sparkles at the tip.',
      aliases: ['wand'],
    },
    {
      term: 'vampire',
      difficulty: 'easy',
      definition:
        'A pale creature in a black cape with pointy fangs who can turn into a bat.',
    },
    {
      term: 'mummy',
      difficulty: 'easy',
      definition:
        'A spooky figure wrapped from head to toe in old cloth bandages that shuffles out of a tomb.',
    },
    {
      term: 'pirate',
      difficulty: 'easy',
      definition:
        'A sea robber with an eye patch, a hook, and a parrot who hunts for buried gold.',
    },
    {
      term: 'monster',
      difficulty: 'easy',
      definition:
        'A big scary creature with sharp teeth, claws, and wild fur or scales.',
    },
    {
      term: 'treasure map',
      difficulty: 'easy',
      definition:
        'An old paper chart with a dotted path and an X marking where gold is buried.',
    },
    {
      term: 'wizard hat',
      difficulty: 'easy',
      definition: 'A tall, pointy cone-shaped cap covered in stars and moons.',
    },
    {
      term: 'treasure chest',
      difficulty: 'easy',
      definition:
        'A wooden box with a curved lid overflowing with gold coins and jewels.',
    },
    {
      term: 'genie',
      difficulty: 'easy',
      definition: 'A magical being that pops out of a lamp and grants wishes.',
    },
    {
      term: 'zombie',
      difficulty: 'easy',
      definition:
        'An undead creature that shuffles along with its arms stretched out and its clothes torn.',
    },
    {
      term: 'knight',
      difficulty: 'easy',
      definition:
        'A warrior in shining metal armor who rides a horse and carries a sword and shield.',
    },
    {
      term: 'werewolf',
      difficulty: 'easy',
      definition:
        'A person who turns into a howling, hairy wolf when the full moon rises.',
    },
    {
      term: 'pot of gold',
      difficulty: 'easy',
      definition:
        'A black kettle full of shiny coins said to wait at the end of a rainbow.',
    },
    {
      term: 'elf',
      difficulty: 'easy',
      definition:
        'A small magical being with pointy ears, often shown in a green outfit and curly-toed shoes.',
    },

    // Medium
    {
      term: 'giant',
      difficulty: 'medium',
      definition:
        'An enormous person, as tall as a house, who stomps around in fairy tales.',
    },
    {
      term: 'troll',
      difficulty: 'medium',
      definition:
        'A big, grumpy creature from folk tales that lives under a bridge.',
    },
    {
      term: 'ogre',
      difficulty: 'medium',
      definition:
        'A huge, smelly, green-skinned brute from fairy tales who carries a club.',
    },
    {
      term: 'goblin',
      difficulty: 'medium',
      definition:
        'A small, sneaky green creature with pointy ears and a wicked grin.',
    },
    {
      term: 'gnome',
      difficulty: 'medium',
      definition: 'A tiny bearded man in a pointy red hat who guards gardens.',
    },
    {
      term: 'leprechaun',
      difficulty: 'medium',
      definition:
        'A tiny bearded man in a green suit and hat who hides a pot of gold.',
    },
    {
      term: 'tooth fairy',
      difficulty: 'medium',
      definition:
        'A tiny winged helper who swaps a lost tooth under your pillow for a coin.',
    },
    {
      term: 'cyclops',
      difficulty: 'medium',
      definition:
        'A huge giant with one big eye in the middle of its forehead.',
    },
    {
      term: 'bigfoot',
      difficulty: 'medium',
      definition:
        'A huge, hairy, ape-like creature said to roam the woods and leave giant footprints.',
      aliases: ['sasquatch'],
    },
    {
      term: 'yeti',
      difficulty: 'medium',
      definition:
        'A shaggy white ape-like beast said to live high in snowy mountains.',
      aliases: ['abominable snowman'],
    },
    {
      term: 'sea monster',
      difficulty: 'medium',
      definition:
        'A giant creature with tentacles or a snaky neck that rises out of the ocean.',
    },
    {
      term: 'throne',
      difficulty: 'medium',
      definition: 'A big, fancy chair where a king or queen sits.',
    },
    {
      term: 'crystal ball',
      difficulty: 'medium',
      definition:
        'A clear glass globe that a fortune teller gazes into to see the future.',
    },
    {
      term: 'spell book',
      difficulty: 'medium',
      definition: 'A thick, old volume full of magic recipes and incantations.',
    },
    {
      term: 'potion',
      difficulty: 'medium',
      definition: 'A bubbling magic drink in a little glass bottle.',
    },
    {
      term: 'cauldron',
      difficulty: 'medium',
      definition:
        'A big black pot on legs where witches brew bubbling potions.',
    },
    {
      term: 'magic carpet',
      difficulty: 'medium',
      definition:
        'A flying rug from old stories that carries riders through the sky.',
      aliases: ['flying carpet'],
    },
    {
      term: 'beanstalk',
      difficulty: 'medium',
      definition:
        'A giant vine from a fairy tale that grows from a magic seed up into the clouds.',
    },
    {
      term: 'flying broomstick',
      difficulty: 'medium',
      definition:
        'A broom that soars through the night sky with a rider on it.',
      aliases: ['flying broom', "witch's broom"],
    },
    {
      term: 'winged horse',
      difficulty: 'medium',
      definition:
        'A magical white horse with feathered wings that can fly through the sky.',
      aliases: ['pegasus', 'flying horse'],
    },
    {
      term: 'golden egg',
      difficulty: 'medium',
      definition:
        'A shiny egg made of solid gold, laid by a magical goose in a fairy tale.',
    },
    {
      term: 'magic beans',
      difficulty: 'medium',
      definition:
        'A handful of special seeds that grow into an enormous vine overnight.',
    },
    {
      term: 'centaur',
      difficulty: 'medium',
      definition:
        'A creature from myths with the body of a horse and the chest and head of a person.',
    },
    {
      term: 'sphinx',
      difficulty: 'medium',
      definition:
        "A creature with a lion's body and a human head that guards the pyramids.",
    },
    {
      term: 'three-headed dog',
      difficulty: 'medium',
      definition:
        'A giant guard dog from myths with three snarling heads on one body.',
      aliases: ['cerberus'],
    },
    {
      term: 'dragon egg',
      difficulty: 'medium',
      definition:
        'A big scaly egg that cracks open to hatch a baby fire-breathing beast.',
    },
    {
      term: 'magic mirror',
      difficulty: 'medium',
      definition:
        'A talking looking glass on the wall that answers questions about who is fairest.',
    },
    {
      term: 'poison apple',
      difficulty: 'medium',
      definition:
        'A shiny red fruit cursed by a witch so whoever bites it falls into a deep sleep.',
      aliases: ['poisoned apple'],
    },
    {
      term: 'frog prince',
      difficulty: 'medium',
      definition:
        'A royal who was turned into a frog and changes back after a kiss.',
    },
    {
      term: 'fortune teller',
      difficulty: 'medium',
      definition:
        'A mystic who looks into a crystal ball or reads palms to predict the future.',
    },
    {
      term: 'talking tree',
      difficulty: 'medium',
      definition:
        'A wise old oak with a face in its bark that speaks to travelers.',
    },

    // Hard
    {
      term: 'griffin',
      difficulty: 'hard',
      definition:
        'A mythical beast with the head and wings of an eagle and the body of a lion.',
    },
    {
      term: 'minotaur',
      difficulty: 'hard',
      definition:
        "A monster from myths with a bull's head on a man's body that lives in a maze.",
    },
    {
      term: 'gargoyle',
      difficulty: 'hard',
      definition:
        'A grumpy winged stone creature carved on the edge of an old stone building.',
    },
    {
      term: 'boogeyman',
      difficulty: 'hard',
      definition:
        'A made-up creature said to hide under the bed or in the closet to scare children.',
      aliases: ['bogeyman'],
    },
    {
      term: 'big bad wolf',
      difficulty: 'hard',
      definition:
        'The sneaky villain of fairy tales who huffs and puffs to blow a house down.',
    },
    {
      term: 'prince charming',
      difficulty: 'hard',
      definition:
        'The handsome royal hero of fairy tales who rides in on a white horse to save the day.',
    },
    {
      term: 'fairy godmother',
      difficulty: 'hard',
      definition:
        'A kind magical helper who waves her wand to turn a pumpkin into a coach.',
    },
    {
      term: 'scepter',
      difficulty: 'hard',
      definition:
        'A fancy jeweled rod that a king or queen holds as a sign of power.',
    },
    {
      term: 'fountain of youth',
      difficulty: 'hard',
      definition:
        'A legendary spring whose water makes anyone who drinks it young again.',
    },
    {
      term: 'fairy dust',
      difficulty: 'hard',
      definition: 'Sparkly magic powder sprinkled on someone so they can fly.',
    },
    {
      term: 'enchanted forest',
      difficulty: 'hard',
      definition:
        'A magical woodland full of glowing mushrooms, talking animals, and hidden fairies.',
    },
    {
      term: 'magic portal',
      difficulty: 'hard',
      definition:
        'A swirling, glowing doorway that whisks you away to another world.',
    },
    {
      term: 'floating island',
      difficulty: 'hard',
      definition:
        'A chunk of land drifting high in the sky, with waterfalls spilling off its edges.',
    },
    {
      term: 'ghost story',
      difficulty: 'hard',
      definition:
        'A spooky tale told around a campfire with a flashlight under your chin.',
    },
    {
      term: 'glass slipper',
      difficulty: 'hard',
      definition:
        'A see-through, sparkly high-heeled shoe left behind on a palace staircase at midnight.',
    },
    {
      term: 'swamp monster',
      difficulty: 'hard',
      definition:
        'A slimy green creature covered in weeds that rises out of murky water.',
    },
    {
      term: 'crop circle',
      difficulty: 'hard',
      definition:
        'A giant mysterious pattern pressed into a wheat field overnight, said to be left by aliens.',
    },
  ],
}
