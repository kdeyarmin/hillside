import CartPageClient from '@/components/CartPageClient';
import { freeShippingThresholdCents } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/cart',
  title: 'Shopping Cart',
  description:
    'Review your Hillside Gardens cart before secure Stripe Checkout.',
  noindex: true
});

export default async function CartPage({
  searchParams
}: {
  searchParams: Promise<{ restore?: string }>;
}) {
  const { restore } = await searchParams;
  const freeShippingThreshold = freeShippingThresholdCents();
  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Your basket</div>
          <h1>Shopping cart.</h1>
          <p>Review quantities before continuing to secure Stripe Checkout.</p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          <CartPageClient
            freeShippingThreshold={freeShippingThreshold}
            restoreToken={restore || null}
          />
        </div>
      </section>
    </>
  );
}
