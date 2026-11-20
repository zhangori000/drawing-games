import type { WordPackData } from '../play/types'

/**
 * Curated `body-health` pack. Ids derive from `body-health/<slug(term)>`;
 * never rename a term in place — deactivate it and add a new entry instead.
 * Body words that used to live in `space-science` keep resolving through
 * `LEGACY_WORD_IDS` (play/pool.ts).
 */
export const BODY_HEALTH_PACK: WordPackData = {
  id: 'body-health',
  words: [
    // Easy
    {
      term: 'brain',
      difficulty: 'easy',
      definition:
        'The wrinkly organ inside your skull that does your thinking.',
    },
    {
      term: 'skeleton',
      difficulty: 'easy',
      definition: 'The full frame of bones that holds up a body.',
    },
    {
      term: 'muscle',
      difficulty: 'easy',
      definition:
        'Body tissue that tightens to move you, like a bulging flexed arm.',
      aliases: ['bicep'],
    },
    {
      term: 'eye',
      difficulty: 'easy',
      definition:
        'The round body part you see through, with a colored iris and a dark pupil.',
      aliases: ['eyeball'],
    },
    {
      term: 'ear',
      difficulty: 'easy',
      definition: 'The body part on each side of your head that you hear with.',
    },
    {
      term: 'nose',
      difficulty: 'easy',
      definition:
        'The body part in the middle of your face that you smell and breathe with.',
    },
    {
      term: 'tooth',
      difficulty: 'easy',
      definition:
        'One of the hard white points in your mouth that you chew with.',
    },
    {
      term: 'tongue',
      difficulty: 'easy',
      definition: 'The soft pink muscle in your mouth that tastes food.',
    },
    {
      term: 'bone',
      difficulty: 'easy',
      definition:
        'A hard white piece of a skeleton, the kind a dog loves to chew.',
    },
    {
      term: 'hand',
      difficulty: 'easy',
      definition:
        'The body part at the end of your arm with four fingers and a thumb.',
    },
    {
      term: 'foot',
      difficulty: 'easy',
      definition:
        'The body part at the end of your leg that you stand and walk on.',
    },
    {
      term: 'mouth',
      difficulty: 'easy',
      definition:
        'The opening in your face that you talk, eat, and smile with.',
    },
    {
      term: 'lips',
      difficulty: 'easy',
      definition:
        'The soft pink edges around your mouth that you pucker for a kiss.',
    },
    {
      term: 'finger',
      difficulty: 'easy',
      definition: 'One of the five long bendy parts at the end of your hand.',
    },
    {
      term: 'knee',
      difficulty: 'easy',
      definition: 'The bendy joint halfway down your leg that you kneel on.',
    },
    {
      term: 'beard',
      difficulty: 'easy',
      definition:
        "Hair that grows on a man's chin and cheeks, sometimes long and bushy.",
    },
    {
      term: 'heart',
      difficulty: 'easy',
      definition:
        'The organ in your chest that pumps blood, often drawn as a love symbol.',
    },
    {
      term: 'skull',
      difficulty: 'easy',
      definition:
        'The hard bony dome inside your head that protects your brain.',
    },
    {
      term: 'leg',
      difficulty: 'easy',
      definition:
        'The long body part from your hip down to your foot that you walk on.',
    },
    {
      term: 'arm',
      difficulty: 'easy',
      definition: 'The long body part from your shoulder down to your hand.',
    },
    // Medium
    {
      term: 'lungs',
      difficulty: 'medium',
      definition:
        'The two spongy organs in your chest that fill with air when you breathe.',
    },
    {
      term: 'fingerprint',
      difficulty: 'medium',
      definition:
        'The unique swirly pattern of ridges on each fingertip, used to catch crooks.',
    },
    {
      term: 'belly button',
      difficulty: 'medium',
      definition: 'The little dent or knot in the middle of your tummy.',
      aliases: ['navel'],
    },
    {
      term: 'sunburn',
      difficulty: 'medium',
      definition:
        'Red, sore skin from staying out in strong sunshine too long.',
    },
    {
      term: 'freckles',
      difficulty: 'medium',
      definition:
        "Small brown dots sprinkled across someone's nose and cheeks.",
    },
    {
      term: 'eyebrow',
      difficulty: 'medium',
      definition:
        'The strip of hair above each eye that you raise when surprised.',
    },
    {
      term: 'eyelash',
      difficulty: 'medium',
      definition: 'One of the tiny curved hairs along the edge of your eyelid.',
    },
    {
      term: 'chin',
      difficulty: 'medium',
      definition: 'The bottom point of your face, just below your mouth.',
    },
    {
      term: 'cheek',
      difficulty: 'medium',
      definition:
        'The soft round side of your face below each eye, often rosy.',
    },
    {
      term: 'shoulder',
      difficulty: 'medium',
      definition:
        'The rounded joint where your arm meets the top of your body.',
    },
    {
      term: 'ankle',
      difficulty: 'medium',
      definition: 'The bony joint that connects your foot to your leg.',
    },
    {
      term: 'fist',
      difficulty: 'medium',
      definition: 'A hand squeezed shut with all the fingers curled in tight.',
    },
    {
      term: 'stomach',
      difficulty: 'medium',
      definition:
        'The stretchy bag inside your belly where swallowed food goes.',
    },
    {
      term: 'footprint',
      difficulty: 'medium',
      definition: 'The shape a foot leaves pressed into sand, mud, or snow.',
    },
    {
      term: 'bandage',
      difficulty: 'medium',
      definition:
        'A strip of cloth or sticky tape wrapped over a cut to keep it clean.',
    },
    {
      term: 'wheelchair',
      difficulty: 'medium',
      definition: "A chair with two big wheels for someone who can't walk.",
    },
    {
      term: 'crutches',
      difficulty: 'medium',
      definition:
        'Two tall props tucked under your arms to help you walk on a hurt leg.',
    },
    {
      term: 'bruise',
      difficulty: 'medium',
      definition: 'A purple-blue mark that shows up on skin after a hard bump.',
    },
    {
      term: 'blister',
      difficulty: 'medium',
      definition:
        'A little bubble of fluid on your skin, often from rubbing new shoes.',
    },
    {
      term: 'splinter',
      difficulty: 'medium',
      definition: 'A tiny sliver of wood stuck under your skin.',
    },
    {
      term: 'headache',
      difficulty: 'medium',
      definition:
        'A pounding pain in your head that makes you want to lie down.',
    },
    {
      term: 'braces',
      difficulty: 'medium',
      definition:
        'Metal wires and brackets glued onto teeth to straighten them.',
    },
    {
      term: 'burp',
      difficulty: 'medium',
      definition: 'A loud gulp of air that pops out after a fizzy drink.',
    },
    {
      term: 'toothache',
      difficulty: 'medium',
      definition:
        'A throbbing pain in one of your teeth: time to see the dentist.',
    },
    {
      term: 'knuckles',
      difficulty: 'medium',
      definition:
        'The bumpy joints on top of your hand that stick out when you make a fist.',
    },
    // Hard
    {
      term: 'brain freeze',
      difficulty: 'hard',
      definition: 'A sudden headache from eating something icy too fast.',
    },
    {
      term: 'goosebumps',
      difficulty: 'hard',
      definition:
        'Tiny raised dots that pop up on your skin when you feel cold or scared.',
    },
    {
      term: 'heartbeat',
      difficulty: 'hard',
      definition:
        'The steady thump of the organ pumping blood through your chest.',
    },
    {
      term: 'hiccups',
      difficulty: 'hard',
      definition: "Sudden jumpy little gulps you can't stop: hic, hic, hic.",
    },
    {
      term: 'fever',
      difficulty: 'hard',
      definition:
        "A high body temperature when you're sick, checked with a thermometer.",
    },
    {
      term: 'nosebleed',
      difficulty: 'hard',
      definition:
        'Blood dripping from your nostrils, often after a bump or very dry air.',
    },
    {
      term: 'hearing aid',
      difficulty: 'hard',
      definition:
        'A tiny device tucked behind the ear that makes sounds louder.',
    },
    {
      term: 'chickenpox',
      difficulty: 'hard',
      definition: 'An itchy childhood illness that covers you in red spots.',
    },
    {
      term: 'rib cage',
      difficulty: 'hard',
      definition:
        'The curved bones in your chest that guard your heart and lungs.',
    },
    {
      term: 'spine',
      difficulty: 'hard',
      definition:
        'The long column of bones running down the middle of your back.',
    },
    {
      term: 'sore throat',
      difficulty: 'hard',
      definition:
        'A scratchy pain when you swallow, often the start of a cold.',
    },
    {
      term: 'stretcher',
      difficulty: 'hard',
      definition: 'A flat bed with handles, used to carry a hurt person.',
    },
    {
      term: 'tummy ache',
      difficulty: 'hard',
      definition: 'A sore belly from eating too much or feeling unwell.',
      aliases: ['stomachache'],
    },
    {
      term: 'sneeze',
      difficulty: 'hard',
      definition: 'A sudden loud achoo that bursts out of your nose.',
    },
    {
      term: 'wrinkles',
      difficulty: 'hard',
      definition:
        'Lines and creases in skin that come with age or a big frown.',
    },
  ],
}
