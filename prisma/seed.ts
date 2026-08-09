import { PrismaClient, ProductType } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const products = [
    {
      name: 'Monstera Deliciosa',
      slug: 'monstera-deliciosa',
      sku: 'HG-PLANT-MONSTERA',
      shortDescription: 'A bold tropical statement plant with iconic split leaves.',
      description: 'A bold, easygoing tropical with iconic split leaves. Each plant is selected and potted with care so it is ready to settle into its new home.',
      details: 'Nursery-grown houseplant in a decorative planter. Plant size and leaf pattern naturally vary.',
      careNotes: 'Bright, indirect light. Water when the top two inches of soil feel dry.',
      shippingNote: 'Plants are carefully secured for transit. Local pickup may be recommended during extreme temperatures.',
      type: ProductType.PLANT,
      priceCents: 3800,
      compareAtCents: null,
      inventory: 8,
      imageUrl: 'https://images.unsplash.com/photo-1614594575810-51b862c2d7b6?auto=format&fit=crop&w=1200&q=85',
      badge: 'Tammy’s pick',
      featured: true,
      sortOrder: 1
    },
    {
      name: 'Golden Pothos',
      slug: 'golden-pothos',
      sku: 'HG-PLANT-POTHOS',
      shortDescription: 'A forgiving trailing plant for shelves and hanging planters.',
      description: 'Golden pothos is a dependable favorite for new and experienced plant keepers alike. Its trailing vines bring easy color and texture to almost any room.',
      details: 'Healthy rooted plant in a decorative nursery planter. Every plant has its own natural shape.',
      careNotes: 'Low to bright indirect light. Let the top one to two inches of soil dry before watering.',
      shippingNote: 'Packed to protect foliage and soil during transit.',
      type: ProductType.PLANT,
      priceCents: 2400,
      compareAtCents: null,
      inventory: 12,
      imageUrl: 'https://images.unsplash.com/photo-1593691509543-c55fb32e5cee?auto=format&fit=crop&w=1200&q=85',
      badge: 'Beginner friendly',
      featured: true,
      sortOrder: 2
    },
    {
      name: 'Hillside Calm Tea',
      slug: 'hillside-calm-tea',
      sku: 'HG-TEA-CALM',
      shortDescription: 'A soothing loose-leaf botanical blend for slow evenings.',
      description: 'A comforting small-batch tea blend created for an unrushed evening ritual. Steep, settle in and enjoy a quieter moment.',
      details: 'Loose-leaf botanical tea. Store sealed in a cool, dry place. Ingredient and allergen information should be added before public sale.',
      careNotes: null,
      shippingNote: 'Ships in protective, food-safe packaging.',
      type: ProductType.TEA,
      priceCents: 1600,
      compareAtCents: null,
      inventory: 20,
      imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1200&q=85',
      badge: 'Small batch',
      featured: true,
      sortOrder: 3
    },
    {
      name: 'Stainless Tea Infuser',
      slug: 'stainless-tea-infuser',
      sku: 'HG-TEA-INFUSER',
      shortDescription: 'A reusable infuser sized for an everyday mug.',
      description: 'A simple, durable infuser that gives loose tea room to open while keeping leaves out of your cup.',
      details: 'Reusable stainless-steel basket infuser with resting lid.',
      careNotes: null,
      shippingNote: 'Ships with tea and botanical orders.',
      type: ProductType.TEA_SUPPLY,
      priceCents: 1200,
      compareAtCents: null,
      inventory: 24,
      imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1200&q=85',
      badge: null,
      featured: false,
      sortOrder: 4
    },
    {
      name: 'Garden Herb Soap',
      slug: 'garden-herb-soap',
      sku: 'HG-SOAP-HERB',
      shortDescription: 'Small-batch handmade soap with a fresh garden-inspired scent.',
      description: 'A handcrafted bar inspired by the clean, green scent of a garden after rain.',
      details: 'Handmade in small batches. Final ingredient list and net weight should be entered before public sale.',
      careNotes: null,
      shippingNote: 'Keep dry between uses to extend the life of the bar.',
      type: ProductType.SOAP,
      priceCents: 900,
      compareAtCents: null,
      inventory: 18,
      imageUrl: 'https://images.unsplash.com/photo-1607006483225-3f4b5308f95d?auto=format&fit=crop&w=1200&q=85',
      badge: 'Handmade',
      featured: false,
      sortOrder: 5
    },
    {
      name: 'Botanical Hand Lotion',
      slug: 'botanical-hand-lotion',
      sku: 'HG-LOTION-BOTANICAL',
      shortDescription: 'Rich everyday moisture with a light botanical finish.',
      description: 'A small-batch hand lotion designed to feel comforting and absorb cleanly into dry hands.',
      details: 'Handmade body-care product. Final ingredient list, net contents and use directions should be entered before public sale.',
      careNotes: null,
      shippingNote: 'Protect from excessive heat and freezing.',
      type: ProductType.LOTION,
      priceCents: 1800,
      compareAtCents: null,
      inventory: 15,
      imageUrl: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1200&q=85',
      badge: 'Handmade',
      featured: false,
      sortOrder: 6
    }
  ];

  for (const product of products) {
    await db.product.upsert({
      where: { slug: product.slug },
      update: product,
      create: product
    });
  }

  const sheets = [
    {
      plantName: 'Monstera Deliciosa',
      slug: 'monstera-deliciosa',
      botanical: 'Monstera deliciosa',
      summary: 'Iconic tropical foliage that rewards bright filtered light and a little room to climb.',
      light: 'Bright, indirect light',
      water: 'Water when the top 2 inches are dry',
      humidity: 'Average to high',
      soil: 'Airy indoor potting mix with added bark or perlite',
      feeding: 'Monthly in spring and summer',
      temperature: '65–85°F',
      petSafety: 'Toxic if chewed',
      tips: 'Rotate regularly and give a mature plant a moss pole or other sturdy support.',
      imageUrl: 'https://images.unsplash.com/photo-1614594575810-51b862c2d7b6?auto=format&fit=crop&w=1200&q=85'
    },
    {
      plantName: 'Golden Pothos',
      slug: 'golden-pothos',
      botanical: 'Epipremnum aureum',
      summary: 'A forgiving trailing classic and one of Tammy’s favorite beginner houseplants.',
      light: 'Low to bright indirect light',
      water: 'Let the top 1–2 inches dry',
      humidity: 'Average household humidity',
      soil: 'Well-draining houseplant mix',
      feeding: 'Monthly during active growth',
      temperature: '60–85°F',
      petSafety: 'Toxic if chewed',
      tips: 'Trim vines just above a node to encourage fuller growth and root the cuttings in water.',
      imageUrl: 'https://images.unsplash.com/photo-1593691509543-c55fb32e5cee?auto=format&fit=crop&w=1200&q=85'
    },
    {
      plantName: 'Snake Plant',
      slug: 'snake-plant',
      botanical: 'Dracaena trifasciata',
      summary: 'Architectural, drought-tolerant and very forgiving when given excellent drainage.',
      light: 'Low to bright indirect light',
      water: 'Let the soil dry fully',
      humidity: 'Average to dry',
      soil: 'Fast-draining succulent-style mix',
      feeding: 'Lightly in spring and summer',
      temperature: '60–85°F',
      petSafety: 'Mildly toxic if eaten',
      tips: 'Too much water is the biggest risk. When in doubt, wait a little longer.',
      imageUrl: 'https://images.unsplash.com/photo-1593482892290-f54927ae2bb0?auto=format&fit=crop&w=1200&q=85'
    },
    {
      plantName: 'ZZ Plant',
      slug: 'zz-plant',
      botanical: 'Zamioculcas zamiifolia',
      summary: 'Glossy foliage and exceptional tolerance for missed waterings and lower light.',
      light: 'Low to bright indirect light',
      water: 'Allow most of the pot to dry',
      humidity: 'Average household humidity',
      soil: 'Well-draining indoor mix',
      feeding: 'Every 6–8 weeks in the growing season',
      temperature: '60–80°F',
      petSafety: 'Toxic if chewed',
      tips: 'Use a pot with drainage and resist the urge to water on a rigid schedule.',
      imageUrl: 'https://images.unsplash.com/photo-1632207691143-643e2a9a9361?auto=format&fit=crop&w=1200&q=85'
    },
    {
      plantName: 'Peace Lily',
      slug: 'peace-lily',
      botanical: 'Spathiphyllum',
      summary: 'Elegant deep-green foliage and white blooms with clear thirst signals.',
      light: 'Medium to bright indirect light',
      water: 'Keep lightly moist, never soggy',
      humidity: 'Prefers higher humidity',
      soil: 'Rich but well-draining mix',
      feeding: 'Monthly from spring through summer',
      temperature: '65–80°F',
      petSafety: 'Toxic to pets',
      tips: 'Filtered water can help reduce brown leaf tips in homes with hard tap water.',
      imageUrl: 'https://images.unsplash.com/photo-1593691509543-c55fb32e5cee?auto=format&fit=crop&w=1200&q=85'
    },
    {
      plantName: 'Spider Plant',
      slug: 'spider-plant',
      botanical: 'Chlorophytum comosum',
      summary: 'Cheerful arching foliage with baby plantlets that are simple to propagate.',
      light: 'Medium to bright indirect light',
      water: 'Water when the top inch dries',
      humidity: 'Average household humidity',
      soil: 'Standard houseplant mix',
      feeding: 'Monthly in spring and summer',
      temperature: '60–80°F',
      petSafety: 'Generally considered non-toxic',
      tips: 'Root the plantlets in water or pin them directly into a small pot of moist soil.',
      imageUrl: 'https://images.unsplash.com/photo-1572688484438-313a6e50c333?auto=format&fit=crop&w=1200&q=85'
    }
  ];

  for (const sheet of sheets) {
    await db.careSheet.upsert({
      where: { slug: sheet.slug },
      update: sheet,
      create: sheet
    });
  }

  const classDate = new Date();
  classDate.setDate(classDate.getDate() + 28);
  classDate.setHours(18, 0, 0, 0);

  await db.classEvent.upsert({
    where: { slug: 'build-a-beautiful-planter' },
    update: {
      title: 'Build a Beautiful Planter',
      description: 'Tammy guides you through choosing compatible plants, balancing color and texture, potting correctly and caring for your finished arrangement.',
      startsAt: classDate,
      location: 'The Hillside Gardens',
      priceCents: 4500,
      capacity: 12,
      durationMinutes: 90,
      whatToBring: 'Just yourself. Plants, potting materials and tools are included.',
      active: true,
      imageUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=85'
    },
    create: {
      slug: 'build-a-beautiful-planter',
      title: 'Build a Beautiful Planter',
      description: 'Tammy guides you through choosing compatible plants, balancing color and texture, potting correctly and caring for your finished arrangement.',
      startsAt: classDate,
      location: 'The Hillside Gardens',
      priceCents: 4500,
      capacity: 12,
      durationMinutes: 90,
      whatToBring: 'Just yourself. Plants, potting materials and tools are included.',
      active: true,
      imageUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=85'
    }
  });

  const gallery = [
    {
      id: 'seed-gallery-porch',
      title: 'Layered porch planter',
      imageUrl: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1200&q=85',
      caption: 'A balanced mix of height, soft texture and trailing growth.',
      sortOrder: 1
    },
    {
      id: 'seed-gallery-foliage',
      title: 'Soft greens and texture',
      imageUrl: 'https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1200&q=85',
      caption: 'A foliage-first arrangement designed to stay interesting all season.',
      sortOrder: 2
    },
    {
      id: 'seed-gallery-patio',
      title: 'Patio color story',
      imageUrl: 'https://images.unsplash.com/photo-1509423350716-97f2360af8e4?auto=format&fit=crop&w=1200&q=85',
      caption: 'Color repeated in a simple, cohesive container combination.',
      sortOrder: 3
    }
  ];

  for (const item of gallery) {
    await db.galleryItem.upsert({ where: { id: item.id }, update: item, create: item });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
