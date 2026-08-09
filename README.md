# The Hillside Gardens

A standalone ecommerce, class-registration and owner-operations website for **The Hillside Gardens** (`thehillsidegarden.com`). The application is designed for Railway hosting and for Tammy Hill to run from a simple password-protected dashboard.

## Technology

- Next.js 15, React 19 and TypeScript
- PostgreSQL with Prisma
- Stripe Checkout, invoices, promotion codes, shipping and optional automatic tax
- Railway Railpack deployment with a pre-deploy database schema step
- Optional transactional email through Resend
- No Base44 or proprietary site builder

## Public website

- Professional botanical storefront based on the Hillside green, sage and gold logo system
- Searchable and filterable live product catalog
- Individual SEO-ready product pages with live inventory
- Persistent shopping cart and secure Stripe Checkout
- Configurable flat or free standard shipping
- Customer order-confirmation page and Stripe invoice link
- Self-service order-status lookup
- Paid planter-class registration with live seat availability
- Printable houseplant care sheets and detailed care pages
- Gallery of Tammy’s past planter arrangements
- Tammy’s Amazon influencer picks with affiliate disclosure
- Newsletter signup and customer contact form
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
- Paid class registrations and seat counts
- Customer website inbox
- Newsletter subscriber management
- A separate content manager at `/admin/content` for classes, care sheets, gallery items and Amazon picks

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
7. After the custom domain is connected, change `NEXT_PUBLIC_SITE_URL` to `https://thehillsidegarden.com` and redeploy.

## Stripe setup

Create a Stripe webhook endpoint at:

```text
https://YOUR-DOMAIN/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Product purchases and class registrations are identified through signed Checkout metadata. Fulfillment is idempotent, so a repeated Stripe event does not create a second order or registration.

Set `STRIPE_AUTOMATIC_TAX=true` only after Stripe Tax has been configured for the business. Stripe Checkout emails receipts and creates invoices for paid product and class sessions.

## Optional customer email

The site works without Resend; Stripe still sends its payment documents. To send branded Hillside order, shipping, class, contact and newsletter messages:

1. Verify the sending domain with Resend.
2. Add `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Set `BUSINESS_EMAIL` to Tammy’s inbox.

## Shipping configuration

- `FLAT_SHIPPING_CENTS=895` means $8.95 standard shipping.
- `FREE_SHIPPING_THRESHOLD_CENTS=7500` means free standard shipping at $75.00.
- Set the free-shipping threshold to `0` to disable the threshold.
- `BUSINESS_RETURN_ADDRESS` is printed in the return-address area of the simple 4 × 6 label. A postage platform can instead import `/api/admin/shipping.csv` to purchase carrier postage and create barcoded labels.

## First-launch checklist

Before accepting live orders:

- Replace starter product descriptions, photos, ingredient lists, net contents and allergy information with Tammy’s real product data.
- Review the starter shipping/returns, privacy and terms pages with the business’s final policies and professional advisers as appropriate.
- Enter a real business return address.
- Test one Stripe product order, one class registration, a refund event and a shipping update in test mode.
- Confirm that inventory decrements once and customer emails arrive as expected.
- Replace sample gallery images with Tammy’s real work.
- Verify mobile navigation, checkout, admin login and label printing on Tammy’s actual devices.

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
