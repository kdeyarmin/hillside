'use client';

import { useState } from 'react';
import { CAFFEINE_LABELS, productTypeLabel } from '@/lib/store';

/**
 * The category picker, and the facts that category needs.
 *
 * A pot size on a bar of soap and brewing instructions on a monstera are both
 * noise, so the form follows the category: pick Tea and it asks for net weight,
 * ingredients, brewing and caffeine; pick Plant and it asks for pot size, light,
 * water and whether the cat can be trusted with it.
 *
 * Everything that is *not* being shown is still submitted, as a hidden field
 * holding what is already stored. Otherwise a mis-clicked category followed by a
 * save would silently wipe the ingredient list off a tea — the field would
 * simply not be in the form data, and the action would read that as "cleared".
 */

type FactKind = 'text' | 'textarea' | 'petSafe' | 'caffeine';

type Fact = {
  key: string;
  label: string;
  types: string[];
  kind: FactKind;
  hint?: string;
  placeholder?: string;
};

const FACTS: Fact[] = [
  {
    key: 'potSize',
    label: 'Pot size',
    types: ['PLANT'],
    kind: 'text',
    placeholder: '4" nursery pot'
  },
  {
    key: 'lightNeeds',
    label: 'Light',
    types: ['PLANT'],
    kind: 'text',
    placeholder: 'Bright indirect light'
  },
  {
    key: 'waterNeeds',
    label: 'Water',
    types: ['PLANT'],
    kind: 'text',
    placeholder: 'When the top inch is dry'
  },
  { key: 'petSafe', label: 'Pet safety', types: ['PLANT'], kind: 'petSafe' },
  {
    key: 'netWeight',
    label: 'Net weight or contents',
    types: ['TEA', 'LOTION', 'SOAP'],
    kind: 'text',
    placeholder: '2 oz (56 g)',
    hint: 'Required before this can be listed for sale.'
  },
  {
    key: 'ingredients',
    label: 'Ingredients',
    types: ['TEA', 'LOTION', 'SOAP'],
    kind: 'textarea',
    hint: 'Required before this can be listed for sale. List them in descending order by weight.'
  },
  {
    key: 'brewingInstructions',
    label: 'Brewing instructions',
    types: ['TEA'],
    kind: 'textarea',
    placeholder: '1 tsp per cup, 200°F water, steep 4 minutes.'
  },
  { key: 'caffeineStatus', label: 'Caffeine', types: ['TEA'], kind: 'caffeine' }
];

export type ProductFactValues = {
  type: string;
  potSize: string | null;
  lightNeeds: string | null;
  waterNeeds: string | null;
  petSafe: boolean | null;
  netWeight: string | null;
  ingredients: string | null;
  brewingInstructions: string | null;
  caffeineStatus: string | null;
};

function petSafeValue(petSafe: boolean | null | undefined) {
  if (petSafe === true) return 'yes';
  if (petSafe === false) return 'no';
  return '';
}

export default function ProductFacts({
  productTypes,
  values
}: {
  productTypes: string[];
  values?: ProductFactValues;
}) {
  const [type, setType] = useState(values?.type || productTypes[0]);
  const stored: Record<string, string> = {
    potSize: values?.potSize || '',
    lightNeeds: values?.lightNeeds || '',
    waterNeeds: values?.waterNeeds || '',
    petSafe: petSafeValue(values?.petSafe),
    netWeight: values?.netWeight || '',
    ingredients: values?.ingredients || '',
    brewingInstructions: values?.brewingInstructions || '',
    caffeineStatus: values?.caffeineStatus || ''
  };

  return (
    <>
      <label className="admin-label">
        Category
        <select
          className="admin-input"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {productTypes.map((option) => (
            <option value={option} key={option}>
              {productTypeLabel(option)}
            </option>
          ))}
        </select>
      </label>

      {FACTS.map((fact) => {
        const applies = fact.types.includes(type);
        if (!applies) {
          return (
            <input type="hidden" name={fact.key} value={stored[fact.key]} key={fact.key} readOnly />
          );
        }

        return (
          <label className={`admin-label${fact.kind === 'textarea' ? ' full' : ''}`} key={fact.key}>
            {fact.label}
            {fact.kind === 'textarea' && (
              <textarea
                className="admin-input"
                name={fact.key}
                rows={3}
                defaultValue={stored[fact.key]}
                placeholder={fact.placeholder}
              />
            )}
            {fact.kind === 'text' && (
              <input
                className="admin-input"
                name={fact.key}
                defaultValue={stored[fact.key]}
                placeholder={fact.placeholder}
              />
            )}
            {fact.kind === 'petSafe' && (
              <select className="admin-input" name={fact.key} defaultValue={stored[fact.key]}>
                <option value="">Not answered yet</option>
                <option value="yes">Safe around cats and dogs</option>
                <option value="no">Keep out of reach of pets</option>
              </select>
            )}
            {fact.kind === 'caffeine' && (
              <select className="admin-input" name={fact.key} defaultValue={stored[fact.key]}>
                <option value="">Not answered yet</option>
                {Object.entries(CAFFEINE_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {fact.hint && <span className="admin-hint">{fact.hint}</span>}
          </label>
        );
      })}
    </>
  );
}
