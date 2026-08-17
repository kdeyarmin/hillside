import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/shipping-returns',
  title: 'Shipping, Pickup & Returns',
  description:
    'Shipping, weather-delay, local-pickup, damage and return information for The Hillside Gardens.'
});

export default function ShippingReturnsPage() {
  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Customer care</div>
          <h1>Shipping, pickup and returns.</h1>
          <p>
            How The Hillside Gardens protects living plants and small-batch goods from our hands to
            your home.
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          <article className="narrow prose">
            <p>
              <strong>Last updated: August 17, 2026.</strong>
            </p>
            <h2>Order preparation</h2>
            <p>
              Most in-stock orders are prepared within 2–4 business days. Handmade, custom-potted or
              made-to-order items may need additional time. Estimated delivery dates begin after the
              carrier receives the package and are not guaranteed.
            </p>

            <h2>Shipping charges</h2>
            <p>
              Available shipping methods and the exact charge are shown before payment in Stripe
              Checkout. Promotional free-shipping thresholds may change. Oversized planters, custom
              arrangements and certain live plants may be available only for local pickup.
            </p>

            <h2>Weather and live plants</h2>
            <p>
              Living plants can be damaged by extreme heat or freezing temperatures. The Hillside
              Gardens may hold a plant shipment until a safer weather window. If a delay is
              necessary, we will contact the customer using the checkout email or phone number.
            </p>
            <p>
              Customers are responsible for providing a deliverable address and retrieving
              live-plant packages promptly after delivery. The Hillside Gardens is not responsible
              for damage caused by a package left outdoors after confirmed delivery.
            </p>

            <h2>Local pickup</h2>
            <p>
              Contact us to arrange a time first. After we confirm, choose local pickup at checkout
              when the items allow it. Some oversized or delicate pieces are pickup only — the
              product page will say so. A pickup is not ready to collect until you receive our
              confirmation that it is waiting. Exact pickup instructions are provided privately for
              safety and scheduling.
            </p>

            <h2>Damage in transit</h2>
            <p>
              Open packages promptly. If an item arrives materially damaged, contact The Hillside
              Gardens within 48 hours of delivery and include the order number, a description,
              photographs of the item, packaging and shipping label. We will review the situation
              and may offer a replacement, store credit or refund depending on inventory and the
              type of damage.
            </p>
            <p>
              Minor soil movement, a bent leaf, normal leaf variation or temporary stress after
              shipping does not necessarily mean a plant is unhealthy. We may provide recovery
              instructions before determining that replacement is appropriate.
            </p>

            <h2>Returns</h2>
            <p>
              Live plants, teas, opened personal-care products, custom arrangements, class
              registrations and clearance items are generally final sale unless they arrive damaged,
              are incorrect or applicable law requires otherwise.
            </p>
            <p>
              Unopened, unused nonperishable merchandise may be eligible for return within 14 days
              of delivery after we authorize the return. Original shipping charges are not
              refundable, and return shipping is normally the customer’s responsibility. Do not send
              an item back without contacting The Hillside Gardens first.
            </p>

            <h2>Class cancellations</h2>
            <p>
              Class registration terms may be listed with the specific event. When no event-specific
              terms are shown, contact us as early as possible. A transfer to another guest or
              future class may be available, but materials purchased for a class can limit refunds
              close to the event date. If The Hillside Gardens cancels a class, registered customers
              will be offered a refund or transfer.
            </p>

            <h2>Start a request</h2>
            <p>
              Use the{' '}
              <Link className="text-link" href="/contact">
                contact form
              </Link>{' '}
              and include the HG order number. We will respond with the next step.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
