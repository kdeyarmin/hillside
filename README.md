# The Hillside Gardens

A standalone ecommerce, class-registration and owner-operations website for **The Hillside Gardens** (`thehillsidegardens.com`). The application is designed for Railway hosting and for Tammy Hill to run from a simple password-protected dashboard.

## Technology

- Next.js 15, React 19 and TypeScript
- PostgreSQL with Prisma
- Stripe Checkout, invoices, promotion codes, shipping and optional automatic tax
- Telnyx Video Rooms for secure browser-based online classes
- Railway Railpack deployment with a pre-deploy database schema step
- Transactional customer email through Resend
- No Base44 or proprietary site builder

## Public website

- Professional botanical storefront based on the Hillside green, sage and gold logo system
- Owner-managed collections with their own pages, assigned from the dashboard
- Site-wide search across products and care guides
- Searchable and filterable live product catalog, with sale and new-arrival sorting
- Individual SEO-ready product pages with live inventory, multiple photographs and customer reviews
- A size dropdown on products sold in more than one size, each size with its own price
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
- Product creation and editing, price, sale price, SKU, inventory, badges and featured products
- Per-product size choices, typed one per line, with a price on any size that costs something different
- Low-stock visibility and product archiving
- Paid and free class registrations and seat counts
- Customer website inbox
- Newsletter subscriber management
- Customer review moderation with optional public replies
- Restock request list, emailed automatically when stock returns
- Collection management and per-product collection assignment
- Visibility of products still missing their own photograph
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

## Products sold in more than one size

A product that comes in several sizes — a plant in a 4", 6" or 8" pot, a lotion
in a 2 oz or an 8 oz jar — gets a **Sizes to choose from** box on its dashboard
form. Type one size per line, and put a price after a `|` for any size that
costs something different from the product's own price:

```
4" pot
6" pot | 24.00
8" pot | 32.00
```

A size with no price after it is sold at the product's price, so raising that
price moves those sizes with it — and a price typed in that merely repeats the
product's own is stored as "the base price" rather than pinned to today's
figure, so it keeps following along. **What the size dropdown is called** renames
the field on the storefront — "Pot size", "Jar size" — and defaults to "Size".
Leave the box empty for anything sold one way, and the storefront behaves
exactly as it did before.

What the shop then does:

- The product page shows the price span (`$18.00 – $32.00`) and a dropdown with
  each size and its price. Nothing is preselected and Add to cart stays disabled
  until the customer chooses, so a wrong size cannot be added by accident.
- A shop card cannot take that choice, so on a sized product its button reads
  **Choose pot size** and leads to the product page. A cart-drawer suggestion
  does the same, in the shorter words its narrow strip has room for.
- Each size is its own basket line, so one order can hold a 4" and a 6" pot of
  the same plant. The size travels with the line into Stripe Checkout, the
  emailed receipt, the confirmation email, the packing slip, the order CSV and
  the order-status lookup — everywhere the shop has to know which one to pack.
- **Every size draws on the one quantity on hand.** Sizes are a choice about
  what to pack, not separate shelves to count: three jars is three jars however
  they are split between sizes, and checkout says so if a basket asks for more.
  Anything that needs its own stock count, SKU or photograph is a separate
  product.
- A **compare-at price stands down** on a product whose sizes are priced
  differently. "Was $24, save 25%" is a claim about _the_ price, and such a
  product does not have one — the range says what each size costs instead.
- A size the owner later removes cannot be ordered. A basket or a saved cart
  still holding it is corrected at checkout with a note asking for the size to be
  chosen again, rather than being quietly filled with a different one.

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
only choose a `sizeRole` (`hero`, `card`, `tile`, `detail`, `thumb`). Owner-uploaded
photographs served from `/media/` have no variants and fall back to a plain `src`.

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

Product checkout now reserves stock on a `PENDING` order for 35 minutes, matching the Stripe session `expires_at`. Subscribe `checkout.session.expired` (and `async_payment_failed`) so abandoned checkouts return that stock; a sweep on the next checkout also releases holds whose webhook was missed.

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

Resend is required to email online-class access links. To send branded Hillside order, shipping, class, contact and newsletter messages:

1. Verify the sending domain with Resend.
2. Add `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Set `BUSINESS_EMAIL` to Tammy’s inbox.

Product ordering still works without Resend because Stripe can send payment documents. Online class registrations are saved without Resend, but Tammy must configure email and use the host studio’s **Resend link** action before customers can receive their private classroom URL.

## Shipping configuration

- `FLAT_SHIPPING_CENTS=895` means $8.95 standard shipping.
- `FREE_SHIPPING_THRESHOLD_CENTS=7500` means free standard shipping at $75.00.
- Set the free-shipping threshold to `0` to disable the threshold.
- `BUSINESS_RETURN_ADDRESS` is printed in the return-address area of the simple 4 × 6 label. A postage platform can instead import `/api/admin/shipping.csv` to purchase carrier postage and create barcoded labels.

## First-launch checklist

Before accepting live orders or class registrations:

- Replace starter product descriptions, photos, ingredient lists, net contents and allergy information with Tammy’s real product data.
- Review the starter shipping/returns, privacy and terms pages with the business’s final policies and professional advisers as appropriate.
- Enter a real business return address.
- Test one Stripe product order, one paid class registration, one free class registration, a refund event and a shipping update in test mode.
- Confirm that inventory decrements once and customer emails arrive as expected.
- Complete the Telnyx two-device test in `docs/telnyx-video-classes.md`.
- Replace sample gallery images with Tammy’s real work.
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
node scripts/responsive-audit.mjs        # 7 viewports x 14 routes
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
