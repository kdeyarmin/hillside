type GtagItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  price: number;
  quantity?: number;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function send(name: string, params: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.gtag?.('event', name, params);
}

export function trackViewItem(item: GtagItem) {
  send('view_item', { currency: 'USD', value: item.price, items: [item] });
}

export function trackAddToCart(item: GtagItem) {
  send('add_to_cart', {
    currency: 'USD',
    value: item.price * (item.quantity || 1),
    items: [item]
  });
}

export function trackBeginCheckout(items: GtagItem[], valueCents: number) {
  send('begin_checkout', { currency: 'USD', value: valueCents / 100, items });
}

export function trackPurchase(transactionId: string, items: GtagItem[], valueCents: number) {
  send('purchase', {
    transaction_id: transactionId,
    currency: 'USD',
    value: valueCents / 100,
    items
  });
}

export function trackSearch(term: string) {
  send('search', { search_term: term });
}

export function trackSignUp(method: string) {
  send('sign_up', { method });
}

export function toGtagItem(
  product: {
    slug: string;
    name: string;
    type?: string;
    priceCents: number;
  },
  quantity = 1
): GtagItem {
  return {
    item_id: product.slug,
    item_name: product.name,
    item_category: product.type,
    price: product.priceCents / 100,
    quantity
  };
}
