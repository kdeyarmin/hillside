'use client';

import { useState } from 'react';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { useCart, type CartProduct } from '@/components/CartProvider';

export default function AddToCartButton({ product }: { product: CartProduct }) {
  const { addItem, openCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const soldOut = product.inventory <= 0;

  function add() {
    addItem(product, quantity);
    openCart();
  }

  return (
    <div className="add-to-cart-panel">
      {/* role="group" so the label is exposed — a bare div is `generic`,
          where aria-label is ignored. The cart drawer already does this. */}
      <div className="quantity-picker" role="group" aria-label="Quantity">
        <button
          type="button"
          onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          aria-label="Decrease quantity"
        >
          <Minus size={16} />
        </button>
        <span>{quantity}</span>
        <button
          type="button"
          onClick={() => setQuantity((value) => Math.min(product.inventory, value + 1))}
          aria-label="Increase quantity"
          disabled={quantity >= product.inventory}
        >
          <Plus size={16} />
        </button>
      </div>
      <button className="btn add-button" type="button" disabled={soldOut} onClick={add}>
        <ShoppingBag size={18} />
        {soldOut ? 'Sold out' : 'Add to cart'}
      </button>
    </div>
  );
}
