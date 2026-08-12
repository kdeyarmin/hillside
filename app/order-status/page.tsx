import OrderStatusLookup from '@/components/OrderStatusLookup';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/order-status',
  title: 'Order Status',
  description:
    'Check the fulfillment and shipping status of an order from The Hillside Gardens.',
  noindex: true
});

export default function OrderStatusPage() {
  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Customer care</div>
          <h1>Check an order.</h1>
          <p>Enter the Hillside order number and checkout email exactly as they appear on your receipt.</p>
        </div>
      </section>
      <section className="content">
        <div className="container">
          <OrderStatusLookup />
        </div>
      </section>
    </>
  );
}
