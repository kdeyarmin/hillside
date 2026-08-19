import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amazonPickDraft,
  amazonPickKey,
  canonicalAmazonUrl,
  categoryFromAmazonHtml,
  decodeEntities,
  descriptionFromAmazonHtml,
  extractAsin,
  fullSizeAmazonImage,
  imageFromAmazonHtml,
  isAmazonLink,
  isShortAmazonLink,
  looksLikeRobotCheck,
  parseAmazonProductHtml,
  titleFromAmazonHtml,
  titleFromAmazonUrl
} from '../lib/amazon-pick.ts';

/**
 * Trimmed from a real product page: the pieces the parser reads, in the markup
 * and the attribute order Amazon actually serves them in.
 */
const PRODUCT_PAGE = `<!DOCTYPE html><html><head>
<title>Amazon.com : Fiskars Bypass Pruning Shears, 5/8&quot; Cut Capacity : Patio, Lawn &amp; Garden</title>
<meta name="description" content="Shop Fiskars at the Amazon Gardening store." />
<meta property="og:title" content="Amazon.com : Fiskars Bypass Pruning Shears" />
<meta property="og:image" content="https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SX679_.jpg" />
<meta property="og:description" content="Free delivery and returns on eligible orders." />
</head><body>
<div id="wayfinding-breadcrumbs_feature_div"><ul>
<li><a class="a-link-normal a-color-tertiary" href="/patio">Patio, Lawn &amp; Garden</a></li>
<li><a class="a-link-normal a-color-tertiary" href="/tools">Gardening Tools</a></li>
<li><a class="a-link-normal a-color-tertiary" href="/shears">Pruning Shears</a></li>
</ul></div></div>
<span id="productTitle" class="a-size-large">  Fiskars Bypass Pruning Shears, 5/8&quot; Cut Capacity, Steel Blade  </span>
<div id="imgTagWrapperId"><img alt="Fiskars" id="landingImage"
  data-old-hires="https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SL1500_.jpg"
  src="https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SX466_.jpg"
  data-a-dynamic-image="{&quot;https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SX466_.jpg&quot;:[466,466],&quot;https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SL1500_.jpg&quot;:[1500,1500]}" /></div>
<div id="feature-bullets" class="a-section"><ul class="a-unordered-list">
<li><span class="a-list-item">Make sure this fits by entering your model number.</span></li>
<li><span class="a-list-item">Fully hardened, precision-ground steel blade stays sharp through heavy use</span></li>
<li><span class="a-list-item">Low-friction coating helps the blade glide through wood</span></li>
<li><span class="a-list-item">Full lifetime warranty</span></li>
</ul></div>
<script>window.stuff = 1;</script>
</body></html>`;

const ROBOT_PAGE = `<!DOCTYPE html><html><head><title>Amazon.com</title></head><body>
<h4>Enter the characters you see below</h4>
<p>Sorry, we just need to make sure you're not a robot.</p>
<form action="/errors/validateCaptcha"><img src="https://images-na.ssl-images-amazon.com/captcha/x.jpg" /></form>
</body></html>`;

describe('recognising an Amazon link', () => {
  it('accepts the storefronts and share links the owner will paste', () => {
    assert.equal(isAmazonLink('https://www.amazon.com/dp/B0000AX2VU'), true);
    assert.equal(isAmazonLink('https://amazon.co.uk/dp/B0000AX2VU'), true);
    assert.equal(isAmazonLink('https://www.amazon.com.au/dp/B0000AX2VU'), true);
    assert.equal(isAmazonLink('https://a.co/d/9xKq2mB'), true);
    assert.equal(isAmazonLink('https://amzn.to/3xYzAbc'), true);
    // Pasted out of the address bar without the scheme.
    assert.equal(isAmazonLink('amazon.com/dp/B0000AX2VU'), true);
  });

  it('accepts the subdomains Amazon still answers on', () => {
    // A phone shares `m.`, and old bookmarks and emails still say `smile.`.
    // Both render the product page, so both are links Tammy may well paste.
    assert.equal(isAmazonLink('https://smile.amazon.com/dp/B0000AX2VU'), true);
    assert.equal(isAmazonLink('https://m.amazon.com/gp/aw/d/B0000AX2VU'), true);
    assert.equal(isAmazonLink('https://m.amazon.co.uk/dp/B0000AX2VU'), true);
  });

  it('rejects everything else, including lookalike hosts', () => {
    assert.equal(isAmazonLink(''), false);
    assert.equal(isAmazonLink('not a url'), false);
    assert.equal(isAmazonLink('https://etsy.com/listing/123'), false);
    assert.equal(isAmazonLink('https://amazon.com.evil.example/dp/B0000AX2VU'), false);
    assert.equal(isAmazonLink('javascript:alert(1)'), false);
  });

  it('knows which links have to be followed before they say anything', () => {
    assert.equal(isShortAmazonLink('https://a.co/d/9xKq2mB'), true);
    assert.equal(isShortAmazonLink('https://amzn.to/3xYzAbc'), true);
    assert.equal(isShortAmazonLink('https://www.amazon.com/dp/B0000AX2VU'), false);
  });
});

describe('extractAsin', () => {
  it('finds the identifier wherever Amazon happens to put it', () => {
    const shapes = [
      'https://www.amazon.com/dp/B01N5IB20Q',
      'https://www.amazon.com/Fiskars-Bypass-Pruning-Shears/dp/B01N5IB20Q/ref=sr_1_3?crid=X&qid=1',
      'https://www.amazon.com/gp/product/B01N5IB20Q?psc=1',
      'https://www.amazon.com/gp/aw/d/B01N5IB20Q',
      'https://www.amazon.com/gp/offer-listing/B01N5IB20Q',
      'https://www.amazon.com/exec/obidos/ASIN/B01N5IB20Q',
      'https://www.amazon.com/product-reviews/B01N5IB20Q',
      'https://www.amazon.com/dp/product/B01N5IB20Q',
      'https://www.amazon.com/gp/aws/cart/add.html?ASIN=B01N5IB20Q'
    ];
    for (const shape of shapes) assert.equal(extractAsin(shape), 'B01N5IB20Q', shape);
  });

  it('reads a lowercase identifier and an ISBN-10', () => {
    assert.equal(extractAsin('https://www.amazon.com/dp/b01n5ib20q'), 'B01N5IB20Q');
    assert.equal(extractAsin('https://www.amazon.com/Gardening/dp/0143110136'), '0143110136');
  });

  it('does not mistake a ten-letter word in the slug for the identifier', () => {
    assert.equal(extractAsin('https://www.amazon.com/GARDENTOOL/s?k=shears'), null);
    assert.equal(extractAsin('https://a.co/d/9xKq2mB'), null);
  });
});

describe('canonicalAmazonUrl', () => {
  it('reduces a copied link to the product and the associate tag', () => {
    assert.equal(
      canonicalAmazonUrl(
        'https://www.amazon.com/Fiskars-Bypass-Pruning-Shears/dp/B01N5IB20Q/ref=sr_1_3?crid=2X&qid=1739&sr=8-3&psc=1',
        'hillside-20'
      ),
      'https://www.amazon.com/dp/B01N5IB20Q?tag=hillside-20'
    );
  });

  it('keeps the tag already on the pasted link, because that is the one that pays', () => {
    assert.equal(
      canonicalAmazonUrl('https://www.amazon.com/dp/B01N5IB20Q?tag=tammys-own-20', 'hillside-20'),
      'https://www.amazon.com/dp/B01N5IB20Q?tag=tammys-own-20'
    );
  });

  it('leaves the link alone when no tag is configured anywhere', () => {
    assert.equal(
      canonicalAmazonUrl('https://www.amazon.com/dp/B01N5IB20Q?ref=foo'),
      'https://www.amazon.com/dp/B01N5IB20Q'
    );
  });

  it('normalizes the host so one product is not two picks', () => {
    assert.equal(
      canonicalAmazonUrl('https://smile.amazon.com/dp/B01N5IB20Q'),
      'https://www.amazon.com/dp/B01N5IB20Q'
    );
    assert.equal(
      canonicalAmazonUrl('https://m.amazon.com/gp/aw/d/B01N5IB20Q'),
      'https://www.amazon.com/dp/B01N5IB20Q'
    );
    assert.equal(
      canonicalAmazonUrl('https://amazon.co.uk/dp/B01N5IB20Q'),
      'https://www.amazon.co.uk/dp/B01N5IB20Q'
    );
  });

  it('keeps a storefront page that has no product to point at, minus the noise', () => {
    assert.equal(
      canonicalAmazonUrl(
        'https://www.amazon.com/shop/thehillsidegardens?ref=cm_sw_r_x&qid=17',
        'hillside-20'
      ),
      'https://www.amazon.com/shop/thehillsidegardens?tag=hillside-20'
    );
  });

  it('gives two spellings of one product the same key', () => {
    assert.equal(
      amazonPickKey('https://www.amazon.com/Fiskars-Shears/dp/B01N5IB20Q/ref=sr_1_3'),
      amazonPickKey('https://smile.amazon.com/gp/product/B01N5IB20Q?tag=other-20')
    );
  });
});

describe('titleFromAmazonUrl', () => {
  it('reads the product name Amazon spells into the link', () => {
    assert.equal(
      titleFromAmazonUrl('https://www.amazon.com/Fiskars-Bypass-Pruning-Shears/dp/B01N5IB20Q'),
      'Fiskars Bypass Pruning Shears'
    );
  });

  it('capitalises a lowercase slug and leaves a spelled one as written', () => {
    assert.equal(
      titleFromAmazonUrl('https://www.amazon.com/copper-watering-can/dp/B01N5IB20Q'),
      'Copper Watering Can'
    );
    assert.equal(
      titleFromAmazonUrl('https://www.amazon.com/AmazonBasics-Garden-Hose/dp/B01N5IB20Q'),
      'AmazonBasics Garden Hose'
    );
  });

  it('decodes escaped characters and shortens a very long slug on a word', () => {
    assert.equal(
      titleFromAmazonUrl('https://www.amazon.com/Tea-Tin-Set%2C-6-Piece/dp/B01N5IB20Q'),
      'Tea Tin Set, 6 Piece'
    );
    const long = titleFromAmazonUrl(
      `https://www.amazon.com/${'Very-Long-Product-Name-Indeed-'.repeat(6)}Set/dp/B01N5IB20Q`
    );
    assert.ok(long.length <= 91, long);
    assert.ok(long.endsWith('…'));
    assert.ok(!/\s…$/.test(long));
  });

  it('has nothing to say about a link that carries no name', () => {
    assert.equal(titleFromAmazonUrl('https://www.amazon.com/dp/B01N5IB20Q'), '');
    assert.equal(titleFromAmazonUrl('https://a.co/d/9xKq2mB'), '');
  });
});

describe('reading a product page', () => {
  it('prefers the on-page product title, without the store and the department', () => {
    assert.equal(
      titleFromAmazonHtml(PRODUCT_PAGE),
      'Fiskars Bypass Pruning Shears, 5/8" Cut Capacity, Steel Blade'
    );
  });

  it('falls back through og:title to <title> when the product block is missing', () => {
    const withoutBlock = PRODUCT_PAGE.replace(/id="productTitle"/, 'id="somethingElse"');
    assert.equal(titleFromAmazonHtml(withoutBlock), 'Fiskars Bypass Pruning Shears');

    const titleOnly = `<html><head><title>Amazon.com: Copper Watering Can : Garden</title></head></html>`;
    assert.equal(titleFromAmazonHtml(titleOnly), 'Copper Watering Can');
  });

  it('takes the largest photograph on offer, at full size', () => {
    assert.equal(
      imageFromAmazonHtml(PRODUCT_PAGE),
      'https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SL1500_.jpg'.replace('._AC_SL1500_', '')
    );
  });

  it('reads the dynamic image map when there is no hi-res attribute', () => {
    const withoutHires = PRODUCT_PAGE.replace(/data-old-hires="[^"]*"/, '');
    assert.equal(
      imageFromAmazonHtml(withoutHires),
      'https://m.media-amazon.com/images/I/71Q1tPupKjL.jpg'
    );
  });

  it('drops the size modifier so the card gets the original', () => {
    assert.equal(
      fullSizeAmazonImage('https://m.media-amazon.com/images/I/71Q1tPupKjL._AC_SX679_.jpg'),
      'https://m.media-amazon.com/images/I/71Q1tPupKjL.jpg'
    );
    assert.equal(
      fullSizeAmazonImage('https://m.media-amazon.com/images/I/71Q1tPupKjL.jpg'),
      'https://m.media-amazon.com/images/I/71Q1tPupKjL.jpg'
    );
  });

  it('writes a blurb from the feature bullets, skipping Amazon boilerplate', () => {
    assert.equal(
      descriptionFromAmazonHtml(PRODUCT_PAGE),
      'Fully hardened, precision-ground steel blade stays sharp through heavy use. Low-friction coating helps the blade glide through wood.'
    );
  });

  it('falls back to the page description when there are no bullets', () => {
    const withoutBullets = PRODUCT_PAGE.replace(/id="feature-bullets"/, 'id="nope"');
    assert.equal(
      descriptionFromAmazonHtml(withoutBullets),
      'Free delivery and returns on eligible orders.'
    );
  });

  it('takes the narrowest breadcrumb as the category', () => {
    assert.equal(categoryFromAmazonHtml(PRODUCT_PAGE), 'Pruning Shears');
    assert.equal(categoryFromAmazonHtml('<html><body>no crumbs</body></html>'), '');
  });

  it('decodes the entities Amazon writes into its markup', () => {
    assert.equal(
      decodeEntities('Patio, Lawn &amp; Garden &mdash; 5/8&quot; &#39;cut&#39;'),
      "Patio, Lawn & Garden — 5/8\" 'cut'"
    );
  });

  it('parses the whole page into the fields a pick needs', () => {
    const details = parseAmazonProductHtml(PRODUCT_PAGE);
    assert.equal(details.title, 'Fiskars Bypass Pruning Shears, 5/8" Cut Capacity, Steel Blade');
    assert.equal(details.category, 'Pruning Shears');
    assert.ok(details.imageUrl.startsWith('https://m.media-amazon.com/images/I/'));
    assert.ok(details.description.startsWith('Fully hardened'));
  });
});

describe('a captcha page is not a product', () => {
  it('is recognised for what it is', () => {
    assert.equal(looksLikeRobotCheck(ROBOT_PAGE), true);
    assert.equal(looksLikeRobotCheck(PRODUCT_PAGE), false);
  });

  it('yields nothing rather than publishing "Amazon.com" as the product name', () => {
    assert.deepEqual(parseAmazonProductHtml(ROBOT_PAGE), {
      title: '',
      description: '',
      imageUrl: '',
      category: ''
    });
  });
});

describe('amazonPickDraft', () => {
  it('builds the whole row from a lookup', () => {
    const draft = amazonPickDraft(
      'https://www.amazon.com/Fiskars-Bypass-Pruning-Shears/dp/B01N5IB20Q/ref=sr_1_3',
      parseAmazonProductHtml(PRODUCT_PAGE),
      'hillside-20'
    );
    assert.equal(draft.amazonUrl, 'https://www.amazon.com/dp/B01N5IB20Q?tag=hillside-20');
    assert.equal(draft.title, 'Fiskars Bypass Pruning Shears, 5/8" Cut Capacity, Steel Blade');
    assert.equal(draft.category, 'Pruning Shears');
    assert.ok(draft.imageUrl);
    assert.ok(draft.description);
  });

  it('still names the pick from the link when the lookup found nothing', () => {
    const draft = amazonPickDraft(
      'https://www.amazon.com/Copper-Watering-Can/dp/B01N5IB20Q',
      undefined,
      'hillside-20'
    );
    assert.equal(draft.title, 'Copper Watering Can');
    assert.equal(draft.imageUrl, null);
    assert.equal(draft.description, null);
    assert.equal(draft.category, null);
  });

  it('leaves a last-resort name rather than an empty row', () => {
    const draft = amazonPickDraft('https://www.amazon.com/dp/B01N5IB20Q');
    assert.equal(draft.title, 'Amazon pick');
    assert.equal(draft.amazonUrl, 'https://www.amazon.com/dp/B01N5IB20Q');
  });
});
