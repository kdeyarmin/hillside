# The Hillside Gardens

Standalone ecommerce and content-management website for **The Hillside Gardens** (`thehillsidegarden.com`), built for Railway hosting.

## Stack

- Next.js 15 + React 19 + TypeScript
- PostgreSQL + Prisma
- Stripe Checkout + Stripe invoices
- Railway-ready Nixpacks deployment
- Password-protected owner dashboard

## Included

- Professional botanical storefront using the Hillside green / sage / gold brand system
- Live products and inventory from PostgreSQL
- Stripe payment checkout, shipping-address collection, receipt/invoice creation and webhook order capture
- Order dashboard with fulfillment status and tracking numbers
- Shipping-address CSV export for label software / label makers
- Inventory controls and low-stock visibility
- Plant-care-sheet library
- In-person class listings
- Amazon influencer picks with affiliate disclosure
- Past planter arrangement gallery
- Easy content manager for classes, gallery items, Amazon picks and plant care sheets

## Railway setup

1. Create a Railway project from this GitHub repository.
2. Add a PostgreSQL service to the project.
3. On the web service, set `DATABASE_URL` to the PostgreSQL connection variable.
4. Add the remaining variables from `.env.example`:
   - `NEXT_PUBLIC_SITE_URL` (your Railway URL first, then `https://thehillsidegarden.com` after the domain is connected)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
5. Deploy. Railway will use `railway.json`, run `npm run build`, and start the Next.js server on Railway's assigned `PORT`.
6. Open a Railway shell or one-off command and run:

```bash
npx prisma db push
npm run db:seed
```

7. In Stripe, create a webhook endpoint pointing to:

```text
https://YOUR-DOMAIN/api/stripe/webhook
```

Subscribe it to `checkout.session.completed`, then place the resulting webhook signing secret in `STRIPE_WEBHOOK_SECRET`.

## Admin

Go to `/admin` and use the password stored in `ADMIN_PASSWORD`.

The business dashboard handles orders, fulfillment, tracking, shipping export, inventory and product creation. The website content manager is at `/admin/content` and handles classes, gallery images, Amazon picks and plant care sheets.

## Stripe invoices

Checkout is configured with Stripe invoice creation enabled. Paid Checkout sessions are also persisted into the Hillside PostgreSQL order system, where every sale receives an `HG-########` invoice/order number.

## Shipping labels

The admin dashboard exports a CSV at `/api/admin/shipping.csv`. The output contains customer name, address, email, phone, order number, status and tracking fields and is suitable for importing into common shipping/label software.

## Development

```bash
npm install
cp .env.example .env.local
npx prisma db push
npm run db:seed
npm run dev
```

The public storefront is at `/`; owner tools are under `/admin`.
