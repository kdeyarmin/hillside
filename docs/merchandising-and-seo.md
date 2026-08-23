# Merchandising, categories and search

How the shop decides what to put in front of people, and where each of those
decisions is made. Everything here is editable from `/admin` — none of it needs
a code change.

## Where each decision lives

| Decision                                    | Where                                               |
| ------------------------------------------- | --------------------------------------------------- |
| What the homepage leads with                | `/admin/merchandising` → Homepage rows              |
| Which products carry which badge            | `/admin/merchandising` → Badges and labels          |
| The order products appear in                | `/admin/merchandising` → Product order (drag)       |
| Which collections are tiles on the homepage | `/admin/merchandising` → Featured collections       |
| What a product _is_ (pet safe, low light…)  | `/admin` → product form → "What is true about this" |
| Related products, cross-sells, bundles      | `/admin` → product form → the three pickers         |
| Season dates                                | `/admin` → product form                             |
| Category page copy, FAQs and care guides    | `/admin/content` → Categories                       |
| Collection page copy, FAQs and care guides  | `/admin/content` → Collections                      |

## Best sellers come from orders, not a checkbox

A best-seller badge is a claim about the shop, so it is worked out from paid
order lines rather than from something somebody remembered to tick. The rules
live in `lib/merchandising.ts`; the counting is in `lib/merchandising-data.ts`.

A product earns the badge when, inside the last **120 days**, it has sold:

- at least **4 units**, and
- across at least **2 separate orders**.

Each threshold answers a different way of being wrong. The window means the
label lapses when a product stops selling instead of sticking to something that
had a good month last spring. The order floor means one customer buying six of
something for a wedding does not make it a best seller. The unit floor means two
idle purchases do not either.

Cancelled and fully refunded orders are excluded — money that came back is not a
sale.

Tammy can overrule either direction on any product: **Always show** for a piece
she knows is about to be everywhere, **Never show** for one that sold well once
and is not coming back. The merchandising page shows the real numbers beside
every product, so an override is a decision rather than a guess.

The same shape applies to the **New** badge: automatic for anything listed in
the last 45 days, with the same two overrides.

Four things read all of this:

- the **badge** on cards and product pages;
- the **best-selling products** row on the homepage, and the "Selling right now"
  row, which applies the same rule and the same overrides over a 30-day window
  rather than admitting anything that sold at all;
- the **best-selling category** line on `/collections`, which needs the unit
  floor only, because a whole category leading the shop off one order is not a
  failure worth a second threshold;
- the **Best selling** sort in the shop.

## Product attributes

`lib/product-tags.ts` is the whole vocabulary. There are two kinds, and the
difference matters.

**Assignable** attributes are what Tammy ticks on a product and are stored in
`Product.tags`: beginner friendly, pet safe, drought tolerant, likes humidity,
low light, bright light, trailing, climbing, compact, large plant, rare,
handmade, small batch, giftable, seasonal.

**Derived** attributes are worked out at render time from data the shop already
holds: in stock, local pickup, ships, new, best seller, Tammy's pick, on sale.
Nothing writes them to a product, which is the point — they cannot go stale. A
"Best seller" checkbox left ticked on a product that stopped selling would be a
lie the shop could disprove from its own order history.

Each attribute declares which product types it applies to. That is what keeps a
light-requirement filter away from a soap customer: the filter rail asks the tag
catalog which attributes apply to the product types currently on screen, and a
shop showing only soap is never offered one.

Attributes are also search text. Someone typing "pet safe" finds a plant tagged
`pet-safe` even though those exact words appear nowhere in its description,
because the tag carries its synonyms with it.

To add an attribute, add it to `PRODUCT_TAGS` with a group, the product types it
applies to and the words people would type for it. The admin form, the filter
rail and the search all pick it up. Slugs are stored values — renaming one needs
a data migration; the labels can be reworded freely.

## Category and collection pages

The shop has two kinds of browsable grouping and they share one page,
`components/GroupingLanding.tsx`:

- a **category** is the structural parent — houseplants, carnivorous plants,
  succulents, terrarium supplies — and lives at `/categories/<slug>`. A product
  has exactly one, so it is the breadcrumb;
- a **collection** cuts across categories — pet friendly, gifts under $30 — and
  lives at `/collections/<slug>`.

Both are what a stranger lands on from a search, so both need the same thing and
neither should get a fix the other misses. Beyond its name and picture, either
can carry:

- **Introduction** — one or two paragraphs above the products;
- **Longer writing** — below the products; a blank line starts a paragraph, and
  a short line ending in a colon becomes a subheading;
- **Questions and answers** — one per line, `question | answer`. These render on
  the page and are the only thing that emits `FAQPage` markup for it, so a
  category with none publishes none;
- **Care guides** — ticked from the care library, shown under the products;
- **Search words**, and overrides for the page title and description.

`prisma/seed-category-content.ts` writes starting copy for the canonical
categories — houseplants, carnivorous plants, succulents, air plants, terrarium
supplies, moss, handmade soap, tea, planted arrangements — and seeds the default
homepage rows.

The seed writes to `Category`. It targeted `Collection` when those subjects were
collections; the taxonomy change moved them, at which point every slug matched
nothing and the seed silently became a no-op. Its markers use a `category-page:`
prefix rather than the older `category-content:` one, because five of the slugs
were collection slugs too and an install seeded before the change would
otherwise skip exactly the categories it has never seeded.

Both run **once, ever**, recorded in the `SeedMarker` table. Emptiness is not
the test: it cannot tell an untouched install from an owner who deliberately
cleared something, and the deploy runs this on every release — so a category
introduction Tammy deleted, or a homepage stripped of every row, would simply
come back. Within a category's one turn, each field is still filled only when
it is empty, so copy she has already written is never overwritten either. A
category added to the seed file later gets its own turn, because the marker is
per category.

## Filters

`lib/shop-filters.ts` builds the rail. A filter is offered only when something
on the shelf answers to it: every option is counted against the products in
scope, and anything counting zero is dropped — unless the shopper has it
selected, because a filter you cannot see is a filter you cannot undo.

Counts describe what selecting an option _would_ do, so each facet is counted
against the other filters rather than against its own selection.

The whole filter state lives in the query string, so a narrowed shop can be
bookmarked and sent to somebody. Unknown tags in an old link are dropped rather
than carried, so a stale URL cannot produce an empty grid with an unnameable
chip attached to it.

## Search

Search reads everything a shopper might reasonably use to find something:
product names, botanical names, short and long descriptions, details, care
notes, the owner's extra search terms, SKU, product type, attributes and their
synonyms, and the collections a product belongs to. Care guides add symptoms,
causes, treatment and category; collections add their taglines, introductions
and keywords.

Two rules keep the results honest:

- **Start of word.** "tea" matches "teas", "teapot" and "tea-cup", and never
  "steady" or "instead".
- **Typo tolerance as a fallback only.** A token that finds nothing gets one
  more pass against the words on the page within an edit distance of 1 (2 for
  long words). Words shorter than four letters never get it — at three letters
  almost everything is one edit from something else, and allowing it would put
  "sea" and "tear" into the results for "tea".

Results are ranked, not just filtered: a product whose _name_ is what was typed
outranks one that mentions it in the third paragraph. Each primary field is
compared on its own for the exact and prefix bonuses — joined together, a
product called exactly "Golden Pothos" stopped counting as an exact match the
moment it also carried a botanical name.

There is deliberately no search index. The catalog is a few hundred rows;
reading the searchable columns and ranking them in memory is both better and
cheaper than infrastructure the shop is nowhere near large enough to need. The
scan ceilings in `app/search/page.tsx` exist so that stops being true loudly.

## Structured data

One business node, at `/#business`, described in `lib/seo.ts` and referenced by
everything else — the care guides' publisher, the classes' organiser, every
offer's seller. Before this, three pages each described the business inline with
a different `@type` and no `@id`, which to a crawler is three organisations that
happen to share a name.

The rest:

- **Product** with `AggregateRating` and up to five `Review` nodes, published
  only when there are approved reviews.
- **Offers, one per size.** A multi-size product used to collapse into a single
  `AggregateOffer` carrying one `availability` — so a sold-out 6" pot was
  advertised as in stock at the 4" pot's price. Each size now carries its own
  price, its own availability from its own count, and its own SKU suffix. A size
  only claims its own stock when the owner counts the sizes separately;
  otherwise every size reports the product's total, which is the honest answer.
- **BreadcrumbList** on products, categories, care guides and `/visit`.
- **FAQPage** on `/faq`, `/visit` and any category that carries questions.
- **CollectionPage** with an `ItemList` of names and URLs — no prices, because
  they belong to the product pages and repeating them is how a category page
  ends up advertising a price that has since changed.
- **Event** on `/classes`, **Article** on care guides, **WebSite** at
  `/#website`.

`tests/seo-schema.test.ts` covers the offer and rating rules.
