'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export type PickableProduct = {
  id: string;
  name: string;
  type?: string | null;
  sku?: string | null;
};

/**
 * Choose products from the catalog by typing part of a name.
 *
 * The alternative — a `<select multiple>` of every product — is unusable past
 * about thirty rows on a tablet, which is where this dashboard is actually used.
 * Checkboxes stay in the form whether or not the filter is currently showing
 * them, so a search that hides an already-ticked product cannot silently
 * unlink it: the chosen ones are pinned to the top of the list.
 */
export default function AdminProductPicker({
  name,
  products,
  selectedIds = [],
  legend,
  hint,
  limit = 12
}: {
  /** Form field name; one value per chosen product. */
  name: string;
  products: PickableProduct[];
  selectedIds?: string[];
  legend: string;
  hint?: string;
  /** How many unselected matches to show at once. */
  limit?: number;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>(selectedIds);

  const { picked, matches } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const chosenSet = new Set(chosen);
    const picked = products.filter((product) => chosenSet.has(product.id));
    const rest = products.filter((product) => !chosenSet.has(product.id));
    const matches = (
      needle
        ? rest.filter((product) =>
            `${product.name} ${product.sku || ''}`.toLowerCase().includes(needle)
          )
        : rest
    ).slice(0, limit);
    return { picked, matches };
  }, [chosen, limit, products, query]);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );

  return (
    <fieldset className="admin-picker">
      <legend>{legend}</legend>
      {hint && <span className="admin-hint">{hint}</span>}
      <div className="search-wrap admin-picker-search">
        <Search size={16} aria-hidden="true" />
        <input
          className="search-input"
          type="search"
          value={query}
          placeholder="Type part of a product name"
          onChange={(event) => setQuery(event.target.value)}
          aria-label={`Search products for ${legend}`}
        />
      </div>
      <div className="admin-picker-list">
        {picked.map((product) => (
          <label className="admin-checkbox picked" key={product.id}>
            <input
              type="checkbox"
              name={name}
              value={product.id}
              checked
              onChange={() => toggle(product.id)}
            />{' '}
            {product.name}
          </label>
        ))}
        {matches.map((product) => (
          <label className="admin-checkbox" key={product.id}>
            <input
              type="checkbox"
              name={name}
              value={product.id}
              checked={false}
              onChange={() => toggle(product.id)}
            />{' '}
            {product.name}
          </label>
        ))}
        {!picked.length && !matches.length && (
          <span className="muted">No products match that.</span>
        )}
      </div>
    </fieldset>
  );
}
