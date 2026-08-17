import CartPageClient from '@/components/CartPageClient';
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
  searchParams: Promise<{ restore?: string }>;
}) {
  const { restore } = await searchParams;
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
          <p>
            {catalogEmpty
              ? 'The bench is between batches, so there is nothing new to add right now.'
              : 'Review quantities before continuing to secure Stripe Checkout.'}
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          <CartPageClient
            catalogEmpty={catalogEmpty}
            freeShippingThreshold={freeShippingThreshold}
            restoreToken={restore || null}
          />
        </div>
      </section>
    </>
  );
}
