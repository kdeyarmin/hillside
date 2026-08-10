import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

type Seed = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  imageUrl: string;
  featured: boolean;
  sortOrder: number;
  /** Products are matched by ProductType and/or a keyword in the name or slug. */
  types?: string[];
  keywords?: string[];
};

/**
 * The homepage used to advertise ten collections that all resolved to the same
 * two shop filters. These are real, owner-editable rows: a collection appears on
 * the homepage only once it actually holds something.
 */
const collections: Seed[] = [
  {
    slug: 'plants',
    title: 'Plants',
    tagline: 'Living beauty for every room',
    description: 'Every living plant we stock, from easygoing beginners to statement pieces.',
    imageUrl: '/images/catalog/house-plants.webp',
    featured: false,
    sortOrder: 1,
    types: ['PLANT']
  },
  {
    slug: 'teas-herbals',
    title: 'Teas & Herbals',
    tagline: 'Thoughtful botanical blends',
    description: 'Loose-leaf blends and the simple tools that make brewing them a pleasure.',
    imageUrl: '/images/catalog/apothecary.webp',
    featured: false,
    sortOrder: 2,
    types: ['TEA', 'TEA_SUPPLY']
  },
  {
    slug: 'botanicals',
    title: 'Botanicals',
    tagline: 'Small-batch and handmade',
    description: 'Handmade soaps, lotions and botanical goods made in small batches.',
    imageUrl: '/images/catalog/homemade-soaps.webp',
    featured: false,
    sortOrder: 3,
    types: ['SOAP', 'LOTION', 'OTHER']
  },
  {
    slug: 'house-plants',
    title: 'House Plants',
    tagline: 'Living beauty for every room',
    description: 'Foliage plants chosen to thrive in ordinary rooms with ordinary light.',
    imageUrl: '/images/catalog/house-plants.webp',
    featured: true,
    sortOrder: 10,
    types: ['PLANT']
  },
  {
    slug: 'carnivorous-plants',
    title: 'Carnivorous Plants',
    tagline: 'Wild, unusual and wonderful',
    description: 'Flytraps, pitcher plants and sundews, with the care notes they genuinely need.',
    imageUrl: '/images/catalog/carnivorous-plants.webp',
    featured: true,
    sortOrder: 11,
    keywords: ['carnivor', 'flytrap', 'venus', 'pitcher', 'sarracenia', 'nepenthes', 'sundew']
  },
  {
    slug: 'live-plant-planters',
    title: 'Live Plant Planters',
    tagline: 'Arrangements made to take home',
    description: 'Finished arrangements, potted and balanced, ready to set down and enjoy.',
    imageUrl: '/images/catalog/live-plant-planters.webp',
    featured: true,
    sortOrder: 12,
    keywords: ['planter', 'arrangement', 'centerpiece', 'dish garden']
  },
  {
    slug: 'succulents',
    title: 'Succulents',
    tagline: 'Sculptural greens in forgiving forms',
    description: 'Low-water plants with strong shapes for bright windowsills.',
    imageUrl: '/images/catalog/succulents.webp',
    featured: true,
    sortOrder: 13,
    keywords: ['succulent', 'echeveria', 'sedum', 'jade', 'aloe', 'cactus', 'haworthia']
  },
  {
    slug: 'air-plants',
    title: 'Air Plants',
    tagline: 'Small plants with big personality',
    description: 'Tillandsia that need no soil at all — just light, air and a weekly soak.',
    imageUrl: '/images/catalog/air-plants.webp',
    featured: true,
    sortOrder: 14,
    keywords: ['air plant', 'airplant', 'tillandsia']
  },
  {
    slug: 'homemade-soaps',
    title: 'Homemade Soaps',
    tagline: 'Small-batch botanical bars',
    description: 'Hand-cut soaps made in small batches with botanical scents.',
    imageUrl: '/images/catalog/homemade-soaps.webp',
    featured: true,
    sortOrder: 15,
    types: ['SOAP']
  },
  {
    slug: 'moss',
    title: 'Moss',
    tagline: 'Natural texture for creative projects',
    description: 'Cushions and sheets of moss for terrariums, planters and table settings.',
    imageUrl: '/images/catalog/moss.webp',
    featured: true,
    sortOrder: 16,
    keywords: ['moss']
  },
  {
    slug: 'driftwood',
    title: 'Driftwood',
    tagline: 'One-of-a-kind natural forms',
    description: 'Weathered wood for mounting air plants and building terrarium landscapes.',
    imageUrl: '/images/catalog/driftwood.webp',
    featured: true,
    sortOrder: 17,
    keywords: ['driftwood', 'wood']
  },
  {
    slug: 'apothecary',
    title: 'Apothecary',
    tagline: 'Thoughtful botanical goods and rituals',
    description: 'Lotions, salves and botanical blends for slow, ordinary evenings.',
    imageUrl: '/images/catalog/apothecary.webp',
    featured: true,
    sortOrder: 18,
    types: ['LOTION'],
    keywords: ['lotion', 'salve', 'balm', 'tincture', 'essential oil', 'tea']
  },
  {
    slug: 'terrarium-supplies',
    title: 'Terrarium Supplies',
    tagline: 'Everything for a tiny living world',
    description: 'Substrate, charcoal, gravel and glass for building a terrarium that lasts.',
    imageUrl: '/images/catalog/terrarium-supplies.webp',
    featured: true,
    sortOrder: 19,
    keywords: ['terrarium', 'substrate', 'gravel', 'charcoal', 'potting mix', 'soil']
  }
];

async function main() {
  const products = await db.product.findMany({
    select: { id: true, name: true, slug: true, type: true }
  });

  let created = 0;
  let linked = 0;

  for (const seed of collections) {
    const existing = await db.collection.findUnique({
      where: { slug: seed.slug },
      select: { id: true }
    });

    if (existing) continue;

    const collection =
      (await db.collection.create({
        data: {
          slug: seed.slug,
          title: seed.title,
          tagline: seed.tagline,
          description: seed.description,
          imageUrl: seed.imageUrl,
          featured: seed.featured,
          sortOrder: seed.sortOrder
        },
      }));

    created += 1;

    /**
     * Memberships are seeded once, when the collection row is first created.
     * Re-matching on every deploy would undo the owner's merchandising: a product
     * they deliberately removed would keep reappearing because it still matches
     * the seed's keywords.
     */
    const matches = products.filter((product) => {
      const haystack = `${product.name} ${product.slug}`.toLowerCase();
      const byType = seed.types?.includes(product.type);
      const byKeyword = seed.keywords?.some((keyword) => haystack.includes(keyword));
      return Boolean(byType || byKeyword);
    });

    if (matches.length) {
      await db.collection.update({
        where: { id: collection.id },
        data: { products: { connect: matches.map((product) => ({ id: product.id })) } }
      });
      linked += matches.length;
    }
  }

  console.log(`Collections ready: ${created} created, ${linked} product links added.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
