import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL ||= 'https://thehillsidegardens.com';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@127.0.0.1:5432/hillside_test';

const {
  checkoutAdjustmentNotice,
  checkoutAdjustments,
  encodeCheckoutItems,
  parseCheckoutItems,
  readCheckoutItems,
  stripeProductDescription,
  stripeProductImages,
  stripeCheckoutItemsMetadata,
  STRIPE_METADATA_VALUE_MAX
} = await import('../lib/checkout-format.ts');

describe('readCheckoutItems', () => {
  it('merges duplicate slugs and caps quantity at 20', () => {
    const items = readCheckoutItems({
      items: [
        { id: 'monstera', quantity: 12 },
        { id: 'monstera', quantity: 15 },
        { id: 'tea', quantity: 2, priceCents: 1200 }
      ]
    });
    assert.deepEqual(items, [
      { id: 'monstera', quantity: 20 },
      { id: 'tea', quantity: 2, priceCents: 1200 }
    ]);
  });

  it('ignores empty and non-object payloads', () => {
    assert.deepEqual(readCheckoutItems(null), []);
    assert.deepEqual(readCheckoutItems({ items: 'nope' }), []);
    assert.deepEqual(readCheckoutItems({ items: [{ quantity: 2 }] }), []);
  });

  it('keeps two sizes of one product apart, and merges each with itself', () => {
    const items = readCheckoutItems({
      items: [
        { id: 'monstera', size: '4" pot', quantity: 1 },
        { id: 'monstera', size: '6" pot', quantity: 2 },
        { id: 'monstera', size: '4" pot', quantity: 3 }
      ]
    });
    assert.deepEqual(items, [
      { id: 'monstera', size: '4" pot', quantity: 4 },
      { id: 'monstera', size: '6" pot', quantity: 2 }
    ]);
  });
});

describe('checkoutAdjustments', () => {
  const sized = [
    {
      slug: 'lotion',
      name: 'Hillside lotion',
      inventory: 3,
      priceCents: 1200,
      sizes: [{ label: '2 oz' }, { label: '8 oz', priceCents: 2600 }]
    }
  ];

  const catalog = [
    { slug: 'monstera', name: 'Monstera', inventory: 2, priceCents: 4500 },
    { slug: 'tea', name: 'Hillside tea', inventory: 10, priceCents: 1800 }
  ];

  it('reports stock, price and unavailable separately', () => {
    const changes = checkoutAdjustments(
      [
        { id: 'monstera', quantity: 4 },
        { id: 'tea', quantity: 1, priceCents: 1200 },
        { id: 'gone', quantity: 1 }
      ],
      catalog
    );
    assert.equal(changes.length, 3);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 2);
    assert.equal(changes[1].reason, 'price');
    assert.equal(changes[1].priceCents, 1800);
    assert.equal(changes[2].reason, 'unavailable');
  });

  it('is quiet when the basket already matches the shelf', () => {
    assert.deepEqual(
      checkoutAdjustments([{ id: 'tea', quantity: 2, priceCents: 1800 }], catalog),
      []
    );
  });

  it('charges the chosen size, and reports a basket holding a stale one', () => {
    assert.deepEqual(
      checkoutAdjustments([{ id: 'lotion', size: '8 oz', quantity: 1, priceCents: 2600 }], sized),
      []
    );

    const changes = checkoutAdjustments(
      [{ id: 'lotion', size: '8 oz', quantity: 1, priceCents: 1200 }],
      sized
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'price');
    assert.equal(changes[0].priceCents, 2600);
    assert.equal(changes[0].size, '8 oz');
    assert.equal(changes[0].name, 'Hillside lotion — 8 oz');
  });

  it('sends back a size we no longer sell rather than picking one', () => {
    for (const requested of [
      { id: 'lotion', size: '4 oz', quantity: 1 },
      { id: 'lotion', quantity: 1 }
    ]) {
      const changes = checkoutAdjustments([requested], sized);
      assert.equal(changes.length, 1);
      assert.equal(changes[0].reason, 'size');
      assert.equal(changes[0].available, 0);
      assert.match(checkoutAdjustmentNotice(changes[0]), /no longer sold in that size/);
    }
  });

  it('still refuses a stale size after the owner clears the whole list', () => {
    const cleared = [{ slug: 'lotion', name: 'Hillside lotion', inventory: 3, priceCents: 1200 }];
    const changes = checkoutAdjustments(
      // Priced the same as the base, so a price adjustment would not catch it.
      [{ id: 'lotion', size: '2 oz', quantity: 1, priceCents: 1200 }],
      cleared
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'size');

    // A product that was always sold one way is untouched by that rule.
    assert.deepEqual(checkoutAdjustments([{ id: 'lotion', quantity: 1 }], cleared), []);
  });

  it('meters each counted size on its own shelf', () => {
    // Two 4" pots and one 6" left. A basket taking the last of each is fine,
    // where one pooled count of three would have refused the second line.
    const perSize = [
      {
        slug: 'monstera',
        name: 'Monstera',
        inventory: 3,
        priceCents: 4500,
        sizes: [
          { label: '4" pot', inventory: 2 },
          { label: '6" pot', priceCents: 6500, inventory: 1 }
        ]
      }
    ];

    assert.deepEqual(
      checkoutAdjustments(
        [
          { id: 'monstera', size: '4" pot', quantity: 2, priceCents: 4500 },
          { id: 'monstera', size: '6" pot', quantity: 1, priceCents: 6500 }
        ],
        perSize
      ),
      []
    );

    // The plant has three altogether, but only one of them is a 6" pot.
    const changes = checkoutAdjustments(
      [{ id: 'monstera', size: '6" pot', quantity: 2, priceCents: 6500 }],
      perSize
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 1);
    assert.match(checkoutAdjustmentNotice(changes[0]), /Only 1 of Monstera — 6" pot left/);
  });

  it('still spends a counted size line by line', () => {
    const perSize = [
      {
        slug: 'monstera',
        name: 'Monstera',
        inventory: 2,
        priceCents: 4500,
        sizes: [{ label: '4" pot', inventory: 2 }]
      }
    ];
    // Two lines of the same size draw on the same two pots, not two each.
    const changes = checkoutAdjustments(
      [
        { id: 'monstera', size: '4" pot', quantity: 2, priceCents: 4500 },
        { id: 'monstera', size: '4"  POT', quantity: 1, priceCents: 4500 }
      ],
      perSize
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 0);
  });

  it('sells nothing of a size the owner counted down to none', () => {
    const changes = checkoutAdjustments(
      [{ id: 'lotion', size: '8 oz', quantity: 1, priceCents: 2600 }],
      [
        {
          slug: 'lotion',
          name: 'Hillside lotion',
          inventory: 4,
          priceCents: 1200,
          sizes: [
            { label: '2 oz', inventory: 4 },
            { label: '8 oz', priceCents: 2600, inventory: 0 }
          ]
        }
      ]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 0);
    assert.match(checkoutAdjustmentNotice(changes[0]), /sold out and was removed/);
  });

  it('spends one stock count across every size of a product', () => {
    // Three jars on the bench, four asked for across two sizes.
    const changes = checkoutAdjustments(
      [
        { id: 'lotion', size: '2 oz', quantity: 2 },
        { id: 'lotion', size: '8 oz', quantity: 2 }
      ],
      sized
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].size, '8 oz');
    assert.equal(changes[0].available, 1);
    assert.match(checkoutAdjustmentNotice(changes[0]), /Only 1 of Hillside lotion — 8 oz left/);
  });

  it('names an archived product instead of calling it sold out', () => {
    const changes = checkoutAdjustments(
      [{ id: 'monstera', quantity: 1 }],
      [
        {
          slug: 'monstera',
          name: 'Monstera Deliciosa',
          inventory: 4,
          priceCents: 4500,
          active: false
        }
      ]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'unavailable');
    assert.equal(changes[0].name, 'Monstera Deliciosa');
    assert.match(checkoutAdjustmentNotice(changes[0]), /Monstera Deliciosa is no longer available/);
    assert.doesNotMatch(checkoutAdjustmentNotice(changes[0]), /sold out/);
  });
});

describe('checkoutAdjustments for bundles', () => {
  const tea = {
    id: 'p-tea',
    slug: 'calm-tea',
    name: 'Hillside Calm Tea',
    active: true,
    priceCents: 1800,
    inventory: 4
  };
  const infuser = {
    id: 'p-infuser',
    slug: 'stainless-infuser',
    name: 'Stainless infuser',
    active: true,
    priceCents: 1400,
    inventory: 2
  };
  const set = {
    slug: 'tea-starter-set',
    title: 'Tea Starter Set',
    priceCents: 2800,
    active: true,
    items: [
      { quantity: 1, product: tea },
      { quantity: 1, product: infuser }
    ]
  };
  const shelf = [
    { slug: tea.slug, name: tea.name, inventory: tea.inventory, priceCents: tea.priceCents },
    {
      slug: infuser.slug,
      name: infuser.name,
      inventory: infuser.inventory,
      priceCents: infuser.priceCents
    }
  ];

  it('passes a set the bench can build', () => {
    assert.deepEqual(
      checkoutAdjustments(
        [{ id: 'tea-starter-set', kind: 'bundle', quantity: 2, priceCents: 2800 }],
        shelf,
        [set]
      ),
      []
    );
  });

  it('caps the line at the fewest sets a component can supply', () => {
    const changes = checkoutAdjustments(
      [{ id: 'tea-starter-set', kind: 'bundle', quantity: 3, priceCents: 2800 }],
      shelf,
      [set]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 2);
    assert.equal(changes[0].name, 'Tea Starter Set');
  });

  it('charges the set’s own price, never the basket’s', () => {
    const changes = checkoutAdjustments(
      [{ id: 'tea-starter-set', kind: 'bundle', quantity: 1, priceCents: 1900 }],
      shelf,
      [set]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'price');
    assert.equal(changes[0].priceCents, 2800);
  });

  it('spends the same shelf a loose product beside it draws on', () => {
    // Two infusers on the bench. One goes in the set, so the loose line can
    // only have the other — checked on its own it would have claimed both.
    const changes = checkoutAdjustments(
      [
        { id: 'tea-starter-set', kind: 'bundle', quantity: 1, priceCents: 2800 },
        { id: 'stainless-infuser', quantity: 2, priceCents: 1400 }
      ],
      shelf,
      [set]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].slug, 'stainless-infuser');
    assert.equal(changes[0].available, 1);
  });

  it('refuses an archived set, and one whose recipe is empty', () => {
    for (const broken of [
      { ...set, active: false },
      { ...set, items: [] }
    ]) {
      const changes = checkoutAdjustments(
        [{ id: 'tea-starter-set', kind: 'bundle', quantity: 1 }],
        shelf,
        [broken]
      );
      assert.equal(changes.length, 1);
      assert.equal(changes[0].reason, 'unavailable');
    }
  });

  it('needs one jar per recipe line when both draw on one pile', () => {
    /**
     * A lotion sold in two sizes off one shelf. Metered line by line, a single
     * jar answered "one set available" to a recipe needing one of each — and the
     * reservation then failed against a correction repeating the same number.
     */
    const lotion = {
      id: 'p-lotion',
      slug: 'lotion',
      name: 'Lotion',
      active: true,
      priceCents: 1200,
      inventory: 1,
      sizes: [{ label: '2 oz' }, { label: '8 oz' }]
    };
    const gift = {
      slug: 'gift-box',
      title: 'Gift Box',
      priceCents: 2000,
      active: true,
      items: [
        { quantity: 1, size: '2 oz', product: lotion },
        { quantity: 1, size: '8 oz', product: lotion }
      ]
    };
    const oneJar = [
      { slug: 'lotion', name: 'Lotion', inventory: 1, priceCents: 1200, sizes: lotion.sizes }
    ];
    const changes = checkoutAdjustments(
      [{ id: 'gift-box', kind: 'bundle', quantity: 1, priceCents: 2000 }],
      oneJar,
      [gift]
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, 'stock');
    assert.equal(changes[0].available, 0);

    // Two jars build exactly one set.
    const twoJars = [{ ...oneJar[0], inventory: 2 }];
    assert.deepEqual(
      checkoutAdjustments(
        [{ id: 'gift-box', kind: 'bundle', quantity: 1, priceCents: 2000 }],
        twoJars,
        [
          {
            ...gift,
            items: gift.items.map((i) => ({ ...i, product: { ...lotion, inventory: 2 } }))
          }
        ]
      ),
      []
    );
  });

  it('keeps a set and a product that share a slug apart', () => {
    const twins = readCheckoutItems({
      items: [
        { id: 'calm-tea', quantity: 1 },
        { id: 'calm-tea', kind: 'bundle', quantity: 1 }
      ]
    });
    assert.equal(twins.length, 2);
    assert.equal(twins[0].kind, undefined);
    assert.equal(twins[1].kind, 'bundle');
  });
});

describe('Stripe product fields', () => {
  it('truncates descriptions to Stripe’s 500-character cap', () => {
    const long = 'Care note. '.repeat(80);
    const trimmed = stripeProductDescription(long);
    assert.ok(trimmed);
    assert.ok(trimmed.length <= 500);
    assert.match(trimmed, /\.\.\.$/);
  });

  it('omits empty descriptions rather than sending a blank string', () => {
    assert.equal(stripeProductDescription('   '), undefined);
    assert.equal(stripeProductDescription(null), undefined);
  });

  it('only advertises HTTPS images', () => {
    assert.deepEqual(stripeProductImages('https://cdn.example.com/plant.webp'), [
      'https://cdn.example.com/plant.webp'
    ]);
    assert.deepEqual(stripeProductImages('http://example.com/plant.webp'), []);
    assert.deepEqual(stripeProductImages('http://127.0.0.1/plant.webp'), []);
  });
});

describe('encode/parse checkout items', () => {
  it('round-trips and merges duplicate ids', () => {
    const encoded = encodeCheckoutItems([
      { product: { id: 'a' }, quantity: 2 },
      { product: { id: 'a' }, quantity: 3 },
      { product: { id: 'b' }, quantity: 1 }
    ]);
    assert.deepEqual(parseCheckoutItems(encoded), [
      { id: 'a', q: 5 },
      { id: 'b', q: 1 }
    ]);
  });

  it('carries the size, and merges only lines that share one', () => {
    const encoded = encodeCheckoutItems([
      { product: { id: 'a' }, quantity: 1, size: '2 oz' },
      { product: { id: 'a' }, quantity: 2, size: '8 oz' },
      { product: { id: 'a' }, quantity: 1, size: '2 oz' }
    ]);
    assert.deepEqual(parseCheckoutItems(encoded), [
      { id: 'a', s: '2 oz', q: 2 },
      { id: 'a', s: '8 oz', q: 2 }
    ]);
  });

  it('omits a sized snapshot whole rather than shortening it', () => {
    // Size labels make each line longer, so a sized basket reaches Stripe's cap
    // sooner. It is dropped rather than trimmed: the legacy path only checks
    // that it resolved as many lines as it parsed, so a short list would look
    // complete and record a paid order missing whatever had been cut.
    const line = (index: number) => ({
      product: { id: `cmf3k2j9x0000abcd1234ef${String(index).padStart(2, '0')}` },
      quantity: 1,
      size: '6" pot'
    });
    const many = Array.from({ length: 20 }, (_, index) => line(index));
    assert.ok(encodeCheckoutItems(many).length > STRIPE_METADATA_VALUE_MAX);
    assert.equal(stripeCheckoutItemsMetadata(many), undefined);

    const few = [line(0), line(1), line(2)];
    const snapshot = stripeCheckoutItemsMetadata(few);
    assert.ok(snapshot);
    assert.equal(parseCheckoutItems(snapshot).length, 3);
  });

  it('returns an empty list for garbage', () => {
    assert.deepEqual(parseCheckoutItems('not-json'), []);
    assert.deepEqual(parseCheckoutItems('{}'), []);
  });

  it('omits the Stripe metadata snapshot when it would exceed 500 characters', () => {
    const small = stripeCheckoutItemsMetadata([{ product: { id: 'a' }, quantity: 1 }]);
    assert.ok(small);
    assert.ok(small.length <= STRIPE_METADATA_VALUE_MAX);

    const bulky = stripeCheckoutItemsMetadata(
      Array.from({ length: 20 }, (_, index) => ({
        product: { id: `cuid_abcdefghijklmnopqrstuv${index}` },
        quantity: 1
      }))
    );
    assert.equal(bulky, undefined);
    assert.ok(
      encodeCheckoutItems(
        Array.from({ length: 20 }, (_, index) => ({
          product: { id: `cuid_abcdefghijklmnopqrstuv${index}` },
          quantity: 1
        }))
      ).length > STRIPE_METADATA_VALUE_MAX
    );
  });
});
