import CartPageClient from '@/components/CartPageClient';
import { freeShippingThresholdCents } from '@/lib/store';

export const metadata = {
  title: 'Shopping Cart',
  description: 'Review your Hillside Gardens cart before secure Stripe Checkout.'
};

export default function CartPage() {
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
          <CartPageClient freeShippingThreshold={freeShippingThreshold} />
        </div>
      </section>
    </>
  );
}
