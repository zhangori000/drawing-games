import type { WordPackData } from '../play/types'

/**
 * Curated `animals` pack. Ids derive from `animals/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const ANIMALS_PACK: WordPackData = {
  id: 'animals',
  words: [
    // Easy
    {
      term: 'cat',
      difficulty: 'easy',
      definition:
        'A small furry pet that purrs, meows, and loves to chase mice.',
    },
    {
      term: 'dog',
      difficulty: 'easy',
      definition:
        'A loyal furry pet that barks, wags its tail, and fetches sticks.',
    },
    {
      term: 'rabbit',
      difficulty: 'easy',
      definition:
        'A small furry animal with long ears and a fluffy tail that hops around.',
      aliases: ['bunny'],
    },
    {
      term: 'octopus',
      difficulty: 'easy',
      definition:
        'A soft sea creature with eight long arms covered in round suckers.',
    },
    {
      term: 'goldfish',
      difficulty: 'easy',
      definition:
        'A small orange pet that swims around in a glass bowl of water.',
    },
    {
      term: 'pig',
      difficulty: 'easy',
      definition:
        'A pink farm animal with a flat snout and a curly tail that oinks.',
    },
    {
      term: 'cow',
      difficulty: 'easy',
      definition:
        'A big spotted farm animal that moos, chews grass, and gives milk.',
    },
    {
      term: 'horse',
      difficulty: 'easy',
      definition:
        'A large animal with hooves, a flowing mane, and a long tail that people ride.',
    },
    {
      term: 'sheep',
      difficulty: 'easy',
      definition: 'A farm animal covered in thick, fluffy wool that says baa.',
    },
    {
      term: 'duck',
      difficulty: 'easy',
      definition:
        'A water bird with a flat orange bill and webbed feet that quacks.',
    },
    {
      term: 'chicken',
      difficulty: 'easy',
      definition: 'A farm bird with a red comb that clucks and lays eggs.',
    },
    {
      term: 'owl',
      difficulty: 'easy',
      definition:
        'A bird with big round eyes that hoots and is awake at night.',
    },
    {
      term: 'penguin',
      difficulty: 'easy',
      definition:
        'A black-and-white bird that waddles on ice and swims but cannot fly.',
    },
    {
      term: 'frog',
      difficulty: 'easy',
      definition:
        'A green pond animal with long back legs that leaps and croaks.',
    },
    {
      term: 'turtle',
      difficulty: 'easy',
      definition:
        'A slow reptile that can hide inside the hard shell on its back.',
    },
    {
      term: 'snake',
      difficulty: 'easy',
      definition: 'A long reptile with no legs that slithers and hisses.',
    },
    {
      term: 'snail',
      difficulty: 'easy',
      definition:
        'A slow, slimy little creature that carries a spiral shell on its back.',
    },
    {
      term: 'bee',
      difficulty: 'easy',
      definition:
        'A fuzzy yellow-and-black flying insect that buzzes, makes honey, and can sting.',
      aliases: ['bumblebee'],
    },
    {
      term: 'butterfly',
      difficulty: 'easy',
      definition:
        'An insect with big, colorful wings that flutters from flower to flower.',
    },
    {
      term: 'ladybug',
      difficulty: 'easy',
      definition: 'A tiny round red beetle with black spots on its back.',
    },
    {
      term: 'spider',
      difficulty: 'easy',
      definition:
        'An eight-legged creature that spins a sticky web to catch bugs.',
    },
    {
      term: 'elephant',
      difficulty: 'easy',
      definition:
        'A huge gray animal with a long trunk, floppy ears, and ivory tusks.',
    },
    {
      term: 'giraffe',
      difficulty: 'easy',
      definition:
        'A very tall spotted animal with a long neck that nibbles leaves from treetops.',
    },
    {
      term: 'zebra',
      difficulty: 'easy',
      definition:
        'A horse-like wild animal covered in black and white stripes.',
    },
    {
      term: 'lion',
      difficulty: 'easy',
      definition: 'A big wild cat with a shaggy mane and a mighty roar.',
    },
    {
      term: 'tiger',
      difficulty: 'easy',
      definition: 'A big orange wild cat with bold black stripes.',
    },
    {
      term: 'monkey',
      difficulty: 'easy',
      definition:
        'A playful animal with a long tail that swings through trees and eats bananas.',
    },
    {
      term: 'shark',
      difficulty: 'easy',
      definition:
        'A big ocean fish with rows of sharp teeth and a fin that sticks out of the water.',
    },
    {
      term: 'whale',
      difficulty: 'easy',
      definition:
        'A gigantic sea animal that breathes air and sprays water from a blowhole.',
    },
    {
      term: 'crab',
      difficulty: 'easy',
      definition:
        'A sea creature with a hard shell and two pinching claws that walks sideways.',
    },
    {
      term: 'starfish',
      difficulty: 'easy',
      definition:
        'A sea animal with five arms that looks like a star lying on the ocean floor.',
      aliases: ['sea star'],
    },
    {
      term: 'bat',
      difficulty: 'easy',
      definition:
        'A furry flying animal that sleeps upside down and comes out at night.',
    },
    {
      term: 'mouse',
      difficulty: 'easy',
      definition:
        'A tiny furry animal with round ears and a long thin tail that squeaks.',
    },
    {
      term: 'panda',
      difficulty: 'easy',
      definition: 'A black-and-white bear that sits and munches on bamboo.',
    },

    // Medium
    {
      term: 'kangaroo',
      difficulty: 'medium',
      definition:
        'An Australian animal that hops on big back legs and carries its baby in a pouch.',
    },
    {
      term: 'dolphin',
      difficulty: 'medium',
      definition:
        'A smart, friendly sea animal with a curved fin that leaps out of the waves.',
    },
    {
      term: 'jellyfish',
      difficulty: 'medium',
      definition:
        'A see-through sea creature with a soft dome and long stinging tentacles.',
    },
    {
      term: 'seahorse',
      difficulty: 'medium',
      definition:
        'A tiny fish with a horse-shaped head and a curly tail that swims upright.',
    },
    {
      term: 'stingray',
      difficulty: 'medium',
      definition:
        'A flat, diamond-shaped fish that glides along the seafloor with a long, thin tail.',
    },
    {
      term: 'pufferfish',
      difficulty: 'medium',
      definition:
        'A spiky fish that blows itself up like a balloon when it is scared.',
      aliases: ['blowfish'],
    },
    {
      term: 'walrus',
      difficulty: 'medium',
      definition:
        'A big, blubbery sea mammal with long white tusks and a bristly mustache.',
    },
    {
      term: 'polar bear',
      difficulty: 'medium',
      definition:
        'A huge white bear that lives on Arctic ice and swims in freezing water.',
    },
    {
      term: 'koala',
      difficulty: 'medium',
      definition:
        'A fuzzy gray Australian animal that hugs eucalyptus trees and sleeps most of the day.',
      aliases: ['koala bear'],
    },
    {
      term: 'camel',
      difficulty: 'medium',
      definition: 'A desert animal with one or two humps on its back.',
    },
    {
      term: 'hippopotamus',
      difficulty: 'medium',
      definition:
        'A huge, round animal that wallows in rivers and can open its mouth super wide.',
      aliases: ['hippo'],
    },
    {
      term: 'rhinoceros',
      difficulty: 'medium',
      definition:
        'A big, thick-skinned gray animal with one or two horns on its nose.',
      aliases: ['rhino'],
    },
    {
      term: 'crocodile',
      difficulty: 'medium',
      definition:
        'A long reptile with a toothy snout that lurks in rivers with only its eyes showing.',
    },
    {
      term: 'fox',
      difficulty: 'medium',
      definition:
        'A wild animal with orange fur, pointy ears, and a big bushy tail.',
    },
    {
      term: 'wolf',
      difficulty: 'medium',
      definition:
        'A wild relative of the dog that lives in packs and howls at the moon.',
    },
    {
      term: 'raccoon',
      difficulty: 'medium',
      definition:
        'A gray animal with a black mask around its eyes and a ringed tail that raids trash cans.',
    },
    {
      term: 'skunk',
      difficulty: 'medium',
      definition:
        'A black animal with a white stripe down its back that sprays a terrible smell.',
    },
    {
      term: 'squirrel',
      difficulty: 'medium',
      definition:
        'A small tree-climbing animal with a bushy tail that gathers acorns.',
    },
    {
      term: 'sloth',
      difficulty: 'medium',
      definition:
        'A very slow animal that hangs upside down from tree branches.',
    },
    {
      term: 'parrot',
      difficulty: 'medium',
      definition:
        'A colorful tropical bird with a hooked beak that can copy human words.',
    },
    {
      term: 'flamingo',
      difficulty: 'medium',
      definition: 'A tall pink bird that often balances on one long leg.',
    },
    {
      term: 'peacock',
      difficulty: 'medium',
      definition:
        'A bird that spreads a giant fan of colorful tail feathers covered in eye spots.',
    },
    {
      term: 'ostrich',
      difficulty: 'medium',
      definition:
        'A giant bird with a long neck and long legs that runs fast but cannot fly.',
    },
    {
      term: 'toucan',
      difficulty: 'medium',
      definition: 'A tropical bird with an enormous, brightly colored beak.',
    },
    {
      term: 'hummingbird',
      difficulty: 'medium',
      definition:
        'A tiny bird that hovers beside flowers by beating its wings super fast.',
    },
    {
      term: 'dragonfly',
      difficulty: 'medium',
      definition:
        'An insect with a long thin body and four clear wings that zips over ponds.',
    },
    {
      term: 'caterpillar',
      difficulty: 'medium',
      definition: 'A fuzzy, crawling baby butterfly that munches on leaves.',
    },
    {
      term: 'grasshopper',
      difficulty: 'medium',
      definition:
        'A green insect with long, bent back legs that jumps through fields.',
    },
    {
      term: 'T-rex',
      difficulty: 'medium',
      definition:
        'A huge meat-eating dinosaur with giant jaws, sharp teeth, and tiny arms.',
      aliases: ['tyrannosaurus', 'tyrannosaurus rex'],
    },
    {
      term: 'triceratops',
      difficulty: 'medium',
      definition:
        'A plant-eating dinosaur with three horns and a big bony frill behind its head.',
    },

    // Hard
    {
      term: 'hermit crab',
      difficulty: 'hard',
      definition:
        'A crab that moves into an empty seashell and carries it around as its home.',
    },
    {
      term: 'praying mantis',
      difficulty: 'hard',
      definition:
        'A long green insect that holds up its spiky front legs folded like hands in prayer.',
      aliases: ['mantis'],
    },
    {
      term: 'chameleon',
      difficulty: 'hard',
      definition:
        'A lizard with a curly tail and swiveling eyes that changes color to blend in.',
    },
    {
      term: 'platypus',
      difficulty: 'hard',
      definition:
        "A furry Australian animal with a duck's bill and a beaver's tail that lays eggs.",
    },
    {
      term: 'anteater',
      difficulty: 'hard',
      definition:
        'An animal with a very long snout and a sticky tongue that slurps up ants.',
    },
    {
      term: 'armadillo',
      difficulty: 'hard',
      definition:
        'A small animal covered in bony armor plates that can roll up into a ball.',
    },
    {
      term: 'narwhal',
      difficulty: 'hard',
      definition:
        'An Arctic whale with one long, spiral tusk sticking out of its head like a horn.',
    },
    {
      term: 'electric eel',
      difficulty: 'hard',
      definition:
        'A long, snakelike fish that can stun its prey with a powerful shock.',
    },
    {
      term: 'pterodactyl',
      difficulty: 'hard',
      definition:
        'A flying reptile from dinosaur times with leathery wings and a long, pointed beak.',
    },
    {
      term: 'stegosaurus',
      difficulty: 'hard',
      definition:
        'A plant-eating dinosaur with tall plates along its back and spikes on its tail.',
    },
    {
      term: 'guinea pig',
      difficulty: 'hard',
      definition:
        'A chubby, tailless pet rodent that squeaks and lives in a cage.',
    },
    {
      term: 'meerkat',
      difficulty: 'hard',
      definition:
        'A small desert animal that stands up tall on its back legs to keep watch.',
    },
    {
      term: 'vulture',
      difficulty: 'hard',
      definition:
        'A large bird with a bald head that circles in the sky looking for a meal.',
    },
    {
      term: 'firefly',
      difficulty: 'hard',
      definition:
        'A beetle whose tail glows with light as it flies on summer nights.',
      aliases: ['lightning bug'],
    },
    {
      term: 'woolly mammoth',
      difficulty: 'hard',
      definition:
        'A giant prehistoric elephant covered in long shaggy fur, with huge curved tusks.',
      aliases: ['mammoth', 'wooly mammoth'],
    },
    {
      term: 'saber-toothed tiger',
      difficulty: 'hard',
      definition: 'A prehistoric big cat with two very long, knife-like fangs.',
      aliases: ['saber-tooth tiger'],
    },
    {
      term: 'otter',
      difficulty: 'hard',
      definition:
        'A playful furry swimmer that floats on its back and cracks shells on its belly.',
      aliases: ['sea otter'],
    },
    {
      term: 'hammerhead shark',
      difficulty: 'hard',
      definition:
        'A shark with a wide, flat head that sticks out on both sides, with an eye at each end.',
      aliases: ['hammerhead'],
    },
    {
      term: 'opossum',
      difficulty: 'hard',
      definition:
        'A gray animal with a pointed face and a bare tail that plays dead when scared.',
      aliases: ['possum'],
    },
    {
      term: 'anglerfish',
      difficulty: 'hard',
      definition:
        'A deep-sea fish with a glowing lure dangling in front of its toothy mouth.',
    },
    {
      term: 'woodpecker',
      difficulty: 'hard',
      definition:
        'A bird that hammers holes into tree trunks with its strong, pointed beak.',
    },
  ],
}
