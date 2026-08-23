import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

type SeedProduct = {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  featured: boolean;
};

type Seed = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  imageUrl: string;
  featured: boolean;
  sortOrder: number;
  /**
   * Which products join when the collection row is first created. Left off for
   * the collections only Tammy can judge — nothing in the database knows which
   * plants are pet safe until she says so, and a guess would be worse than an
   * empty shelf, because an empty collection is hidden and a wrong one is not.
   */
  match?: (product: SeedProduct) => boolean;
};

/**
 * Collections are the *curated* axis of the shop, and categories are the
 * structural one. A category says what a thing is — Houseplants, Tea, Driftwood
 * & Natural Materials — and every product has exactly one. A collection says
 * why you might want it, and a product joins as many as apply: a golden pothos
 * is one houseplant that is also beginner friendly, happy in low light, and
 * under thirty dollars.
 *
 * That is why the collections seeded here no longer restate the taxonomy. They
 * used to — "Plants", "Teas & Herbals", "Botanicals", "House Plants" — which
 * meant the shop had two navigations that disagreed about the same shelf.
 * Existing rows are left exactly as they are; this list is only what a database
 * without them is given.
 */
const collections: Seed[] = [
  {
    slug: 'beginner-friendly',
    title: 'Beginner Friendly',
    tagline: 'Forgiving plants for a first windowsill',
    description:
      'Plants that put up with a missed watering and a less-than-perfect window — the ones we hand to somebody who says they kill everything.',
    imageUrl: '/images/catalog/house-plants.webp',
    featured: true,
    sortOrder: 10
  },
  {
    slug: 'low-light',
    title: 'Low Light',
    tagline: 'For north windows and shaded corners',
    description:
      'Plants that keep their colour away from a bright window, for offices, hallways and rooms that never get direct sun.',
    imageUrl: '/images/catalog/house-plants.webp',
    featured: true,
    sortOrder: 20
  },
  {
    slug: 'pet-friendly',
    title: 'Pet Friendly',
    tagline: 'Non-toxic to cats and dogs',
    description:
      'Plants that are not known to be toxic to cats and dogs, for homes where something will eventually be chewed.',
    imageUrl: '/images/catalog/air-plants.webp',
    featured: true,
    sortOrder: 30
  },
  {
    slug: 'tammys-favorites',
    title: 'Tammy’s Favorites',
    tagline: 'The pieces she keeps for herself',
    description:
      'What Tammy is most pleased with on the bench right now — the plants, blends and small-batch goods she would take home.',
    imageUrl: '/images/scenes/potting-bench.webp',
    featured: true,
    sortOrder: 40,
    match: (product) => product.featured
  },
  {
    slug: 'gifts-under-30',
    title: 'Gifts Under $30',
    tagline: 'Something thoughtful, easily',
    description:
      'Plants and handmade goods under thirty dollars, for a housewarming, a thank you or a Tuesday.',
    imageUrl: '/images/catalog/homemade-soaps.webp',
    featured: true,
    sortOrder: 50,
    match: (product) => product.priceCents > 0 && product.priceCents <= 3000
  }
];

async function main() {
  const products = await db.product.findMany({
    select: { id: true, name: true, slug: true, priceCents: true, featured: true }
  });

  let created = 0;
  let linked = 0;

  for (const seed of collections) {
    const existing = await db.collection.findUnique({
      where: { slug: seed.slug },
      select: { id: true }
    });

    if (existing) continue;

    const collection = await db.collection.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        tagline: seed.tagline,
        description: seed.description,
        imageUrl: seed.imageUrl,
        featured: seed.featured,
        sortOrder: seed.sortOrder
      }
    });

    created += 1;

    /**
     * Memberships are seeded once, when the collection row is first created.
     * Re-matching on every deploy would undo the owner's merchandising: a
     * product she deliberately removed would keep reappearing because it still
     * costs less than thirty dollars.
     */
    const matches = seed.match ? products.filter(seed.match) : [];

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
