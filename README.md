# The Hillside Gardens

A standalone ecommerce, class-registration and owner-operations website for **The Hillside Gardens** (`thehillsidegardens.com`). The application is designed for Railway hosting and for Tammy Hill to run from a simple password-protected dashboard.

## Technology

- Next.js 15, React 19 and TypeScript
- PostgreSQL with Prisma
- Stripe Checkout, invoices, promotion codes, shipping and optional automatic tax
- Telnyx Video Rooms for secure browser-based online classes
- Railway Railpack deployment with a pre-deploy database schema step
- Transactional customer email through SendGrid
- No Base44 or proprietary site builder

## Public website

- Professional botanical storefront based on the Hillside green, sage and gold logo system
- A homepage that says what the shop sells — plants, botanical goods and creative planting — above a row of the categories it sells them in
- An owner-managed category taxonomy: houseplants, carnivorous plants, succulents, air plants, living arrangements, terrariums and supplies, moss, driftwood, planters, tea and tea accessories, soap, lotion, apothecary, gifts and seasonal
- Owner-managed collections that are real landing pages, curated across categories — an introduction, the products, the care guides that go with them, the questions customers actually ask, and links onward
- Site-wide search across product names, botanical names, descriptions, attributes, categories, collections, care guides and classes, with typo tolerance
- Filterable product catalog: category, collection, price, availability, pickup and shipping, plant attributes, handmade, new, best seller and sale — showing only the filters something on screen answers to
- Owner-assigned product attributes (pet safe, low light, beginner friendly, handmade, giftable and more) used by the filters, the search and the product pages
- Best-seller badges and rows worked out from paid orders rather than a checkbox
- A local-shopping page at `/visit` for Ebensburg and Cambria County pickup
- Individual SEO-ready product pages with live inventory, a named photograph gallery and customer reviews
- Structured product detail that changes with the category — a plant's light, water, pot size and pet safety; a tea's steep time, caffeine and allergens; a soap's full ingredient list
- Product cards that carry a price or price range, sale, new, best-seller and low-stock signals, and which sizes are still available
- A variant dropdown on products sold in more than one form, each variant carrying its own price, stock, SKU, photograph, weight, dimensions and shipping answer
- Back-in-stock email alerts on sold-out products
- Persistent shopping cart and secure Stripe Checkout
- Optional gift message at checkout, printed on the packing slip
- Local pickup in Ebensburg at checkout, or standard US shipping
- Configurable flat or free standard shipping
- Customer order-confirmation page and Stripe invoice link
- Self-service order-status lookup
- Printable houseplant care sheets and detailed care pages
- Gallery of Tammy’s past planter arrangements
- Tammy’s Amazon influencer picks with affiliate disclosure, published by pasting the item’s link
- Newsletter signup, cart saving and customer contact form
- Care guides that link through to the plant they describe
- Google Analytics 4 ecommerce events (opt-in through an environment variable)
- LocalBusiness structured data, plus a purpose-built social share image
- About, FAQ, shipping/returns, privacy and terms pages
- Sitemap, robots file, web manifest and structured data

## Owner dashboard

The dashboard at `/admin` includes:

- Revenue and operations overview
- Order fulfillment, private notes, carrier and tracking entry, gift messages and pickup orders
- Automatic customer shipping-update email when an order is marked fulfilled
- Packing-slip and 4 × 6 shipping-label printing
- Shipping-address, full-order and newsletter-subscriber CSV exports
- A product editor of its own at `/admin/products/<id>` — price, sale price, SKU, inventory, badges, photographs, weight and dimensions
- Category assignment, which also decides which structured detail fields the product is asked for
- Structured detail fields that change with the category, with the common answers offered as you type
- A variant editor for anything sold in more than one form, each variant carrying its own price, stock, SKU, photograph, weight, dimensions and shipping answer
- A merchandising page at `/admin/merchandising`: homepage rows, product badges, best-seller and new-arrival overrides, drag-to-reorder product and collection order, and featured collections
- Per-product attributes, botanical name, extra search terms, season dates, related products, cross-sells and bundle contents
- Collection page editing — introduction, longer copy, questions and answers, search words and linked care guides
- A **Needs attention** panel that counts what is actually outstanding and links each number to the products behind it
- Inventory filters for out of stock, low stock, needs reorder, no reorder point, missing SKU, missing supplier, missing photograph, inactive, incomplete and recently restocked
- Supplier, their item number, reorder point, reorder quantity, inventory status, private inventory notes and a last-restocked date that fills itself in
- A one-field **Received a delivery** form on every product, per size where sizes are counted separately
- Per-product completeness scoring against what that category of product needs, and a draft / ready to publish / published state
- Low-stock visibility and product archiving
- Paid and free class registrations and seat counts
- Customer website inbox
- Newsletter subscriber management
- Customer review moderation with optional public replies
- Restock request list, emailed automatically when stock returns
- Category and collection management, and per-product assignment to both
- A photography editor with drag-and-drop, mobile upload, named photo slots, reordering, primary selection and previews
- Visibility of products still missing their own photograph, and of products still showing shared category artwork
- Order confirmation email delivery status
- Admin account management at `/admin/accounts` — add an admin, change a password, revoke access
- A separate content manager at `/admin/content` for classes, gallery items and Amazon picks — a pick is added by pasting the item’s Amazon link and nothing else
- A plant care library manager at `/admin/care` for plant profiles, problem guides and seasonal checklists
- Online class creation, Telnyx room preparation and a private host studio
- Online-class confirmation status, attendee last-join time and secure link resending

## Admin accounts

Signing in to `/admin` takes an email address and a password. Each admin has
their own account, stored in the `AdminUser` table with a salted scrypt hash of
their password — the dashboard sidebar shows who is signed in.

**Everything below can be done from the dashboard itself, at
`/admin` → Admin accounts.** Any signed-in admin can add someone, set a new
password on an account, and deactivate or reactivate one, without a shell or a
deploy. The commands here do the same things for anyone who prefers them, and
are what provisions the very first account on a fresh install.

Create an account, or reset the password on an existing one:

```bash
npm run admin:create -- --email owner@example.com --name "Full Name" --password 'their-password'
```

Re-running against an address that already exists updates that account instead
of failing, so the same command serves as a password reset. Resetting a password
signs out the sessions that were opened with the old one.

Take an account away without deleting its history:

```bash
npm run admin:create -- --email owner@example.com --deactivate
```

A deactivated account cannot sign in, and any session it already had stops
working on its next request. Setting a password again reactivates it.

Neither route will leave the dashboard with no way in. The accounts page
refuses to switch off the account you are signed in with, and the command
refuses to revoke the last active account while `ADMIN_PASSWORD` is unset —
add `--force` to do it deliberately.

Passwords are never stored in this repository. The credentials go in on the
command line, or through `ADMIN_ACCOUNT_EMAIL`, `ADMIN_ACCOUNT_NAME` and
`ADMIN_ACCOUNT_PASSWORD` — when all three are set, the pre-deploy step creates
that account if it does not exist, which is how one can be provisioned without
shell access to the running service.

The deploy path only ever **creates**. An address that already has an account
is left alone, so leaving those variables configured is safe: a later deploy
will not reset a password that has since been changed here, and will not switch
a revoked account back on.

`ADMIN_PASSWORD` is the older shared password. It still works, with any email
address, alongside the named accounts, so that adding accounts cannot lock the
owner out. Once every admin has their own account, unset it: `ADMIN_SESSION_SECRET`
is the only variable sign-in actually requires. Rotating or clearing
`ADMIN_PASSWORD` invalidates every existing session, named accounts included.

## Railway deployment

1. Create a Railway project from `kdeyarmin/hillside`.
2. Add a PostgreSQL service.
3. Add the variables from `.env.example` to the web service. Railway supplies the PostgreSQL `DATABASE_URL` when the database is linked.
4. Deploy. `railway.json` runs `npx prisma db push` as a pre-deploy command, then starts Next.js on Railway’s assigned `PORT`.
5. Run the starter-data command once from a Railway shell or one-off command:

```bash
npm run db:seed
```

The pre-deploy step already creates the category taxonomy and files any
uncategorised product into it on every deploy, so an existing catalog needs
nothing run by hand for that. `npm run db:seed` additionally adds the demo
products and the care library, and refuses to touch a catalog that already has
products in it.

6. Create an admin account for each person who runs the shop, from a Railway shell:

```bash
npm run admin:create -- --email owner@example.com --name "Full Name" --password 'their-password'
```

Without shell access, set `ADMIN_ACCOUNT_EMAIL`, `ADMIN_ACCOUNT_NAME` and
`ADMIN_ACCOUNT_PASSWORD` on the service and redeploy — the pre-deploy step
creates the account.

7. Generate a Railway public domain, then set `NEXT_PUBLIC_SITE_URL` to that full URL.
8. After the custom domain is connected, change `NEXT_PUBLIC_SITE_URL` to `https://thehillsidegardens.com` and redeploy.

`NEXT_PUBLIC_SITE_URL` is read at **build** time, not run time — Next inlines
`NEXT_PUBLIC_*` into the compiled output, so changing it on the running service has no
effect until the next deploy.

Absolute links (the sitemap, `robots.txt`, canonical and OG tags, and the private
classroom link emailed to online-class customers) fall back to
`https://thehillsidegardens.com` when the variable is unset. A deployed build also
refuses a loopback value such as `http://localhost:3000` or `http://127.0.0.1:3000`,
because those resolve to the visitor's own machine rather than the shop, and logs a
warning naming the ignored value. Set the variable only to point a build at a genuine
public origin, such as a Railway preview domain.

## Categories and collections

The shop has two ways of grouping what it sells, and they answer different
questions on purpose.

A **category** says what a thing _is_. Every product sits in exactly one:
Houseplants, Carnivorous Plants, Succulents, Air Plants, Live Plant
Arrangements, Terrariums, Terrarium Supplies, Moss, Driftwood & Natural
Materials, Planters & Pots, Tea, Tea Accessories, Handmade Soap, Botanical
Lotion, Apothecary, Gifts, Seasonal, Other. Categories are rows in the database,
managed at `/admin/content#categories`, so the taxonomy grows with the bench
rather than with a deploy.

A **collection** says why you might _want_ it — Beginner Friendly, Low Light,
Pet Friendly, Tammy's Favorites, Gifts Under $30 — and a product joins as many
as apply, on top of the one category it belongs to. Collections are curated by
hand and can hold anything in the shop.

Together they give the storefront two levels. The site header navigates three
broad groups (Plants, Teas & Herbals, Botanicals), the shop narrows each of them
to a category with a chip, and the collections page cuts across all of them.

Each category carries two settings with consequences beyond its own name:

- **Which details its products are asked for** — the field set on the product
  form, described below.
- **Counts as** — which of the six original `ProductType` values its products
  are recorded as. Live plants and teas are final sale under the published
  returns policy and everything else is returnable unopened, and that policy is
  what search results are told; the setting is also what keeps a
  `?category=BOTANICAL` link somebody bookmarked years ago pointing at the right
  shelf. A product's type is written from its category on every save, so the two
  cannot drift apart.

Existing products were never left uncategorised: the deploy seed creates the
categories once and files every product without one, matching on its name before
falling back to its type. It never rewrites a category that already exists or a
product that already has one, so a rename stays renamed and a re-shelving stays
re-shelved.

Deleting a category that still holds products is refused, because the products
would survive and silently fall out of every filter that leads to them. Hiding
one is the reversible answer, and it is what the button offers instead.

## Structured product details

A plant, a tea and a bag of terrarium gravel do not describe themselves the same
way. Each category chooses a **detail kind**, and the product form asks only that
kind's questions:

| Detail kind           | What a product is asked for                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plant                 | Botanical name, mature size, growth habit, pot size, nursery pot or decorative planter, approximate height and width, light, water, humidity, difficulty, pet safety, indoor or outdoor |
| Carnivorous plant     | Everything a plant is asked, plus species, dormancy, water type, growing medium and feeding                                                                                             |
| Tea                   | Net weight, ingredients, allergen information, caffeine, serving size, approximate servings, brewing temperature, steep time, storage                                                   |
| Soap                  | Net weight, scent, complete ingredient list, skin and use, storage                                                                                                                      |
| Lotion & apothecary   | Net volume, scent, ingredients, directions, warnings, storage                                                                                                                           |
| Supplies & hard goods | Dimensions, quantity or package size, material, appropriate uses                                                                                                                        |
| General               | The same as supplies, for gifts, seasonal pieces and anything else                                                                                                                      |

Every kind is also asked for **shipping restrictions**. Whether a piece ships at
all and whether local pickup is offered are the product's own two checkboxes, so
there is only ever one answer to them, and the product page prints both in the
same table.

Everything is optional, always. A field left empty is not rendered, so a listing
says what Tammy knows and stays quiet about the rest rather than printing a table
of blanks. The form shows how much of a listing is filled in — "9 of 14 plant
details filled in" — as a nudge rather than a gate.

Picking a different category swaps the questions on the spot. The fields for
every kind are in the page and all but one are disabled, which is what makes
"only the chosen category's fields are saved" true rather than merely apparent:
several kinds ask for the same field name, and a hidden-but-enabled input would
be submitted and could overwrite the one on screen. With scripting off, the
fields for the category the product is already in are the ones shown.

Re-shelving a product does not lose what was written for it. Values are stored
by field name and laid over what was already there, so moving a lotion to
Apothecary and back keeps its ingredient list, and a category chosen by mistake
is undone by choosing the right one.

The details are stored as JSON in `Product.specs` and read through
`lib/product-specs.ts`, which is the single definition of the fields: the admin
form renders from it, the save reads from it, and the public specification table
renders from it again.

## Merchandising, categories and search

`docs/merchandising-and-seo.md` covers how the shop decides what to put in front
of people: where best sellers come from, what the automatic badges mean, how the
category pages are written, and which filters appear when.

## Products sold in more than one size

A product that comes in several forms — a pothos in a 4" nursery pot, a 6"
nursery pot, a 6" decorative planter or an 8" one; a lotion in a 2 oz or an 8 oz
jar — gets a **Sizes and variants** editor on its product page in the dashboard.
Each variant is a row, and each row can carry:

| Field            | Left blank means                                               |
| ---------------- | -------------------------------------------------------------- |
| Variant name     | (required — a row with no name is an empty row and is ignored) |
| Price            | The product's own price                                        |
| Quantity on hand | This product is not counted per variant                        |
| SKU              | The product's own SKU                                          |
| Shipping weight  | The product's own weight                                       |
| Dimensions       | The product's own dimensions                                   |
| Photo URL        | The product's own photograph                                   |
| How it gets home | The product's own Ships and Local pickup checkboxes            |

That "left blank means the product's" rule is the whole design. A variant that
merely repeats one of the product's answers is stored as _following_ it rather
than pinned to today's value, so raising the product's price moves every variant
with it and replacing its photograph replaces theirs — and anything a variant
genuinely needs of its own it can have.

Two of those fields have consequences worth spelling out:

- **No quantity anywhere in the editor** — the variants share the one **Quantity
  on hand** above, the way two jar sizes filled off one pile do.
- **A quantity on any row** — the product is counted per variant from then on,
  and a row left blank has none left rather than borrowing another's. The
  Quantity on hand box becomes the sum of the variants and stops being something
  to type: change a variant's number to change it.

**What the dropdown is called** renames the field on the storefront — "Pot
size", "Jar size" — and defaults to "Size". Leave every row blank for anything
sold one way, and the storefront behaves exactly as it did before.

What the shop then does:

- The product page shows the price span (`$18.00 – $32.00`) and a dropdown with
  each variant and its price. Nothing is preselected and Add to cart stays
  disabled until the customer chooses, so a wrong one cannot be added by
  accident. Choosing shows that variant's dimensions and, when the variants
  disagree about it, how that one gets home.
- A shop card cannot take that choice, so on such a product its button reads
  **Choose pot size** and leads to the product page. A cart-drawer suggestion
  does the same, in the shorter words its narrow strip has room for.
- Each variant is its own basket line, so one order can hold a 4" and a 6" pot of
  the same plant. The name travels with the line into Stripe Checkout, the
  emailed receipt, the confirmation email, the packing slip, the order CSV and
  the order-status lookup — everywhere the shop has to know which one to pack,
  and the variant's own photograph is the one Stripe shows.
- **A variant may get home differently from its product.** A 30" specimen that
  cannot post safely can be pickup only while the 4" pots ship, and it is the
  variant's answer that decides what the cart can do: the basket line carries it,
  and checkout refuses a cart that mixes a pickup-only variant with a
  ships-only one exactly as it refuses the equivalent mix of products.
- **A counted variant is its own shelf.** The dropdown marks a sold-out one and
  will not let it be chosen, the quantity stepper stops at what it has, and
  checkout, a restored saved cart, a released hold and a refund all spend and
  return stock against the variant that was ordered. A basket taking the last 4"
  pot and the last 6" pot is two lines and both are honoured; asking for two of a
  variant with one left is corrected with a note naming it.
- **Uncounted variants share one shelf**, the way they always did: three jars is
  three jars however they are split.
- The dashboard's product list prints the split beside the total — `9 in stock
(4" pot 9 · 6" pot 0)` — and the **Low stock** chip counts a product whose
  _any_ counted variant is down to three or fewer, so a plant that is full of 4"
  pots and out of 6" ones is on the list Tammy works from.
- **`Product.inventory` stays the product's total** either way — the sum of the
  variants when they are counted, and rewritten from them after every sale, hold,
  release and refund. So the shop card, the low-stock filter, the gallery, the
  care pages and the back-in-stock alerts all go on reading the one column, and a
  product whose variants are all empty reads as sold out everywhere.
- **Structured data names each variant.** A product sold in several is published
  as an `AggregateOffer` whose members carry the variant's own name, price, SKU
  and availability, which is what lets a shopping result match one variant to one
  listing rather than quoting a span with nothing behind it.
- A **compare-at price stands down** on a product whose variants are priced
  differently. "Was $24, save 25%" is a claim about _the_ price, and such a
  product does not have one — the range says what each one costs instead.
- A variant the owner later removes cannot be ordered. A basket or a saved cart
  still holding it is corrected at checkout with a note asking for the choice to
  be made again, rather than being quietly filled with a different one. Stock
  refunded onto a variant that has since been removed is dropped rather than
  added to the product's total, because a total larger than the variants add up
  to would advertise stock no option on the page can sell.

The variants are stored as JSON in `Product.sizes`. The column keeps its original
name because live rows, saved carts and in-flight Stripe sessions hold data under
it; only the shape has grown, and every older row — including one written as a
bare list of names — still validates against it untouched.

## Inventory, completeness and photography

Three related things the dashboard does with a product, none of which involve
money: cost, margin and inventory valuation are deliberately absent, because this
is the list Tammy works from at the potting bench rather than a set of books.

### Restocking

Each product carries an optional supplier, that supplier's own item number, a
reorder point, a reorder quantity, an inventory status, private inventory notes
and a last-restocked date. The date fills itself in whenever the quantity on hand
goes up, and can be corrected by hand when the box actually arrived on another
day. **Received a delivery** on each product row adds what turned up — per size,
where the sizes are counted separately — rather than asking for the new total.

The inventory status says _why_ a shelf is empty, which decides whether it is a
job at all: `On order` takes a product off the reorder list until it lands,
`Made to order` never has a count to run down, and `Seasonal` and `Discontinued`
are not being reordered now. A reorder point is measured against the product
total, because a reorder is placed for the product; low stock is still measured
per size, because that is where potting-up happens.

The chips above the inventory list — out of stock, low stock, needs reorder, no
reorder point, missing SKU, missing supplier, missing photograph, inactive,
incomplete, recently restocked — are counted over the whole catalog rather than
the filtered view, so a number does not move while she types in the search box.
**Needs attention** at the top of the dashboard is a shorter list of the same
counts, in sentences, each linking to the chip that shows those products.

### Completeness

`lib/product-completeness.ts` checks each product against what _its category_
needs: a plant is asked for pot size, light, water and pet safety; a tea for net
weight, ingredients, brewing instructions and caffeine status. The result is a
percentage, a named list of what is missing, and one of three states — **Draft**
while something required is missing, **Ready to publish** once it is not, and
**Published** once it is live.

None of this blocks a save. An unfinished draft is how the work gets done, and
being refused at the save button is how the work stops. The single exception is a
regulated consumer good: a tea, soap or lotion with no net contents and no
ingredient list saves in full but stays a draft, with the reason on screen, and
the same refusal applies to the one-click **Put back in shop**.

### Photography

Every product has a named slot for its main, lifestyle, detail, scale and
packaging photographs, plus a reorderable strip of additional ones — each named
view is labelled for customers in the product gallery, because "Size" and
"Packaging" are the thumbnails a shopper is hunting for and "photograph 4 of 6"
makes them hunt. `lib/product-photos.ts` is the one place that decides what
counts as shared category artwork rather than a real photograph, and both the
storefront visual and the dashboard's chip ask it.

## Why the database-backed pages are `force-dynamic`

Every page that reads the database declares `export const dynamic = 'force-dynamic'`.
That looks like a missed caching opportunity, and it is deliberate.

Railway runs `buildCommand` (`npm run build`) **before** `preDeployCommand`
(`npx prisma db push`). Switching those pages to `export const revalidate = …`
makes Next prerender them during `next build`, which means the build starts
requiring a reachable database whose schema already matches the code. Under this
ordering it does not:

- on a first deploy the tables do not exist yet, so the build fails;
- on any deploy that adds a column, the build renders against the _old_ schema
  while the generated client expects the new one, so the build fails;
- CI builds against a `DATABASE_URL` with nothing listening, so the build fails.

This was tried and reverted. Caching these pages needs the deploy pipeline changed
first — either push the schema before the build, or cache at the data layer
(`unstable_cache`) so rendering stays dynamic. Until then, the far larger win is
image weight, which is handled by `npm run images:variants` (see below).

## Responsive images

`npm run images:variants` regenerates the 400/800/1200-wide WebP variants beside
each master in `public/images/`, re-encodes the brand marks, and rewrites the
`lib/image-variants.ts` manifest that `lib/image-srcset.ts` reads. Run it after
adding or replacing photography, and commit the output.

`ResilientImage` resolves `srcSet` and `sizes` from its own `src`, so call sites
only choose a `sizeRole` (`hero`, `card`, `tile`, `detail`, `thumb`).

Owner-uploaded photographs cannot be processed at build time, because they arrive
from Tammy's phone at request time. They are resized in the browser instead — up
to 1600px wide, re-encoded as WebP, with 400/800/1200 copies uploaded alongside — and the stored filename carries the widths that exist beside it
(`<uuid>-v400-800-1200-1600.webp`), so the same `srcSet` builder covers both
sources with nothing to look up. Uploads from before this existed have unmarked
names and keep the plain single `src` they always had. See
`docs/admin-image-uploads.md`.

## Amazon influencer picks

Adding a pick is one field. Paste the item's Amazon address into **Add a pick**
at `/admin/content#add-amazon` — the long link from the browser's address bar,
the short `a.co` or `amzn.to` link the Amazon app shares, either one — and the
item is on `/amazon`. There is no title, photo URL, category or blurb to fill in
first.

What happens to the link:

- the ASIN is read out of it, and the pick is stored as a clean
  `https://www.amazon.com/dp/<ASIN>?tag=<associate tag>` — no session or
  placement tracking travels on to the customer
- a tag already on the pasted link is kept, because an influencer pulling links
  out of their own storefront is carrying the tracking id that pays them.
  Otherwise `AMAZON_ASSOCIATE_TAG` is applied; with neither, the link simply
  carries no tag
- the item page is then read for the product's name, photograph, description and
  department. See [`lib/amazon-pick.ts`](lib/amazon-pick.ts) for the parsing and
  [`lib/amazon-lookup.ts`](lib/amazon-lookup.ts) for the request
- pasting the same item twice does not make two picks. It finds the one already
  there, un-archives it if it was archived, and opens it

**When Amazon does not answer.** Amazon refuses requests from servers it does not
recognise, answering with a captcha page rather than an error. That is treated as
a lookup that did not happen, never as a product: the pick still publishes, named
from the link itself — `/Fiskars-Bypass-Pruning-Shears/dp/…` becomes "Fiskars
Bypass Pruning Shears" — and the dashboard says so plainly instead of claiming
success. The row is then marked **No photo**, and carries a **Get details from
Amazon** button that tries again and fills only what is still blank, so nothing
Tammy wrote herself is overwritten. Failing that, the photo field takes an upload
from her phone like every other photo on the site.

## Classes are hidden from the public website

Classes are switched off for customers by a single flag,
`CLASSES_PUBLICLY_VISIBLE` in [`lib/class-visibility.ts`](lib/class-visibility.ts).
While it is `false`:

- the header, the footer, the homepage, site search, the care guides and the
  sitemap say nothing about classes, and `/classes` answers 404
- the dashboard is untouched. Classes are still created, edited, published and
  hosted from `/admin/content` and the host studio, seats are still counted and
  held, and the registration and Stripe endpoints still run
- the private classroom keeps working for anyone already registered. Emailed
  access links, `/classes/studio/<id>` and the paid-registration confirmation
  page are reachable with a valid token or Stripe session, so a customer who has
  already paid is not locked out. Their dead-end buttons point at `/contact`
  while the listing is hidden

Setting the flag to `true` restores all of it. The one thing it does not restore
is copy: sentences that advertised classes on the home, about, FAQ, contact and
search pages were rewritten rather than wrapped in a conditional, so they have to
be written again. The class paths in `scripts/a11y-audit.mjs` and
`scripts/responsive-audit.mjs` are commented out for the same reason and come
back the same way.

## Class times and the shop timezone

The shop runs on **Eastern time**. `instrumentation.ts` sets `TZ` to
`America/New_York` when the server boots, so a class entered in the dashboard as
6:00 PM is shown to customers as `6:00 PM EDT` — on Railway, in a container, or
on a laptop, with nothing to configure. Daylight saving is handled by the zone
itself, so the label reads `EST` in winter and `EDT` in summer.

Every class time on the site is printed with its timezone, because someone
joining an online class from another state cannot otherwise tell what "6:00 PM"
means.

If the business ever moves, set `TZ` to another IANA zone in the environment and
it wins over the default. Do not set it to `UTC` unless the shop genuinely keeps
UTC: class times are entered and read back against this one clock, so changing it
reinterprets every date already in the database.

## Stripe setup

Create a Stripe webhook endpoint at:

```text
https://YOUR-DOMAIN/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `checkout.session.async_payment_failed`
- `charge.refunded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Product purchases and class registrations are identified through signed Checkout metadata. Fulfillment is idempotent, so a repeated Stripe event does not create a second order or registration. When a paid online class is fulfilled, the webhook creates and emails the customer’s secure classroom access link.

Product checkout now reserves stock on a `PENDING` order for 35 minutes, matching the Stripe session `expires_at`. Subscribe `checkout.session.expired` (and `async_payment_failed`) so abandoned checkouts return that stock; a sweep on the next checkout also releases holds whose webhook was missed. Clicking Cancel on Stripe Checkout returns to `/cart` and immediately expires the session so the hold does not sit for the full 35 minutes. If expire fails, the cart keeps `?canceled=` so a refresh can retry without releasing stock while Stripe still accepts payment.

Set `STRIPE_AUTOMATIC_TAX=true` only after Stripe Tax has been configured for the business. Stripe Checkout emails receipts and creates invoices for paid product and class sessions.

## Telnyx Video setup

Online and hybrid classes use Telnyx Video Rooms. Add these Railway variables:

```text
TELNYX_API_KEY=...
TELNYX_API_BASE_URL=https://api.telnyx.com/v2
NEXT_PUBLIC_TELNYX_VIDEO_SDK_URL=https://cdn.jsdelivr.net/npm/@telnyx/video@1.0.2/+esm
CLASS_ACCESS_SECRET=ANOTHER_LONG_RANDOM_SECRET
CLASS_HOST_NAME=Tammy Hill
```

The Telnyx API key remains server-side. Customers receive a private Hillside access link rather than a Telnyx client token. The app creates short-lived Telnyx client credentials only after the customer’s paid registration and signed class-access cookie are verified.

Detailed setup, security design, testing steps and recording guidance are in [`docs/telnyx-video-classes.md`](docs/telnyx-video-classes.md).

## Customer email

SendGrid is required to email online-class access links. To send branded Hillside order, shipping, class, contact and newsletter messages:

1. Authenticate the sending domain in SendGrid (Settings → Sender Authentication).
2. Add `SENDGRID_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Set `BUSINESS_EMAIL` to Tammy’s inbox.
5. Optionally set `OWNER_PERSONAL_EMAIL` to her own everyday address. Every owner alert is then sent to both inboxes, deduplicated if the two match: new orders, oversold orders, website messages, class registrations, overbooked classes and reviews awaiting approval. Customer mail is unaffected. It is a recipient only — outbound mail still comes from `EMAIL_FROM` on the SendGrid-authenticated domain, because sending _as_ a consumer mailbox would fail SPF and DKIM alignment and be filed as spam.

Product ordering still works without SendGrid because Stripe can send payment documents. Online class registrations are saved without SendGrid, but Tammy must configure email and use the host studio’s **Resend link** action before customers can receive their private classroom URL.

## Email page

`/admin/email` is where Tammy reads and writes mail without leaving the dashboard:

- **Write an email** — compose to as many as five addresses. It is sent as the shop, signed, with replies directed back to `BUSINESS_EMAIL`.
- **Customer messages** — every website contact-form message, answered inline. The reply quotes what the customer wrote, is stored against the message, and moves a `NEW` message to `READ`.
- **Sent mail** — every email the app has _attempted_, searchable by address, subject or body text and filterable by kind and delivery. Failures are rows too: a confirmation that never left used to be visible only in the server log.

Bodies are shown in a sandboxed frame, so customer-supplied text in a logged message cannot execute in the dashboard. Sending is capped at 40 messages an hour per admin account, and a repeated submission of the same message inside two minutes is treated as the double-click it almost always is.

Secrets are stripped from a body before it is stored: classroom access links, seat-confirmation links and newsletter unsubscribe links keep their shape but not their token. `ClassRegistration.joinTokenHash` holds only a hash so that reading the database cannot produce a working classroom link, and the log is not allowed to undo that.

**Every admin account has the same access.** Anyone who can sign in to the dashboard can send mail as the shop to any address, read every message the shop has sent, and create further admin accounts. There are no per-account roles.

The page reads what the site itself collected and sent. It is not a mailbox client: SendGrid is send-only, so mail arriving at Tammy's own inbox is not mirrored here.

## Shipping configuration

- `FLAT_SHIPPING_CENTS=895` means $8.95 standard shipping.
- `FREE_SHIPPING_THRESHOLD_CENTS=7500` means free standard shipping at $75.00.
- Set the free-shipping threshold to `0` to disable the threshold.
- `BUSINESS_RETURN_ADDRESS` is printed in the return-address area of the simple 4 × 6 label. A postage platform can instead import `/api/admin/shipping.csv` to purchase carrier postage and create barcoded labels.

## First-launch checklist

Before accepting live orders or class registrations:

- Replace starter product descriptions, photos, ingredient lists, net contents and allergy information with Tammy’s real product data. The seeded products deliberately leave every ingredient list, allergen statement and net weight empty — those are claims about what is in a jar she made, and a fresh install must not publish an invented one.
- Check that every product is in the right category. The deploy seed files the existing catalog by matching product names, which is a guess and is meant to be; move anything it put in the wrong place from `/admin/products/<id>`.
- Review the starter shipping/returns, privacy and terms pages with the business’s final policies and professional advisers as appropriate.
- Enter a real business return address.
- Test one Stripe product order, one paid class registration, one free class registration, a refund event and a shipping update in test mode.
- Confirm that inventory decrements once and customer emails arrive as expected.
- Complete the Telnyx two-device test in `docs/telnyx-video-classes.md`.
- Replace sample gallery images with Tammy’s real work.
- Assign product attributes (pet safe, low light, beginner friendly, handmade) so the shop filters and site search have something to work with.
- Read through the seeded category pages at `/collections` and edit anything that is not true of this shop — they are starting copy, and they stop being overwritten the moment they are edited.
- Arrange the homepage rows at `/admin/merchandising`.
- Set `AMAZON_ASSOCIATE_TAG` to Tammy’s associate tag, then add one pick from a link and confirm it appears on `/amazon` with the tag on its button.
- Create Tammy’s admin account, confirm she can sign in with it, and unset the shared `ADMIN_PASSWORD` once every admin has their own.
- Verify mobile navigation, checkout, online classroom, admin login and label printing on Tammy’s actual devices.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint, including jsx-a11y rules
npm test            # node --test over tests/
npm run format      # prettier
```

CI runs all four against a real PostgreSQL service, plus the build. Two browser
audits run against a server you have started yourself:

```bash
npm install --no-save --package-lock=false playwright@1.55.0 axe-core
npm run audit:a11y                       # axe-core over the public routes
npm run audit:weight / /shop /care       # transferred bytes on an iPhone viewport
node scripts/responsive-audit.mjs        # 9 viewports x 21 routes
```

The browser tooling is installed on demand rather than kept in `package.json`,
matching what `.github/workflows/responsive-audit.yml` already does. Set
`CHROMIUM_PATH` if Playwright's own browser download is unavailable.

The unit tests deliberately cover the code where a mistake costs money or access
rather than aiming at coverage: money formatting and quantity clamping, the
loopback guard on the origin Stripe returns customers to, invoice-number
uniqueness, the rate limiter's client identification, and class join tokens.

## Local development

```bash
npm install
cp .env.example .env.local
npx prisma db push
npm run db:seed
npm run dev
```

Production build check:

```bash
npm run build
```
