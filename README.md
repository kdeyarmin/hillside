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
- Site-wide search across products, care guides and classes
- Searchable and filterable live product catalog, with sale and new-arrival sorting
- Individual SEO-ready product pages with live inventory, multiple photographs and customer reviews
- Back-in-stock email alerts on sold-out products
- Persistent shopping cart and secure Stripe Checkout
- Configurable flat or free standard shipping
- Customer order-confirmation page and Stripe invoice link
- Self-service order-status lookup
- Paid and free class registration with live seat availability
- In-person, online and hybrid classes
- Private emailed links to Telnyx Video classrooms
- Printable houseplant care sheets and detailed care pages
- Gallery of Tammy’s past planter arrangements
- Tammy’s Amazon influencer picks with affiliate disclosure
- Newsletter signup, cart saving and customer contact form
- Care guides that link through to the plant they describe and to upcoming classes
- Google Analytics 4 ecommerce events (opt-in through an environment variable)
- LocalBusiness and Event structured data, plus a purpose-built social share image
- About, FAQ, shipping/returns, privacy and terms pages
- Sitemap, robots file, web manifest and structured data

## Owner dashboard

The dashboard at `/admin` includes:

- Revenue and operations overview
- Order fulfillment, private notes, carrier and tracking entry
- Automatic customer shipping-update email when an order is marked fulfilled
- Packing-slip and 4 × 6 shipping-label printing
- Shipping-address, full-order and newsletter-subscriber CSV exports
- Product creation and editing, price, sale price, SKU, inventory, badges and featured products
- Low-stock visibility and product archiving
- Paid and free class registrations and seat counts
- Customer website inbox
- Newsletter subscriber management
- Customer review moderation with optional public replies
- Restock request list, emailed automatically when stock returns
- Collection management and per-product collection assignment
- Visibility of products still missing their own photograph
- Order confirmation email delivery status
- A separate content manager at `/admin/content` for classes, care sheets, gallery items and Amazon picks
- Online class creation, Telnyx room preparation and a private host studio
- Online-class confirmation status, attendee last-join time and secure link resending

## Railway deployment

1. Create a Railway project from `kdeyarmin/hillside`.
2. Add a PostgreSQL service.
3. Add the variables from `.env.example` to the web service. Railway supplies the PostgreSQL `DATABASE_URL` when the database is linked.
4. Deploy. `railway.json` runs `npx prisma db push` as a pre-deploy command, then starts Next.js on Railway’s assigned `PORT`.
5. Run the starter-data command once from a Railway shell or one-off command:

```bash
npm run db:seed
```

6. Generate a Railway public domain, then set `NEXT_PUBLIC_SITE_URL` to that full URL.
7. After the custom domain is connected, change `NEXT_PUBLIC_SITE_URL` to `https://thehillsidegardens.com` and redeploy.

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

## Stripe setup

Create a Stripe webhook endpoint at:

```text
https://YOUR-DOMAIN/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Product purchases and class registrations are identified through signed Checkout metadata. Fulfillment is idempotent, so a repeated Stripe event does not create a second order or registration. When a paid online class is fulfilled, the webhook creates and emails the customer’s secure classroom access link.

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
- Verify mobile navigation, checkout, online classroom, admin login and label printing on Tammy’s actual devices.

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
