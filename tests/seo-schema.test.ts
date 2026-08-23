import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  breadcrumbJsonLd,
  businessRef,
  collectionPageJsonLd,
  faqJsonLd,
  productJsonLd,
  productOffers
} from '../lib/seo.ts';

const base = {
  slug: 'golden-pothos',
  type: 'PLANT',
  sku: 'HG-POTHOS',
  ships: true,
  inventory: 5,
  priceCents: 1800
};

describe('productOffers', () => {
  it('publishes one Offer for a product sold one way', () => {
    const offers = productOffers({ ...base, sizes: [] });
    assert.equal(offers.length, 1);
    assert.equal(offers[0].price, '18.00');
    assert.equal(offers[0].availability, 'https://schema.org/InStock');
    assert.equal(offers[0].sku, 'HG-POTHOS');
  });

  /**
   * The regression this exists for: a multi-size product used to publish a
   * single AggregateOffer carrying one `availability`, so a sold-out 6" pot was
   * advertised as in stock at the 4" pot's price.
   */
  it('publishes one Offer per size, each with its own price', () => {
    const offers = productOffers({
      ...base,
      sizes: [
        { label: '4" pot', priceCents: 1800, inventory: 6 },
        { label: '6" pot', priceCents: 2400, inventory: 2 }
      ]
    });
    assert.deepEqual(
      offers.map((offer) => offer.price),
      ['18.00', '24.00']
    );
    assert.deepEqual(
      offers.map((offer) => offer.name),
      ['4" pot', '6" pot']
    );
  });

  it('marks only the sold-out size out of stock when sizes are counted separately', () => {
    const offers = productOffers({
      ...base,
      inventory: 6,
      sizes: [
        { label: '4" pot', priceCents: 1800, inventory: 6 },
        { label: '6" pot', priceCents: 2400, inventory: 0 }
      ]
    });
    assert.deepEqual(
      offers.map((offer) => offer.availability),
      ['https://schema.org/InStock', 'https://schema.org/OutOfStock']
    );
  });

  it('falls back to the product total when the sizes share one shelf', () => {
    const offers = productOffers({
      ...base,
      inventory: 0,
      sizes: [
        { label: 'Small', priceCents: 1800, inventory: null },
        { label: 'Large', priceCents: 2400, inventory: null }
      ]
    });
    assert.deepEqual(
      offers.map((offer) => offer.availability),
      ['https://schema.org/OutOfStock', 'https://schema.org/OutOfStock']
    );
  });

  it('gives each size a distinguishable sku when the product has one', () => {
    const offers = productOffers({
      ...base,
      sizes: [{ label: '6" pot', priceCents: 2400, inventory: 1 }]
    });
    assert.equal(offers[0].sku, 'HG-POTHOS-6"-pot');
  });

  it('advertises no shipping terms for a pickup-only product', () => {
    const [offer] = productOffers({ ...base, ships: false, sizes: [] });
    assert.equal('shippingDetails' in offer, false);
    // The return policy still applies: it is about the sale, not the delivery.
    assert.ok(offer.hasMerchantReturnPolicy);
  });

  it('does not promise a return window the published policy refuses', () => {
    const [plant] = productOffers({ ...base, sizes: [] });
    const [soap] = productOffers({ ...base, type: 'SOAP', sizes: [] });
    assert.equal(
      plant.hasMerchantReturnPolicy.returnPolicyCategory,
      'https://schema.org/MerchantReturnNotPermitted'
    );
    assert.equal(
      soap.hasMerchantReturnPolicy.returnPolicyCategory,
      'https://schema.org/MerchantReturnFiniteReturnWindow'
    );
  });

  it('points every offer at the one business node rather than describing it again', () => {
    const [offer] = productOffers({ ...base, sizes: [] });
    assert.deepEqual(offer.seller, { '@id': businessRef() });
  });
});

describe('productJsonLd', () => {
  const product = {
    name: 'Golden Pothos',
    slug: 'golden-pothos',
    sku: 'HG-POTHOS',
    botanical: 'Epipremnum aureum',
    shortDescription: 'A trailing plant.',
    description: 'Long easy vines.',
    imageUrl: '/images/catalog/house-plants.webp',
    galleryImages: []
  };
  const offers = productOffers({ ...base, sizes: [] });

  it('omits the rating entirely when nothing has been reviewed', () => {
    const schema = productJsonLd({
      product,
      offers,
      rating: { average: 0, count: 0 },
      reviews: []
    });
    assert.equal('aggregateRating' in schema, false);
    assert.equal('review' in schema, false);
  });

  it('publishes the rating and the reviews behind it together', () => {
    const schema = productJsonLd({
      product,
      offers,
      rating: { average: 4.5, count: 2 },
      reviews: [
        { authorName: 'Dana', createdAt: '2026-01-05T00:00:00Z', body: 'Lovely.', rating: 5 },
        {
          authorName: 'Sam',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          title: 'Good',
          body: 'Arrived well.',
          rating: 4
        }
      ]
    });
    assert.equal(schema.aggregateRating?.ratingValue, 4.5);
    assert.equal(schema.aggregateRating?.reviewCount, 2);
    assert.equal(schema.review?.length, 2);
    assert.equal(schema.review?.[0].datePublished, '2026-01-05');
    assert.equal(schema.review?.[1].name, 'Good');
  });

  it('caps how many reviews the markup republishes', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      authorName: `Reviewer ${index}`,
      createdAt: '2026-01-05T00:00:00Z',
      body: 'Good.',
      rating: 5
    }));
    const schema = productJsonLd({
      product,
      offers,
      rating: { average: 5, count: 9 },
      reviews: many
    });
    assert.equal(schema.review?.length, 5);
  });

  it('carries the Latin name as an alternate name rather than a second product', () => {
    const schema = productJsonLd({
      product,
      offers,
      rating: { average: 0, count: 0 },
      reviews: []
    });
    assert.equal(schema.alternateName, 'Epipremnum aureum');
    assert.equal(schema['@type'], 'Product');
  });

  it('unwraps a single offer and keeps an array of them for a sized product', () => {
    const one = productJsonLd({ product, offers, rating: { average: 0, count: 0 }, reviews: [] });
    assert.equal(Array.isArray(one.offers), false);

    const sized = productJsonLd({
      product,
      offers: productOffers({
        ...base,
        sizes: [
          { label: 'Small', priceCents: 1800, inventory: 2 },
          { label: 'Large', priceCents: 2400, inventory: 1 }
        ]
      }),
      rating: { average: 0, count: 0 },
      reviews: []
    });
    assert.equal(Array.isArray(sized.offers), true);
  });
});

describe('faqJsonLd', () => {
  it('publishes nothing at all when a page has no questions', () => {
    assert.equal(faqJsonLd('/collections/moss', []), null);
    assert.equal(faqJsonLd('/collections/moss', [{ question: 'Anything?', answer: '  ' }]), null);
  });

  it('gives each page its own FAQ node so two pages are not one document', () => {
    const one = faqJsonLd('/faq', [{ question: 'Do you ship?', answer: 'Yes.' }]);
    const two = faqJsonLd('/visit', [{ question: 'Where are you?', answer: 'Ebensburg.' }]);
    assert.notEqual(one?.['@id'], two?.['@id']);
    assert.equal(one?.mainEntity.length, 1);
    assert.equal(one?.mainEntity[0].acceptedAnswer.text, 'Yes.');
  });
});

describe('collectionPageJsonLd', () => {
  it('lists the products by name and URL, without repeating their prices', () => {
    const schema = collectionPageJsonLd({
      path: '/collections/succulents',
      name: 'Succulents',
      description: 'Bright-window plants.',
      products: [
        { slug: 'jade', name: 'Jade' },
        { slug: 'haworthia', name: 'Haworthia' }
      ]
    });
    assert.equal(schema.mainEntity?.numberOfItems, 2);
    assert.equal(schema.mainEntity?.itemListElement[0].position, 1);
    assert.match(String(schema.mainEntity?.itemListElement[0].url), /\/shop\/jade$/);
    assert.equal(JSON.stringify(schema).includes('price'), false);
  });

  it('leaves the list out of a category with nothing in stock', () => {
    const schema = collectionPageJsonLd({
      path: '/collections/moss',
      name: 'Moss',
      products: []
    });
    assert.equal('mainEntity' in schema, false);
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers the trail from one and makes every step absolute', () => {
    const schema = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Shop', path: '/shop' }
    ]);
    assert.deepEqual(
      schema.itemListElement.map((step) => step.position),
      [1, 2]
    );
    assert.match(schema.itemListElement[1].item, /^https:\/\/.+\/shop$/);
  });
});
