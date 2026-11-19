import type { WordPackData } from '../play/types'

/**
 * Curated `everyday` pack. Ids derive from `everyday/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const EVERYDAY_PACK: WordPackData = {
  id: 'everyday',
  words: [
    {
      term: 'umbrella',
      difficulty: 'easy',
      definition:
        'A folding cover on a handle that you hold over your head when it rains.',
    },
    {
      term: 'toothbrush',
      difficulty: 'easy',
      definition: 'A small brush on a long handle for scrubbing your teeth.',
    },
    {
      term: 'backpack',
      difficulty: 'easy',
      definition: 'A bag with two shoulder straps that you carry on your back.',
    },
    {
      term: 'chair',
      difficulty: 'easy',
      definition: 'A seat with legs and a backrest, made for one person.',
    },
    {
      term: 'bed',
      difficulty: 'easy',
      definition:
        'Furniture with a mattress, sheets, and pillows where you sleep.',
    },
    {
      term: 'lamp',
      difficulty: 'easy',
      definition:
        'A light on a stand, often with a cloth shade, for a desk or table.',
    },
    {
      term: 'key',
      difficulty: 'easy',
      definition:
        'A small notched metal piece you turn in a lock to open a door.',
    },
    {
      term: 'sock',
      difficulty: 'easy',
      definition:
        'A soft knit covering for your foot that goes on before a shoe.',
    },
    {
      term: 'hat',
      difficulty: 'easy',
      definition:
        'Something you wear on top of your head, sometimes with a brim.',
    },
    {
      term: 't-shirt',
      difficulty: 'easy',
      definition:
        'A short-sleeved top with no collar that pulls on over your head.',
      aliases: ['tee shirt', 'shirt'],
    },
    {
      term: 'dress',
      difficulty: 'easy',
      definition: 'A one-piece outfit made of a top joined to a skirt.',
    },
    {
      term: 'sunglasses',
      difficulty: 'easy',
      definition:
        'Dark-tinted eyewear that shades your eyes from bright light.',
    },
    {
      term: 'pencil',
      difficulty: 'easy',
      definition:
        'A wooden writing stick with gray lead inside and an eraser on top.',
    },
    {
      term: 'book',
      difficulty: 'easy',
      definition:
        'Printed pages bound together inside a cover, full of words or pictures.',
    },
    {
      term: 'ladder',
      difficulty: 'easy',
      definition:
        'Two tall rails joined by rungs that you climb to reach high places.',
    },
    {
      term: 'hammer',
      difficulty: 'easy',
      definition:
        'A tool with a heavy metal head on a handle for pounding nails.',
    },
    {
      term: 'broom',
      difficulty: 'easy',
      definition:
        'A bundle of stiff bristles on a long stick for sweeping floors.',
    },
    {
      term: 'television',
      difficulty: 'easy',
      definition:
        'A screen in your home for watching shows, cartoons, and movies.',
      aliases: ['tv'],
    },
    {
      term: 'cell phone',
      difficulty: 'easy',
      definition:
        'A pocket-sized device for calling, texting, and taking photos.',
      aliases: ['phone', 'smartphone', 'mobile phone'],
    },
    {
      term: 'bathtub',
      difficulty: 'easy',
      definition: 'A long basin you fill with water and sit in to get clean.',
      aliases: ['tub'],
    },
    {
      term: 'toilet paper',
      difficulty: 'easy',
      definition:
        'Soft tissue on a roll that hangs on a holder in the bathroom.',
    },
    {
      term: 'teddy bear',
      difficulty: 'easy',
      definition: 'A soft stuffed toy animal with round ears that kids cuddle.',
    },
    {
      term: 'rubber duck',
      difficulty: 'easy',
      definition: 'A small yellow squeaky bath toy shaped like a bird.',
    },
    {
      term: 'envelope',
      difficulty: 'easy',
      definition:
        'A folded paper sleeve you seal a letter in before mailing it.',
    },
    {
      term: 'trash can',
      difficulty: 'easy',
      definition: 'A bin with a lid where you throw away garbage.',
      aliases: ['garbage can', 'trash bin'],
    },
    {
      term: 'mitten',
      difficulty: 'easy',
      definition:
        'A warm glove with one pocket for your thumb and one for your fingers.',
    },
    {
      term: 'scarf',
      difficulty: 'easy',
      definition: 'A long strip of warm cloth that you wrap around your neck.',
    },
    {
      term: 'flashlight',
      difficulty: 'easy',
      definition: 'A small handheld lamp that shines a beam in the dark.',
    },
    {
      term: 'couch',
      difficulty: 'easy',
      definition: 'A long padded seat for two or more people in a living room.',
      aliases: ['sofa'],
    },
    {
      term: 'camera',
      difficulty: 'easy',
      definition: 'A device you aim at something and click to take a photo.',
    },
    {
      term: 'laptop',
      difficulty: 'easy',
      definition:
        'A folding computer with a screen and keyboard that you can carry.',
    },
    {
      term: 'shovel',
      difficulty: 'easy',
      definition:
        'A tool with a long handle and a wide scoop for digging dirt or snow.',
    },
    {
      term: 'ruler',
      difficulty: 'easy',
      definition:
        'A flat straight strip marked with inches for measuring and drawing lines.',
    },
    {
      term: 'mug',
      difficulty: 'easy',
      definition:
        'A sturdy cup with a handle for hot drinks like cocoa or tea.',
      aliases: ['coffee mug', 'cup'],
    },
    {
      term: 'wristwatch',
      difficulty: 'easy',
      definition: 'A small clock you wear on a strap around your arm.',
      aliases: ['watch'],
    },
    {
      term: 'padlock',
      difficulty: 'easy',
      definition:
        'A small metal box with a curved shackle that snaps shut and opens with a key.',
      aliases: ['lock'],
    },
    {
      term: 'alarm clock',
      difficulty: 'medium',
      definition:
        'A bedside timepiece that rings loudly to wake you up in the morning.',
    },
    {
      term: 'magnifying glass',
      difficulty: 'medium',
      definition:
        'A round lens on a handle that makes tiny things look bigger.',
    },
    {
      term: 'game controller',
      difficulty: 'medium',
      definition:
        'A handheld pad with buttons and joysticks for playing on a console.',
      aliases: ['controller', 'video game controller'],
    },
    {
      term: 'computer mouse',
      difficulty: 'medium',
      definition:
        'A small clicker you slide around a desk to move the arrow on a screen.',
    },
    {
      term: 'calculator',
      difficulty: 'medium',
      definition:
        'A small device with number keys that solves math problems for you.',
    },
    {
      term: 'stapler',
      difficulty: 'medium',
      definition:
        'An office tool you press down to pin papers together with bits of wire.',
    },
    {
      term: 'paper clip',
      difficulty: 'medium',
      definition: 'A bent loop of wire that holds a few sheets together.',
    },
    {
      term: 'chalkboard',
      difficulty: 'medium',
      definition:
        'A dark classroom wall board that teachers write on with dusty white sticks.',
      aliases: ['blackboard'],
    },
    {
      term: 'globe',
      difficulty: 'medium',
      definition: 'A spinning ball on a stand with a map of the whole world.',
    },
    {
      term: 'refrigerator',
      difficulty: 'medium',
      definition: 'A tall, cold kitchen cabinet that keeps food fresh.',
      aliases: ['fridge'],
    },
    {
      term: 'washing machine',
      difficulty: 'medium',
      definition:
        'A home appliance that spins dirty clothes in soapy water to clean them.',
      aliases: ['washer'],
    },
    {
      term: 'vacuum cleaner',
      difficulty: 'medium',
      definition:
        'A machine on wheels that sucks dust and crumbs off the floor.',
      aliases: ['vacuum'],
    },
    {
      term: 'hair dryer',
      difficulty: 'medium',
      definition:
        'A handheld blower that shoots warm air at your head after a shower.',
      aliases: ['blow dryer'],
    },
    {
      term: 'toaster',
      difficulty: 'medium',
      definition:
        'A kitchen appliance that browns slices of bread and pops them up.',
    },
    {
      term: 'coat hanger',
      difficulty: 'medium',
      definition:
        'A hook-topped frame you drape a shirt or jacket on inside a closet.',
      aliases: ['hanger'],
    },
    {
      term: 'high heel',
      difficulty: 'medium',
      definition:
        'A fancy shoe with a tall, thin spike under the back of the foot.',
    },
    {
      term: 'flip-flop',
      difficulty: 'medium',
      definition:
        'A rubber sandal held on by a strap that goes between your toes.',
    },
    {
      term: 'earmuffs',
      difficulty: 'medium',
      definition:
        'Two fuzzy pads on a band that keep your ears warm in winter.',
    },
    {
      term: 'power drill',
      difficulty: 'medium',
      definition:
        'A handheld motor tool that spins a pointed bit to bore holes.',
      aliases: ['drill'],
    },
    {
      term: 'watering can',
      difficulty: 'medium',
      definition: 'A garden container with a long spout for sprinkling plants.',
    },
    {
      term: 'hammock',
      difficulty: 'medium',
      definition: 'A hanging bed of cloth or rope strung between two trees.',
    },
    {
      term: 'piggy bank',
      difficulty: 'medium',
      definition: 'A pig-shaped jar with a slot on top for saving coins.',
    },
    {
      term: 'first aid kit',
      difficulty: 'medium',
      definition: 'A box of bandages and supplies for treating small injuries.',
    },
    {
      term: 'plunger',
      difficulty: 'medium',
      definition: 'A rubber cup on a stick that you pump to unclog a toilet.',
    },
    {
      term: 'fly swatter',
      difficulty: 'medium',
      definition: 'A flat mesh paddle on a handle for smacking pesky bugs.',
    },
    {
      term: 'mousetrap',
      difficulty: 'medium',
      definition:
        'A spring-loaded wooden snapper baited with cheese to catch rodents.',
    },
    {
      term: 'fire extinguisher',
      difficulty: 'medium',
      definition:
        'A red canister with a hose that sprays foam to put out flames.',
    },
    {
      term: 'rolling pin',
      difficulty: 'medium',
      definition: 'A wooden roller with handles for flattening dough.',
    },
    {
      term: 'hourglass',
      difficulty: 'medium',
      definition:
        'Two joined bulbs that let sand trickle down to measure time.',
      aliases: ['sand timer'],
    },
    {
      term: 'necktie',
      difficulty: 'medium',
      definition: 'A long strip of cloth knotted under a shirt collar.',
      aliases: ['tie'],
    },
    {
      term: 'hoodie',
      difficulty: 'medium',
      definition: 'A sweatshirt with a hood you can pull up over your head.',
    },
    {
      term: 'vending machine',
      difficulty: 'medium',
      definition:
        'A tall glass-front box that drops a snack after you put in money.',
    },
    {
      term: 'paper shredder',
      difficulty: 'hard',
      definition: 'An office machine that slices documents into thin strips.',
    },
    {
      term: 'smoke detector',
      difficulty: 'hard',
      definition:
        'A round gadget on the ceiling that beeps loudly if there is a fire.',
      aliases: ['smoke alarm'],
    },
    {
      term: 'junk drawer',
      difficulty: 'hard',
      definition: 'A kitchen pull-out spot stuffed with random odds and ends.',
    },
    {
      term: 'bubble wrap',
      difficulty: 'hard',
      definition:
        'A plastic packing sheet full of little air pockets that are fun to pop.',
    },
    {
      term: 'electrical outlet',
      difficulty: 'hard',
      definition: 'Slots in the wall where you plug in cords to get power.',
      aliases: ['outlet', 'power outlet', 'wall socket'],
    },
    {
      term: 'thumbtack',
      difficulty: 'hard',
      definition:
        'A short pin with a flat round head for sticking notes to a corkboard.',
      aliases: ['push pin', 'tack'],
    },
    {
      term: 'clothesline',
      difficulty: 'hard',
      definition:
        'A rope strung outdoors where wet laundry hangs to dry in the sun.',
    },
    {
      term: 'leaf blower',
      difficulty: 'hard',
      definition:
        'A loud garden machine that pushes fallen leaves with a gust of air.',
    },
    {
      term: 'suspenders',
      difficulty: 'hard',
      definition:
        'Straps worn over the shoulders that hold up a pair of pants.',
    },
    {
      term: 'monocle',
      difficulty: 'hard',
      definition:
        'A single round lens worn over one eye, often with a little chain.',
    },
    {
      term: 'grandfather clock',
      difficulty: 'hard',
      definition:
        'A tall wooden timepiece that stands on the floor and swings a pendulum.',
    },
    {
      term: 'water cooler',
      difficulty: 'hard',
      definition:
        'An office stand with a big upside-down jug that fills paper cups.',
    },
    {
      term: 'window blinds',
      difficulty: 'hard',
      definition: 'Rows of thin slats that tilt to let in or block sunlight.',
      aliases: ['blinds'],
    },
    {
      term: 'shoelace',
      difficulty: 'hard',
      definition:
        'A thin cord that crisscrosses through a sneaker and ties in a bow.',
    },
    {
      term: 'sleep mask',
      difficulty: 'hard',
      definition:
        'A soft cover over your eyes that blocks light while you nap.',
    },
    {
      term: 'selfie stick',
      difficulty: 'hard',
      definition:
        'A long pole that holds a phone out so you can snap a photo of yourself.',
    },
    {
      term: 'homework',
      difficulty: 'hard',
      definition: 'Assignments from a teacher that you finish after school.',
    },
    {
      term: 'tape measure',
      difficulty: 'hard',
      definition: 'A long, bendy ruler that rolls up inside a little case.',
      aliases: ['measuring tape'],
    },
    {
      term: 'doorbell',
      difficulty: 'hard',
      definition:
        'A button by the front entrance that rings inside when someone visits.',
    },
    {
      term: 'extension cord',
      difficulty: 'hard',
      definition:
        'A long power cable that lets you plug things in far from the wall.',
    },
    {
      term: 'dental floss',
      difficulty: 'hard',
      definition:
        'Thin string you slide between your teeth to clean out bits of food.',
      aliases: ['floss'],
    },
    {
      term: 'price tag',
      difficulty: 'hard',
      definition: 'A small label tied to an item that shows how much it costs.',
    },
  ],
}
