import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_HOMEPAGE_SECTIONS } from '../lib/merchandising.ts';

const db = new PrismaClient();

/**
 * Customer-facing copy for the category pages, plus the default homepage rows.
 *
 * The collections themselves are seeded by `seed-collections.ts`; this fills in
 * what turns each of them from a filtered grid into a page worth landing on —
 * an introduction, longer copy about choosing and living with the things in it,
 * and the questions we are actually asked.
 *
 * Nothing here overwrites anything. A field is written only when it is still
 * empty, so the moment Tammy edits a category in the dashboard her words are
 * the ones that stay, on this deploy and every one after it.
 */

type CategorySeed = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  body: string;
  faq: Array<{ question: string; answer: string }>;
  keywords: string[];
  /** Words that decide which care guides belong beside this category. */
  careMatches?: string[];
};

const PA_LIGHT =
  'Pennsylvania winters are the real test: from November to March the light in most Cambria County houses is far weaker than it feels, and the furnace pulls the humidity down with it.';

const categories: CategorySeed[] = [
  {
    slug: 'house-plants',
    metaTitle: 'Houseplants for Real Rooms',
    metaDescription:
      'Houseplants chosen to live in ordinary rooms — low light, pet safe, beginner friendly and statement plants, potted by hand in Ebensburg, PA, for local pickup or shipping.',
    intro:
      'These are the foliage plants we keep for ordinary rooms: a bookshelf that gets an hour of sun, a bathroom with one small window, an office with no window at all. Every plant is potted here and listed only once it is settled enough to go home.\n\nIf you are choosing your first houseplant, or replacing one that did not make it, the attributes on each product — beginner friendly, low light, pet safe, drought tolerant — are the fastest way to narrow the shelf down to what will actually work where you are putting it.',
    body:
      'Start with the room, not the plant:\n\nThe most common reason a houseplant fails is that it was chosen for how it looked rather than for the corner it was going into. Stand where the plant will live and look at the window. Can you read a book there at midday without a lamp? That is medium light, and most of what we keep will be happy. Can you see the sky from the plant, filling the window? That is bright light, and it opens up succulents, string-of-pearls and the variegated foliage that goes plain green in a dim room.\n\n' +
      `Light in a Pennsylvania winter:\n\n${PA_LIGHT} A plant that thrived on a north windowsill in July can be badly short of light by January, in the same spot. Moving it a foot closer to the glass through the winter is usually the whole fix, and watering less often while it is growing slowly is the other half.\n\n` +
      'Pets, children and the plants to avoid:\n\nPlants tagged pet safe are non-toxic to cats and dogs on the ASPCA listing. That is different from "will survive a determined cat" — a spider plant is safe and also irresistible. If a household has a chewer, we will happily point you at the plants that are both safe and unappealing.\n\n' +
      'Taking it home:\n\nHouseplants can be collected in Ebensburg or shipped. Larger foliage plants and anything already in a heavy ceramic pot travel far better in a car than in a box, so those are often listed for local pickup only. In freezing weather we hold live plants back and email you rather than posting them into a cold truck.',
    faq: [
      {
        question: 'Which houseplant is best for a beginner?',
        answer:
          'Look for the "beginner friendly" attribute. Pothos, ZZ plants, snake plants and philodendrons all tolerate an irregular watering schedule and a range of light, which is what actually decides whether a first plant survives. Ask us and we will pick one for the room you describe.'
      },
      {
        question: 'What counts as low light?',
        answer:
          'A north-facing window, a spot several feet back from a brighter window, or a room lit mostly by a lamp. Nothing grows in genuine darkness — a low-light plant is one that stays healthy without direct sun, not one that needs no light at all.'
      },
      {
        question: 'Do you have pet safe houseplants?',
        answer:
          'Yes. Filter the shop by "pet safe" to see the plants that are non-toxic to cats and dogs. Each product page also carries a care note, and the care library has pet-safety information on the individual plants.'
      },
      {
        question: 'How often should I water a houseplant?',
        answer:
          'Check the soil rather than the calendar. For most of what we sell, water when the top inch or two is dry and let the excess drain away. Overwatering — not underwatering — is what kills the majority of houseplants brought to us for a diagnosis.'
      },
      {
        question: 'Can I collect a houseplant locally?',
        answer:
          'Yes. Contact us to arrange a pickup time in Ebensburg, then choose local pickup at checkout. There is no shipping charge on a pickup order, and the plant is not sitting in a box for three days.'
      }
    ],
    keywords: [
      'houseplants',
      'indoor plants',
      'low light plants',
      'pet safe plants',
      'beginner plants',
      'houseplants ebensburg pa',
      'houseplants cambria county'
    ],
    careMatches: [
      'pothos',
      'philodendron',
      'monstera',
      'snake',
      'zz',
      'fern',
      'ficus',
      'calathea',
      'peace lily',
      'spider plant',
      'houseplant'
    ]
  },
  {
    slug: 'carnivorous-plants',
    metaTitle: 'Carnivorous Plants: Flytraps, Pitchers & Sundews',
    metaDescription:
      'Venus flytraps, pitcher plants and sundews from The Hillside Gardens in Ebensburg, PA — with the water, light and dormancy notes carnivorous plants genuinely need.',
    intro:
      'Carnivorous plants are the ones people fall for and then lose, almost always for the same three reasons: tap water, too little sun, and a winter spent on a warm windowsill. None of those are hard to get right once somebody tells you.\n\nWe keep Venus flytraps, Sarracenia pitcher plants, Nepenthes and sundews, and every one of them leaves here with its care notes attached.',
    body:
      'Water is the thing that matters most:\n\nCarnivorous plants evolved in bogs where the water carries almost no minerals. The dissolved solids in ordinary tap water build up in the soil and burn the roots over a few months — which is why a flytrap often looks fine for a season and then declines for no visible reason. Use distilled water, reverse-osmosis water or collected rainwater, and stand the pot in a shallow tray of it.\n\n' +
      'Sun, not a shady windowsill:\n\nVenus flytraps and Sarracenia are full-sun plants. They want the brightest window in the house, or better, a summer outside. A flytrap grown in low light makes long floppy leaves and small traps that never colour up. Nepenthes are the exception: they are tropical, and bright indirect light with high humidity suits them.\n\n' +
      'Winter dormancy is not the plant dying:\n\nFlytraps and Sarracenia are temperate plants — they need a cold rest of about three months, and a Pennsylvania winter provides it. Traps blacken, growth stops, and the plant looks dreadful. That is the point. An unheated porch, a garage or a cold windowsill will do it. A carnivorous plant kept warm and growing year round will usually be dead within two years.\n\n' +
      'Do not feed them hamburger:\n\nA plant on a windowsill catches enough on its own, and a trap fed something it cannot digest simply rots. Never fertilise the soil, and do not trigger the traps for fun — each one only closes a handful of times before it dies back.',
    faq: [
      {
        question: 'What water should I use for a Venus flytrap?',
        answer:
          'Distilled, reverse-osmosis or rainwater only. Tap water and softened water carry dissolved minerals that accumulate in the soil and kill carnivorous plants slowly. Standing the pot in a tray of an inch of the right water is the easiest way to keep it happy.'
      },
      {
        question: 'Do carnivorous plants need a winter dormancy?',
        answer:
          'Venus flytraps and Sarracenia pitcher plants do — around three months of cold, from roughly November to February, during which they look dead and are not. Tropical Nepenthes do not. Our Pennsylvania winter makes dormancy easy: an unheated porch or garage is ideal.'
      },
      {
        question: 'Why are my flytrap’s traps turning black?',
        answer:
          'Traps blacken and are replaced throughout the growing season, and everything blackens at once going into dormancy — both are normal. Black traps together with limp, pale growth in summer usually means tap water, too little light, or soil that was fertilised.'
      },
      {
        question: 'Do I need to feed a carnivorous plant?',
        answer:
          'No. A plant near a window catches its own insects. If it lives somewhere completely sealed, a couple of dried insects a month is plenty. Never feed meat, and never put fertiliser in the soil.'
      },
      {
        question: 'Are carnivorous plants good for beginners?',
        answer:
          'They are, once the water and the light are right — they are not fussy so much as specific. A Sarracenia on a sunny porch is one of the easiest plants we sell. Ask us if you are not sure your spot is bright enough.'
      }
    ],
    keywords: [
      'carnivorous plants',
      'venus flytrap',
      'pitcher plant',
      'sarracenia',
      'nepenthes',
      'sundew',
      'carnivorous plants pennsylvania'
    ],
    careMatches: [
      'carnivor',
      'flytrap',
      'venus',
      'pitcher',
      'sarracenia',
      'nepenthes',
      'sundew',
      'drosera'
    ]
  },
  {
    slug: 'succulents',
    metaTitle: 'Succulents & Cacti for Bright Windows',
    metaDescription:
      'Echeveria, jade, haworthia, aloe and cacti from The Hillside Gardens in Ebensburg, PA — drought tolerant plants for bright windowsills, with honest care notes.',
    intro:
      'Succulents store their own water, which makes them forgiving of a forgetful owner and unforgiving of a generous one. Nearly every succulent brought to us in trouble has been watered too often, in a pot with no drainage, on a windowsill that was not bright enough.\n\nWe keep echeveria, haworthia, jade, aloe, sedum and a rotating shelf of small cacti, in sizes from a windowsill single to a planted arrangement.',
    body:
      'Bright light is not optional:\n\nA succulent needs the brightest window you have — south or west facing, as close to the glass as it will go. In poor light a rosette stretches, pales and loses its shape, and once it has stretched it does not tighten up again. If the only bright spot in the house is already taken, a haworthia or a gasteria will cope with less than an echeveria will.\n\n' +
      `Watering: soak, then leave it alone:\n\nWater thoroughly until it runs out of the bottom, then do not water again until the soil is completely dry all the way through — often two or three weeks, and longer in winter. ${PA_LIGHT} Through a Pennsylvania winter most succulents want water roughly monthly, and a cactus may want none at all.\n\n` +
      'Pots and soil:\n\nDrainage matters more than the mix. A drainage hole and a gritty potting mix will forgive most watering mistakes; a sealed decorative pot will not forgive any. If you have fallen in love with a container that has no hole, keep the plant in a plastic nursery pot inside it and lift it out to water.\n\n' +
      'Good gifts, and easy to post:\n\nSucculents travel well, which makes them one of the few live plants we are happy to ship in almost any weather. They are also the plants people most often buy as a small gift — a potted echeveria with a care card included is a better housewarming present than a cut bouquet, and it lasts.',
    faq: [
      {
        question: 'How often should I water a succulent?',
        answer:
          'Only when the soil is dry all the way through — typically every two to three weeks in summer and monthly or less in a Pennsylvania winter. Water thoroughly when you do, and let the excess drain right out. A succulent sitting in wet soil rots from the roots up.'
      },
      {
        question: 'Why is my succulent stretching and going pale?',
        answer:
          'That is etiolation, and it means not enough light. Move it to your brightest window. The stretched growth will not shrink back, but you can behead a leggy rosette, let the cut callus for a few days and re-root the top.'
      },
      {
        question: 'Do succulents need a special soil?',
        answer:
          'They need a gritty mix that drains fast. A cactus and succulent compost is fine as sold, and cutting ordinary potting soil with perlite or coarse sand works just as well. The drainage hole matters more than the brand of compost.'
      },
      {
        question: 'Are succulents safe around pets?',
        answer:
          'Some are and some are not — aloe and euphorbias are toxic to cats and dogs, while haworthia and echeveria are not. Filter by "pet safe" or ask us; every plant page says what we know.'
      }
    ],
    keywords: [
      'succulents',
      'cacti',
      'echeveria',
      'haworthia',
      'jade plant',
      'drought tolerant plants',
      'succulents pennsylvania'
    ],
    careMatches: ['succulent', 'cactus', 'cacti', 'echeveria', 'haworthia', 'jade', 'aloe', 'sedum']
  },
  {
    slug: 'air-plants',
    metaTitle: 'Air Plants (Tillandsia) & How to Keep Them',
    metaDescription:
      'Tillandsia air plants from The Hillside Gardens in Ebensburg, PA. No soil required — just bright indirect light, a weekly soak and somewhere to dry. Mounted on driftwood or loose.',
    intro:
      'Air plants take their water and nutrients through their leaves instead of their roots, so they need no soil at all. That makes them the most flexible plant we sell: they sit in a bowl, hang from driftwood, perch in a shell or live in an open terrarium.\n\nIt also makes them the plant people most often kill by kindness — sealed in a closed glass globe, where they cannot dry out.',
    body:
      'Soaking, not misting:\n\nOnce a week, put the plant upside down in a bowl of room-temperature water for twenty to thirty minutes. Then shake it out properly and lay it somewhere with moving air until it is completely dry — within about four hours. Water trapped in the crown is what rots an air plant, and misting alone rarely wets it enough to matter.\n\n' +
      'Light and air:\n\nBright indirect light: near a window, out of scorching afternoon sun. They are called air plants for a reason — they need airflow, so an open dish, a mount or a wide-mouthed vessel works and a sealed jar does not.\n\n' +
      'Winter indoors in Pennsylvania:\n\nCentral heating dries the air a long way past what a tillandsia is used to. Through the winter they usually want soaking more often, not less — every five days rather than every seven — and they appreciate a spot away from the radiator and out of the draught from the door.\n\n' +
      'Mounting and gifts:\n\nWe mount air plants on driftwood, and the two are sold together and separately. Nothing needs glue: a loop of fishing line or florist wire holds a plant in place until it anchors itself, and it can be lifted off for its weekly soak.',
    faq: [
      {
        question: 'How do you water an air plant?',
        answer:
          'Soak it upside down in room-temperature water for twenty to thirty minutes once a week, shake the water out of its leaves, and leave it somewhere airy until it is dry within a few hours. Soak more often in winter when the heating is on.'
      },
      {
        question: 'Can an air plant live in a closed terrarium?',
        answer:
          'No. A sealed container keeps them wet, and a tillandsia that cannot dry out rots at the base. Use an open globe, a dish or a mount instead — a closed terrarium is for mosses and tropical plants that want the humidity.'
      },
      {
        question: 'Do air plants need soil or fertiliser?',
        answer:
          'No soil at all — the roots exist only to hold on. A little bromeliad or air-plant fertiliser in the soaking water once a month in spring and summer is optional and helps them bloom.'
      },
      {
        question: 'How long do air plants live?',
        answer:
          'Each plant flowers once, then produces offsets — "pups" — around its base and slowly dies back over a year or two. Leave the pups attached and you end up with a clump rather than a single plant.'
      }
    ],
    keywords: ['air plants', 'tillandsia', 'mounted air plants', 'no soil plants', 'air plants pa'],
    careMatches: ['air plant', 'tillandsia']
  },
  {
    slug: 'terrarium-supplies',
    metaTitle: 'Terrarium Supplies: Substrate, Moss, Glass & Wood',
    metaDescription:
      'Terrarium substrate, horticultural charcoal, gravel, moss, driftwood and glass from The Hillside Gardens in Ebensburg, PA — everything for a terrarium that lasts more than a season.',
    intro:
      'A terrarium is a small closed ecosystem, and it either works or it turns to mould in a fortnight. The difference is almost entirely in the layers underneath: drainage, a barrier, charcoal and the right substrate.\n\nWe stock the parts individually so you can build one properly, and we teach it — in the care library and in the workshops when they run.',
    body:
      'The layers, bottom to top:\n\nStart with an inch or two of gravel or leca for drainage. Add a thin mesh or moss barrier so the substrate does not wash down into it. A scatter of horticultural charcoal comes next — it keeps a closed container from going sour. Then the substrate itself, deep enough for roots, and finally the plants, the moss and whatever wood or stone you are building the landscape from.\n\n' +
      'Closed or open?\n\nA closed terrarium is a humid, tropical world: ferns, fittonia, moss, small tropical foliage. It needs almost no watering once balanced — condensation on the glass every morning that clears by midday is exactly right. An open terrarium suits succulents, cacti and air plants, and needs watering like an ordinary pot.\n\n' +
      'Common mistakes:\n\nToo much water at the start, and direct sun. A closed container in a sunbeam becomes an oven within an hour. Bright indirect light, a small pour of water, and patience — a terrarium that looks slightly too dry on day one usually settles perfectly.\n\n' +
      'Building one with us:\n\nIf you would rather not assemble it yourself, we build terrariums and planted arrangements to order. Those are usually local pickup in Ebensburg — a planted glass vessel travels far better in a footwell than in a courier van.',
    faq: [
      {
        question: 'What do I need to build a terrarium?',
        answer:
          'A glass vessel, drainage gravel or leca, a mesh or moss barrier, horticultural charcoal, a suitable substrate, plants and something to landscape with — moss, driftwood or stone. We sell the components separately so you can build the size you actually want.'
      },
      {
        question: 'Why is my terrarium growing mould?',
        answer:
          'Usually too much water, not enough airflow, or no charcoal in the layers. Open a closed terrarium for a few days to dry it down, take out any dead leaves, and consider rebuilding with charcoal if it was left out.'
      },
      {
        question: 'Which plants work in a closed terrarium?',
        answer:
          'Small tropicals that like humidity: fittonia, ferns, peperomia, mosses, baby tears. Succulents, cacti and air plants must not go in a closed container — they need to dry out and will rot.'
      },
      {
        question: 'Do you make custom terrariums?',
        answer:
          'Yes. Tell us the vessel, the room and the light and we will plant one for you. Custom terrariums are normally collected in Ebensburg rather than shipped.'
      }
    ],
    keywords: [
      'terrarium supplies',
      'terrarium substrate',
      'horticultural charcoal',
      'terrarium moss',
      'diy terrarium',
      'terrarium kit pennsylvania'
    ],
    careMatches: ['terrarium', 'moss', 'fittonia', 'fern']
  },
  {
    slug: 'moss',
    metaTitle: 'Moss for Terrariums & Arrangements',
    metaDescription:
      'Cushion and sheet moss for terrariums, planters and table settings, from The Hillside Gardens in Ebensburg, PA.',
    intro:
      'Moss is what makes a terrarium look like a landscape instead of a pot of soil. We keep cushion and sheet moss for terrarium floors, for topping planted arrangements and for table settings.',
    body:
      'Keeping moss alive:\n\nMoss wants humidity, indirect light and no fertiliser at all. In a closed terrarium it needs almost nothing. On the surface of an open planter it will want misting every few days, and it will go crisp and pale if it dries out completely.\n\n' +
      'Using it as a top dressing:\n\nA layer of moss over the soil of a houseplant holds moisture at the surface and hides a nursery pot beautifully. Keep it clear of the stem, and lift it aside occasionally to check whether the soil underneath is actually dry before you water.',
    faq: [
      {
        question: 'How do I keep terrarium moss green?',
        answer:
          'Indirect light and steady humidity. In a closed terrarium the condensation does the work; in an open one, mist every few days. Direct sun will scorch it and fertiliser will burn it.'
      },
      {
        question: 'Can I use moss on top of a houseplant’s soil?',
        answer:
          'Yes, and it looks lovely — just keep it away from the stem and check the soil beneath it before watering, because a moss layer makes the surface look wetter than the root ball is.'
      }
    ],
    keywords: [
      'terrarium moss',
      'cushion moss',
      'sheet moss',
      'preserved moss',
      'moss for planters'
    ],
    careMatches: ['moss', 'terrarium']
  },
  {
    slug: 'botanicals',
    metaTitle: 'Handmade Botanical Goods',
    metaDescription:
      'Small-batch soaps, lotions, salves and botanical goods made by hand at The Hillside Gardens in Ebensburg, Pennsylvania. Giftable, locally made, available for pickup or shipping.',
    intro:
      'The botanical side of the bench: soaps cut by hand, lotions and salves blended in small batches, and the seasonal goods that come and go with what is growing.\n\nBecause these are made in batches rather than ordered in, the shelf changes. What is listed is what exists.',
    body:
      'What "small batch" means here:\n\nIt means a few dozen bars at a time, made and cured on site, with the ingredients printed on the product page. It also means a scent you liked may not be back for a season — if there is one you want kept aside, tell us and we will.\n\n' +
      'Gifts:\n\nBotanical goods are the easiest thing we sell to give: they ship in any weather, they do not need looking after, and a soap and a small plant together make a housewarming present that is neither a candle nor a bottle of wine. Look for the "giftable" attribute.\n\n' +
      'Ingredients and skin:\n\nEvery product page lists ingredients, net contents and directions. Handmade does not mean hypoallergenic — if you react to essential oils or a particular botanical, read the list first, and ask us if anything is unclear.',
    faq: [
      {
        question: 'Are the soaps and lotions handmade?',
        answer:
          'Yes — made here in small batches. Each product page lists the ingredients, the net contents and how to use it, because "handmade" on its own tells you nothing useful about what is in a bar.'
      },
      {
        question: 'Can botanical goods be returned?',
        answer:
          'Unopened, non-perishable items may be returned within 14 days; once a personal-care product has been opened it is final sale, for the same hygiene reasons any shop applies. The shipping and returns page has the full policy.'
      },
      {
        question: 'Do you make gift sets?',
        answer:
          'We do — often a soap or lotion paired with a small plant or a tea. Look for bundles in the shop, or ask us to put something together for a particular budget.'
      }
    ],
    keywords: [
      'handmade soap',
      'botanical goods',
      'small batch lotion',
      'handmade gifts pennsylvania',
      'botanical skincare'
    ],
    careMatches: []
  },
  {
    slug: 'teas-herbals',
    metaTitle: 'Loose-Leaf Teas & Herbal Blends',
    metaDescription:
      'Loose-leaf teas, herbal blends and the simple brewing tools that go with them, from The Hillside Gardens in Ebensburg, Pennsylvania.',
    intro:
      'Loose-leaf blends and the few tools that make brewing them straightforward — a strainer, a pot, a tin that actually keeps the leaf fresh.\n\nBlends are made in small quantities, so the selection turns over with the seasons.',
    body:
      'Brewing without fuss:\n\nMost of what we keep is forgiving: a heaped teaspoon per cup, water just off the boil for herbals and black tea, cooler for green, and a few minutes of patience. Each blend’s page gives the temperature and time we like for it.\n\n' +
      'Keeping it fresh:\n\nLeaf keeps best airtight, out of the light and away from the stove. A tin in a cupboard is better than a jar on a sunny shelf, and most blends are at their best within a year.\n\n' +
      'Caffeine and ingredients:\n\nHerbal blends are naturally caffeine-free unless the page says otherwise. Ingredients are listed on every product — worth reading if you are pregnant, on medication or sensitive to a particular herb.',
    faq: [
      {
        question: 'How much loose-leaf tea should I use per cup?',
        answer:
          'About a heaped teaspoon per cup, adjusted to taste. Each blend’s page gives the water temperature and steeping time we prefer for it.'
      },
      {
        question: 'How should loose-leaf tea be stored?',
        answer:
          'Airtight, dark and away from heat and strong smells. A tin in a cupboard is ideal; most blends are at their best within a year of opening.'
      },
      {
        question: 'Are your herbal blends caffeine free?',
        answer:
          'Herbal blends are caffeine-free unless the product page says otherwise. Blends containing true tea — black, green, white or oolong — do contain caffeine, and the page says so.'
      }
    ],
    keywords: ['loose leaf tea', 'herbal tea', 'tea blends', 'tea supplies', 'caffeine free tea'],
    careMatches: []
  },
  {
    slug: 'live-plant-planters',
    metaTitle: 'Planted Arrangements & Live Planters',
    metaDescription:
      'Finished live planters and dish gardens, arranged by hand at The Hillside Gardens in Ebensburg, PA. Ready to set down — local pickup recommended for larger pieces.',
    intro:
      'Finished arrangements rather than single plants: several plants balanced in one container, potted and settled so they can be set straight down on a table.\n\nEach one is put together for a light level, so the plants in it want the same things — which is the part that goes wrong when a dish garden is assembled from whatever was on sale.',
    body:
      'Why a mixed planter fails, and how ours avoid it:\n\nThe usual mistake is combining plants with different water needs in one pot: a fern and a succulent will never both be happy, whatever the watering schedule. Everything in one of our arrangements shares a light and water requirement, and the card tells you which.\n\n' +
      'Living with one:\n\nWater the arrangement as a single plant, according to its card. Turn it a quarter turn every couple of weeks so it does not lean to the window. If one plant eventually outgrows the others, lift it out and pot it up on its own — the arrangement will close over the gap.\n\n' +
      'Getting one home:\n\nPlanted containers are heavy and top-heavy, and a courier will not keep them upright. Most are listed for local pickup in Ebensburg. If you want one shipped, ask first and we will tell you honestly whether it will travel.',
    faq: [
      {
        question: 'How do I water a mixed planter?',
        answer:
          'As one plant, following the card that comes with it. Everything in the arrangement is chosen to want the same light and water, so there is no need to treat each plant separately.'
      },
      {
        question: 'Can a planted arrangement be shipped?',
        answer:
          'Small ones often can. Larger and top-heavy pieces are local pickup only — they arrive in far better shape in a car footwell than in a box. Ask us about a specific piece and we will say.'
      },
      {
        question: 'Can you make a custom arrangement?',
        answer:
          'Yes. Tell us the container or the budget, the room and the light, and whether pets are a consideration, and we will plant one. Custom pieces are usually collected in Ebensburg.'
      }
    ],
    keywords: [
      'live planters',
      'dish garden',
      'planted arrangement',
      'custom planter',
      'plant gift ebensburg'
    ],
    careMatches: ['planter', 'arrangement', 'repot']
  }
];

async function seedCategoryContent() {
  let updated = 0;
  let careLinked = 0;

  const careSheets = await db.careSheet.findMany({
    where: { published: true },
    select: { id: true, plantName: true, botanical: true, category: true, summary: true }
  });

  for (const seed of categories) {
    const collection = await db.collection.findUnique({
      where: { slug: seed.slug },
      select: {
        id: true,
        intro: true,
        body: true,
        faq: true,
        metaTitle: true,
        metaDescription: true,
        keywords: true,
        _count: { select: { careSheets: true } }
      }
    });
    if (!collection) continue;

    /**
     * Each field is filled only when it is still empty. A category Tammy has
     * written herself is left completely alone, which is what makes this safe to
     * run on every deploy.
     */
    const data: Prisma.CollectionUpdateInput = {};
    if (!collection.intro?.trim()) data.intro = seed.intro;
    if (!collection.body?.trim()) data.body = seed.body;
    if (!Array.isArray(collection.faq) || collection.faq.length === 0) data.faq = seed.faq;
    if (!collection.metaTitle?.trim()) data.metaTitle = seed.metaTitle;
    if (!collection.metaDescription?.trim()) data.metaDescription = seed.metaDescription;
    if (!collection.keywords.length) data.keywords = seed.keywords;

    if (Object.keys(data).length) {
      await db.collection.update({ where: { id: collection.id }, data });
      updated += 1;
    }

    // Care guides are linked once, when the category has none — so a guide she
    // unlinked by hand does not come back on the next deploy.
    if (collection._count.careSheets === 0 && seed.careMatches?.length) {
      const matches = careSheets.filter((sheet) => {
        const haystack =
          `${sheet.plantName} ${sheet.botanical || ''} ${sheet.category || ''} ${sheet.summary}`.toLowerCase();
        return seed.careMatches!.some((keyword) => haystack.includes(keyword));
      });
      if (matches.length) {
        await db.collection.update({
          where: { id: collection.id },
          data: { careSheets: { connect: matches.slice(0, 6).map((sheet) => ({ id: sheet.id })) } }
        });
        careLinked += Math.min(matches.length, 6);
      }
    }
  }

  console.log(`Category content ready: ${updated} updated, ${careLinked} care guides linked.`);
}

/**
 * The homepage rows, seeded once. After this the arrangement belongs to the
 * dashboard — including an owner who deleted every row on purpose, which is why
 * this only ever runs against a completely empty table.
 */
async function seedHomepageSections() {
  const existing = await db.homepageSection.count();
  if (existing > 0) {
    console.log(`Homepage sections left alone: ${existing} already arranged.`);
    return;
  }

  await db.homepageSection.createMany({
    data: DEFAULT_HOMEPAGE_SECTIONS.map((section) => ({
      kind: section.kind,
      eyebrow: section.eyebrow,
      title: section.title,
      subtitle: section.subtitle,
      maxItems: section.maxItems,
      sortOrder: section.sortOrder
    }))
  });
  console.log(`Homepage sections created: ${DEFAULT_HOMEPAGE_SECTIONS.length}.`);
}

async function main() {
  await seedCategoryContent();
  await seedHomepageSections();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
