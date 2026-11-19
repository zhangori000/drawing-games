import type { WordPackData } from '../play/types'

/**
 * Curated `food` pack. Ids derive from `food/<slug(term)>`; never rename a
 * term in place — deactivate it and add a new entry instead.
 */
export const FOOD_PACK: WordPackData = {
  id: 'food',
  words: [
    {
      term: 'pizza',
      difficulty: 'easy',
      definition:
        'A flat round bread baked with tomato sauce and melted cheese on top.',
    },
    {
      term: 'banana',
      difficulty: 'easy',
      definition: 'A long, curved yellow fruit that you peel before eating.',
    },
    {
      term: 'apple',
      difficulty: 'easy',
      definition: 'A round, crunchy red or green fruit with a stem on top.',
    },
    {
      term: 'watermelon',
      difficulty: 'easy',
      definition:
        'A huge green-striped fruit with juicy red flesh and black seeds.',
    },
    {
      term: 'pineapple',
      difficulty: 'easy',
      definition:
        'A spiky tropical fruit with tough skin and a crown of leaves.',
    },
    {
      term: 'strawberry',
      difficulty: 'easy',
      definition:
        'A small red heart-shaped fruit with tiny seeds on the outside.',
    },
    {
      term: 'cherry',
      difficulty: 'easy',
      definition: 'A small round red fruit that grows in pairs on long stems.',
    },
    {
      term: 'grape',
      difficulty: 'easy',
      definition: 'A small round fruit that grows in bunches, green or purple.',
    },
    {
      term: 'lemon',
      difficulty: 'easy',
      definition: 'A sour yellow oval fruit used to make tangy drinks.',
    },
    {
      term: 'pear',
      difficulty: 'easy',
      definition:
        'A sweet fruit that is narrow at the top and round at the bottom.',
    },
    {
      term: 'carrot',
      difficulty: 'easy',
      definition: 'A long orange root vegetable with leafy green tops.',
    },
    {
      term: 'corn',
      difficulty: 'easy',
      definition: 'A yellow cob covered in rows of juicy kernels.',
      aliases: ['corn on the cob'],
    },
    {
      term: 'broccoli',
      difficulty: 'easy',
      definition: 'A green vegetable that looks like a tiny bushy tree.',
    },
    {
      term: 'mushroom',
      difficulty: 'easy',
      definition: 'A small fungus with a round cap on a short stem.',
    },
    {
      term: 'pumpkin',
      difficulty: 'easy',
      definition: 'A big round orange squash with ridges and a thick stem.',
    },
    {
      term: 'hamburger',
      difficulty: 'easy',
      definition:
        'A beef patty in a bun, often with cheese, lettuce, and tomato.',
      aliases: ['burger'],
    },
    {
      term: 'hot dog',
      difficulty: 'easy',
      definition:
        'A sausage in a long bun, often topped with mustard or ketchup.',
    },
    {
      term: 'taco',
      difficulty: 'easy',
      definition: 'A folded corn shell stuffed with meat, cheese, and lettuce.',
    },
    {
      term: 'sandwich',
      difficulty: 'easy',
      definition:
        'Fillings like meat or cheese stacked between two slices of bread.',
    },
    {
      term: 'french fries',
      difficulty: 'easy',
      definition: 'Thin strips of fried potato, often served with ketchup.',
      aliases: ['fries'],
    },
    {
      term: 'pancake',
      difficulty: 'easy',
      definition: 'A flat, round breakfast cake served in a stack with syrup.',
      aliases: ['flapjack', 'hotcake'],
    },
    {
      term: 'waffle',
      difficulty: 'easy',
      definition:
        'A crispy breakfast cake with a grid of little square pockets.',
    },
    {
      term: 'bread',
      difficulty: 'easy',
      definition:
        'A baked loaf made from flour that you slice for sandwiches and toast.',
    },
    {
      term: 'fried egg',
      difficulty: 'easy',
      definition:
        'A yellow yolk surrounded by white, cooked flat in a hot pan for breakfast.',
    },
    {
      term: 'cheese',
      difficulty: 'easy',
      definition:
        'A yellow dairy food, sometimes shown as a wedge full of holes.',
    },
    {
      term: 'popcorn',
      difficulty: 'easy',
      definition:
        'Fluffy white puffs of heated kernels, often eaten at the movies.',
    },
    {
      term: 'cookie',
      difficulty: 'easy',
      definition:
        'A small, flat, sweet baked treat, often with chocolate chips.',
    },
    {
      term: 'cupcake',
      difficulty: 'easy',
      definition:
        'A single-serving cake baked in a paper liner and topped with frosting.',
    },
    {
      term: 'doughnut',
      difficulty: 'easy',
      definition:
        'A sweet fried ring of dough, often glazed or covered in sprinkles.',
      aliases: ['donut'],
    },
    {
      term: 'ice cream cone',
      difficulty: 'easy',
      definition: 'Scoops of a frozen sweet treat piled on a crunchy wafer.',
      aliases: ['ice cream'],
    },
    {
      term: 'lollipop',
      difficulty: 'easy',
      definition: 'A hard candy on a stick that you lick.',
    },
    {
      term: 'milk',
      difficulty: 'easy',
      definition: 'A white drink that comes from cows, often poured on cereal.',
    },
    {
      term: 'spaghetti',
      difficulty: 'medium',
      definition:
        'Long, thin noodles, often served with tomato sauce and meatballs.',
    },
    {
      term: 'sushi',
      difficulty: 'medium',
      definition: 'Japanese rolls of rice and seaweed, often with raw fish.',
    },
    {
      term: 'burrito',
      difficulty: 'medium',
      definition: 'A big flour tortilla wrapped around beans, rice, and meat.',
    },
    {
      term: 'nachos',
      difficulty: 'medium',
      definition: 'Tortilla chips piled high and covered in melted cheese.',
    },
    {
      term: 'pretzel',
      difficulty: 'medium',
      definition: 'A twisted, salty baked snack shaped like a loose knot.',
    },
    {
      term: 'bacon',
      difficulty: 'medium',
      definition: 'Thin, wavy strips of salty pork fried until crispy.',
    },
    {
      term: 'cereal',
      difficulty: 'medium',
      definition:
        'Crunchy breakfast flakes or loops eaten from a bowl with milk.',
    },
    {
      term: 'croissant',
      difficulty: 'medium',
      definition: 'A flaky, buttery pastry curved like a crescent moon.',
    },
    {
      term: 'cinnamon roll',
      difficulty: 'medium',
      definition:
        'A sweet spiral bun swirled with spice and topped with icing.',
    },
    {
      term: 'pie',
      difficulty: 'medium',
      definition:
        'A baked dessert with a flaky crust and a sweet fruit filling.',
    },
    {
      term: 'fried chicken',
      difficulty: 'medium',
      definition:
        'Crispy, golden, battered drumsticks and wings, often sold in a bucket.',
    },
    {
      term: 'pickle',
      difficulty: 'medium',
      definition:
        'A cucumber soaked in salty vinegar until it turns sour and bumpy.',
    },
    {
      term: 'potato',
      difficulty: 'medium',
      definition:
        'A lumpy brown vegetable dug from the ground, often made into fries.',
    },
    {
      term: 'avocado',
      difficulty: 'medium',
      definition: 'A pear-shaped green fruit with creamy flesh and a big pit.',
    },
    {
      term: 'coconut',
      difficulty: 'medium',
      definition:
        'A hard, hairy brown fruit from a palm tree with white flesh inside.',
    },
    {
      term: 'chili pepper',
      difficulty: 'medium',
      definition: 'A small, curved red or green pod with a spicy, fiery taste.',
      aliases: ['hot pepper', 'chile pepper'],
    },
    {
      term: 'pea pod',
      difficulty: 'medium',
      definition:
        'A green shell that splits open to show a row of little round seeds.',
      aliases: ['peas'],
    },
    {
      term: 'onion ring',
      difficulty: 'medium',
      definition:
        'A crispy battered hoop cut from a sliced bulb that makes you cry when chopped.',
    },
    {
      term: 'ketchup',
      difficulty: 'medium',
      definition: 'A thick red tomato sauce squeezed from a bottle onto fries.',
    },
    {
      term: 'honey',
      difficulty: 'medium',
      definition: 'Sticky golden syrup made by bees, often kept in a jar.',
    },
    {
      term: 'bubble gum',
      difficulty: 'medium',
      definition:
        'A chewy pink candy you can blow into a big balloon until it pops.',
    },
    {
      term: 'cotton candy',
      difficulty: 'medium',
      definition:
        'Fluffy spun sugar wrapped around a paper stick, sold at fairs.',
    },
    {
      term: 'gummy bear',
      difficulty: 'medium',
      definition: 'A small, chewy, fruity candy shaped like a tiny teddy.',
    },
    {
      term: 'marshmallow',
      difficulty: 'medium',
      definition:
        'A soft, white, puffy candy often toasted on a stick over a fire.',
    },
    {
      term: 'milkshake',
      difficulty: 'medium',
      definition:
        'A thick, cold drink of blended ice cream served with a straw.',
    },
    {
      term: 'hot chocolate',
      difficulty: 'medium',
      definition: 'A warm, sweet cocoa drink often topped with marshmallows.',
      aliases: ['hot cocoa', 'cocoa'],
    },
    {
      term: 'lemonade',
      difficulty: 'medium',
      definition:
        'A sweet and sour drink made from squeezed lemons, water, and sugar.',
    },
    {
      term: 'steak',
      difficulty: 'medium',
      definition:
        'A thick slice of grilled beef, sometimes with a T-shaped bone.',
    },
    {
      term: 'gingerbread house',
      difficulty: 'hard',
      definition:
        'A tiny cottage with spiced cookie walls, decorated with icing and candy.',
    },
    {
      term: 'chocolate fountain',
      difficulty: 'hard',
      definition:
        'A tiered tower that pours a curtain of melted cocoa for dipping fruit.',
    },
    {
      term: 'shish kebab',
      difficulty: 'hard',
      definition: 'Chunks of meat and vegetables grilled on a long skewer.',
      aliases: ['kebab', 'kabob', 'shish kabob'],
    },
    {
      term: 'banana split',
      difficulty: 'hard',
      definition:
        'A long boat dish holding a sliced yellow fruit under three scoops of ice cream.',
    },
    {
      term: 'fortune cookie',
      difficulty: 'hard',
      definition:
        'A folded, crispy treat with a little paper message hidden inside.',
    },
    {
      term: 'fruit salad',
      difficulty: 'hard',
      definition:
        'A bowl of mixed, chopped pieces of melon, berries, and grapes.',
    },
    {
      term: 'macaroni and cheese',
      difficulty: 'hard',
      definition: 'Elbow noodles baked or stirred in a creamy, cheesy sauce.',
      aliases: ['mac and cheese', 'mac n cheese'],
    },
    {
      term: 'chicken noodle soup',
      difficulty: 'hard',
      definition:
        'A warm, salty broth with pasta and bits of poultry, served when you feel sick.',
    },
    {
      term: 'burnt toast',
      difficulty: 'hard',
      definition:
        'A slice of bread left in the heat too long until it turns black and smoky.',
    },
    {
      term: 'pomegranate',
      difficulty: 'hard',
      definition:
        'A round red fruit packed with hundreds of juicy, jewel-like seeds.',
    },
    {
      term: 'leftovers',
      difficulty: 'hard',
      definition: 'Extra food from a meal, saved in containers for later.',
    },
    {
      term: 'trail mix',
      difficulty: 'hard',
      definition:
        'A crunchy snack blend of nuts, raisins, and candy for hikers.',
    },
    {
      term: 'peanut butter',
      difficulty: 'hard',
      definition:
        'A thick, sticky spread made from ground nuts, often eaten with jelly.',
    },
    {
      term: 'jelly bean',
      difficulty: 'hard',
      definition:
        'A small, shiny, chewy candy shaped like a kidney, in many colors.',
    },
    {
      term: 'maple syrup',
      difficulty: 'hard',
      definition: 'Sweet golden-brown tree sap that you pour over pancakes.',
    },
    {
      term: 'garlic',
      difficulty: 'hard',
      definition:
        'A strong-smelling white bulb made of cloves, said to scare off vampires.',
    },
    {
      term: 'raisin',
      difficulty: 'hard',
      definition: 'A dried, wrinkly grape that is sweet and chewy.',
    },
    {
      term: 'dumpling',
      difficulty: 'hard',
      definition:
        'A small pocket of dough stuffed with filling and steamed or boiled.',
    },
    {
      term: "s'more",
      difficulty: 'hard',
      definition:
        'A campfire treat of toasted marshmallow and chocolate squished between crackers.',
    },
    {
      term: 'lasagna',
      difficulty: 'hard',
      definition:
        'Wide, flat noodles layered with sauce, meat, and cheese, then baked.',
    },
  ],
}
