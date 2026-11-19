import type { WordPackData } from '../play/types'

/**
 * Curated `vehicles` pack. Ids derive from `vehicles/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const VEHICLES_PACK: WordPackData = {
  id: 'vehicles',
  words: [
    // Easy
    {
      term: 'car',
      difficulty: 'easy',
      definition: 'A road vehicle with four wheels and an engine.',
    },
    {
      term: 'bicycle',
      difficulty: 'easy',
      definition: 'A two-wheeled ride you pedal.',
      aliases: ['bike'],
    },
    {
      term: 'bus',
      difficulty: 'easy',
      definition:
        'A long vehicle that carries lots of passengers along a set route.',
    },
    {
      term: 'train',
      difficulty: 'easy',
      definition: 'A line of linked cars that rolls along a railroad track.',
    },
    {
      term: 'airplane',
      difficulty: 'easy',
      definition:
        'A winged flying machine with jet engines that carries passengers.',
      aliases: ['plane'],
    },
    {
      term: 'helicopter',
      difficulty: 'easy',
      definition: 'An aircraft with spinning blades on top.',
    },
    {
      term: 'sailboat',
      difficulty: 'easy',
      definition:
        'A small vessel moved by wind filling a tall triangle of cloth.',
    },
    {
      term: 'submarine',
      difficulty: 'easy',
      definition: 'A ship that travels underwater.',
    },
    {
      term: 'motorcycle',
      difficulty: 'easy',
      definition: 'A two-wheeled road vehicle with an engine and handlebars.',
      aliases: ['motorbike'],
    },
    {
      term: 'scooter',
      difficulty: 'easy',
      definition:
        'A narrow board with handlebars and small wheels that you push with one foot.',
    },
    {
      term: 'tractor',
      difficulty: 'easy',
      definition:
        'A sturdy farm vehicle with huge back wheels for pulling plows.',
    },
    {
      term: 'taxi',
      difficulty: 'easy',
      definition: 'A car, often yellow, that you pay to drive you somewhere.',
      aliases: ['taxicab', 'cab'],
    },
    {
      term: 'police car',
      difficulty: 'easy',
      definition:
        'A patrol vehicle with flashing red and blue lights on its roof.',
      aliases: ['cop car', 'squad car'],
    },
    {
      term: 'ambulance',
      difficulty: 'easy',
      definition:
        'An emergency vehicle that rushes sick or hurt people to the hospital.',
    },
    {
      term: 'fire truck',
      difficulty: 'easy',
      definition: 'A big red emergency vehicle with ladders and hoses.',
      aliases: ['fire engine'],
    },
    {
      term: 'tricycle',
      difficulty: 'easy',
      definition: 'A three-wheeled ride with pedals, made for small kids.',
      aliases: ['trike'],
    },
    {
      term: 'sled',
      difficulty: 'easy',
      definition:
        'A flat board or seat with runners for sliding down snowy hills.',
    },
    {
      term: 'wagon',
      difficulty: 'easy',
      definition:
        'A small four-wheeled cart with a long handle that kids pull.',
    },
    {
      term: 'raft',
      difficulty: 'easy',
      definition:
        'A flat floating platform, often logs tied together, used to cross water.',
    },
    {
      term: 'anchor',
      difficulty: 'easy',
      definition:
        'A heavy hooked weight dropped on a chain to keep a ship in place.',
    },
    {
      term: 'suitcase',
      difficulty: 'easy',
      definition:
        'A box-shaped travel bag with a handle, often on wheels, for packing clothes.',
      aliases: ['luggage'],
    },
    {
      term: 'traffic light',
      difficulty: 'easy',
      definition:
        'A post with red, yellow, and green signals that tell cars when to go.',
      aliases: ['stoplight', 'traffic signal'],
    },
    {
      term: 'stop sign',
      difficulty: 'easy',
      definition: 'A red eight-sided road marker telling drivers to halt.',
    },
    {
      term: 'traffic cone',
      difficulty: 'easy',
      definition:
        'An orange pointed plastic marker set on roads to guide cars around work.',
    },
    {
      term: 'bridge',
      difficulty: 'easy',
      definition:
        'A structure that carries a road or path over a river or gap.',
    },
    {
      term: 'map',
      difficulty: 'easy',
      definition:
        'A flat drawing of an area showing roads, places, and directions.',
    },
    {
      term: 'tire',
      difficulty: 'easy',
      definition: "The thick rubber ring around a car's wheel.",
    },
    {
      term: 'race car',
      difficulty: 'easy',
      definition:
        'A low, speedy vehicle with a number on its side, built to win on a track.',
    },
    {
      term: 'parachute',
      difficulty: 'easy',
      definition:
        'A big fabric canopy on strings that lets a skydiver float down safely.',
    },

    // Medium
    {
      term: 'hot air balloon',
      difficulty: 'medium',
      definition:
        "A giant fabric envelope lifted by a burner's heat, carrying people in a basket.",
    },
    {
      term: 'canoe',
      difficulty: 'medium',
      definition: 'A narrow, open boat you paddle with a single-bladed oar.',
    },
    {
      term: 'cruise ship',
      difficulty: 'medium',
      definition:
        'A huge passenger vessel like a floating hotel for vacations at sea.',
    },
    {
      term: 'tugboat',
      difficulty: 'medium',
      definition:
        'A small, powerful vessel that pushes or pulls big ships into harbor.',
    },
    {
      term: 'pirate ship',
      difficulty: 'medium',
      definition: 'A wooden sailing vessel flying a skull-and-crossbones flag.',
    },
    {
      term: 'houseboat',
      difficulty: 'medium',
      definition:
        'A floating home with walls and a roof, tied up on a lake or river.',
    },
    {
      term: 'limousine',
      difficulty: 'medium',
      definition:
        'A very long, fancy car with a hired driver for special occasions.',
      aliases: ['limo'],
    },
    {
      term: 'dump truck',
      difficulty: 'medium',
      definition:
        'A big construction vehicle whose back tilts up to pour out dirt or rocks.',
    },
    {
      term: 'monster truck',
      difficulty: 'medium',
      definition:
        'A pickup on gigantic wheels that rolls over cars at stunt shows.',
    },
    {
      term: 'cement mixer',
      difficulty: 'medium',
      definition: 'A truck with a big spinning drum that churns wet concrete.',
      aliases: ['cement truck', 'concrete mixer'],
    },
    {
      term: 'bulldozer',
      difficulty: 'medium',
      definition: 'A heavy machine with a wide front blade for pushing dirt.',
    },
    {
      term: 'forklift',
      difficulty: 'medium',
      definition:
        'A small vehicle with two flat prongs in front for lifting heavy crates.',
    },
    {
      term: 'snowplow',
      difficulty: 'medium',
      definition:
        'A vehicle with a big angled front blade that clears winter roads.',
    },
    {
      term: 'unicycle',
      difficulty: 'medium',
      definition:
        'A one-wheeled ride with pedals, often used by circus performers.',
    },
    {
      term: 'golf cart',
      difficulty: 'medium',
      definition:
        'A small open buggy with a roof for riding between holes on a course.',
    },
    {
      term: 'go-kart',
      difficulty: 'medium',
      definition:
        'A tiny open racing buggy that sits just inches off the ground.',
      aliases: ['go-cart'],
    },
    {
      term: 'camper',
      difficulty: 'medium',
      definition:
        'A vehicle with beds and a little kitchen for living in while traveling.',
      aliases: ['rv', 'motor home'],
    },
    {
      term: 'shopping cart',
      difficulty: 'medium',
      definition:
        'A wire basket on wheels that you push through a grocery store.',
      aliases: ['grocery cart'],
    },
    {
      term: 'roller coaster',
      difficulty: 'medium',
      definition:
        'An amusement park ride whose cars race along twisting, looping tracks.',
    },
    {
      term: 'bumper car',
      difficulty: 'medium',
      definition:
        'A little electric ride at a fair that you steer into other riders for fun.',
    },
    {
      term: 'blimp',
      difficulty: 'medium',
      definition:
        'A huge, slow, gas-filled aircraft shaped like a giant floating capsule.',
      aliases: ['airship'],
    },
    {
      term: 'drone',
      difficulty: 'medium',
      definition:
        'A small flying machine with spinning propellers, flown by remote control.',
    },
    {
      term: 'ski lift',
      difficulty: 'medium',
      definition:
        'A row of chairs hanging from a moving cable that carries people up a snowy mountain.',
      aliases: ['chairlift'],
    },
    {
      term: 'steering wheel',
      difficulty: 'medium',
      definition:
        'The round handle a driver turns to point a car left or right.',
    },
    {
      term: 'license plate',
      difficulty: 'medium',
      definition:
        "The metal tag on a car's front and back that shows its registration letters and numbers.",
    },
    {
      term: 'parking meter',
      difficulty: 'medium',
      definition:
        'A coin-taking post where drivers pay to leave their car at the curb.',
    },
    {
      term: 'fire hydrant',
      difficulty: 'medium',
      definition:
        'A short red street pipe that firefighters hook their hoses to.',
      aliases: ['hydrant'],
    },
    {
      term: 'tunnel',
      difficulty: 'medium',
      definition:
        'A long underground passage dug through a mountain or under a river.',
    },
    {
      term: 'crosswalk',
      difficulty: 'medium',
      definition:
        'Painted white stripes on a street that mark a safe place for pedestrians.',
    },
    {
      term: 'compass',
      difficulty: 'medium',
      definition:
        'A navigation tool with a magnetic needle that always points north.',
    },
    {
      term: 'flying car',
      difficulty: 'medium',
      definition:
        'A futuristic automobile with wings or jets that lifts off the road and soars.',
    },

    // Hard
    {
      term: 'traffic jam',
      difficulty: 'hard',
      definition: 'A long line of cars stuck and barely moving.',
    },
    {
      term: 'road trip',
      difficulty: 'hard',
      definition: 'A long vacation spent driving from place to place in a car.',
    },
    {
      term: 'flat tire',
      difficulty: 'hard',
      definition:
        "A wheel's rubber ring that has leaked its air and sagged against the road.",
    },
    {
      term: 'speed bump',
      difficulty: 'hard',
      definition: 'A raised strip across a road that makes drivers slow down.',
    },
    {
      term: 'roundabout',
      difficulty: 'hard',
      definition:
        'A circular intersection where cars drive around a center island.',
      aliases: ['traffic circle'],
    },
    {
      term: 'toll booth',
      difficulty: 'hard',
      definition:
        'A little roadside hut where drivers stop to pay to use a highway.',
    },
    {
      term: 'pothole',
      difficulty: 'hard',
      definition:
        "A deep pit worn into a road's surface that jolts passing cars.",
    },
    {
      term: 'railroad crossing',
      difficulty: 'hard',
      definition:
        'A spot where a road meets train tracks, marked by an X sign and gates.',
      aliases: ['railway crossing', 'train crossing'],
    },
    {
      term: 'car wash',
      difficulty: 'hard',
      definition:
        'A place where giant brushes and soapy sprays scrub vehicles clean.',
    },
    {
      term: 'shipwreck',
      difficulty: 'hard',
      definition: 'The broken remains of a vessel that sank or ran aground.',
    },
    {
      term: 'windshield wiper',
      difficulty: 'hard',
      definition: "A rubber blade that sweeps rain off a car's front window.",
    },
    {
      term: 'tandem bicycle',
      difficulty: 'hard',
      definition:
        'A bike built for two riders who sit one behind the other and pedal.',
      aliases: ['tandem bike'],
    },
    {
      term: 'hang glider',
      difficulty: 'hard',
      definition:
        'A huge kite-shaped wing that a person dangles from to soar off hilltops.',
    },
    {
      term: 'life jacket',
      difficulty: 'hard',
      definition:
        'A puffy vest that keeps you floating if you fall into water.',
      aliases: ['life vest'],
    },
    {
      term: 'travel pillow',
      difficulty: 'hard',
      definition:
        'A U-shaped cushion worn around the neck for napping on trips.',
      aliases: ['neck pillow'],
    },
    {
      term: 'passport',
      difficulty: 'hard',
      definition:
        'A small booklet with your photo that lets you visit other countries.',
    },
    {
      term: 'seat belt',
      difficulty: 'hard',
      definition:
        'A strap that buckles across you to keep you safe in a moving car.',
    },
    {
      term: 'parallel parking',
      difficulty: 'hard',
      definition:
        'Squeezing a car into a tight space between two others along a curb.',
    },
    {
      term: 'rearview mirror',
      difficulty: 'hard',
      definition:
        'The small reflective glass near the top of a windshield for seeing what is behind.',
    },
    {
      term: 'jumper cables',
      difficulty: 'hard',
      definition:
        "A pair of clamped wires used to restart one car's dead battery from another's.",
    },
    {
      term: 'u-turn',
      difficulty: 'hard',
      definition:
        'Turning a vehicle completely around to head back the way you came.',
    },
  ],
}
