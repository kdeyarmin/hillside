import CartIntro from '@/components/CartIntro';
import CartPageClient from '@/components/CartPageClient';
import InlineNewsletter from '@/components/InlineNewsletter';
import { catalogHasActiveProducts } from '@/lib/catalog';
import { freeShippingThresholdCents } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/cart',
  title: 'Shopping Cart',
  description: 'Review your Hillside Gardens cart before secure Stripe Checkout.',
  noindex: true
});

export default async function CartPage({
  searchParams
}: {
  searchParams: Promise<{ restore?: string; canceled?: string }>;
}) {
  const { restore, canceled } = await searchParams;
  const [catalogEmpty, freeShippingThreshold] = await Promise.all([
    catalogHasActiveProducts().then((hasStock) => !hasStock),
    Promise.resolve(freeShippingThresholdCents())
  ]);
  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Your basket</div>
          <h1>Shopping cart.</h1>
          <CartIntro catalogEmpty={catalogEmpty} />
        </div>
      </section>
      <section className="content">
        <div className="container">
          <CartPageClient
            catalogEmpty={catalogEmpty}
            freeShippingThreshold={freeShippingThreshold}
            restoreToken={restore || null}
            canceledSessionId={canceled || null}
          />
          <InlineNewsletter
            source="cart"
            heading="Not ready to check out?"
            blurb="Your basket is saved on this device. Join the list and we will tell you when new pieces come off the bench."
          />
        </div>
      </section>
    </>
  );
}
