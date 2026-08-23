/**
 * What each kind of thing on the site is searchable *by*.
 *
 * Search used to read three columns on a product — name, short description,
 * description — which is why "pet safe", "low light", "beginner" and every Latin
 * name found nothing unless the copy happened to contain the phrase. The fields
 * are gathered here rather than repeated in the shop, the site search and the
 * recommendations route, so the three cannot drift into answering the same query
 * differently.
 *
 * Fields are split into `primary` (what a shopper believes they are searching —
 * the name) and `secondary` (everything else that should still find it), which
 * is what lets the results page rank a product called "Pothos" above one whose
 * care note mentions pothos in passing.
 */

import { tagSearchText } from './product-tags.ts';
import { productTypeLabel, productTypePlural } from './store.ts';

export type SearchFields = {
  primary: Array<string | null | undefined>;
  secondary: Array<string | null | undefined>;
};

export type SearchableCollection = {
  title: string;
  tagline?: string | null;
  keywords?: readonly string[] | null;
};

export type SearchableProduct = {
  categoryTitle?: string | null;
  category?: { title: string; keywords?: readonly string[] | null } | null;
  name: string;
  slug?: string;
  sku?: string | null;
  botanical?: string | null;
  searchTerms?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  details?: string | null;
  careNotes?: string | null;
  badge?: string | null;
  type?: string | null;
  tags?: readonly string[] | null;
  collections?: readonly SearchableCollection[] | null;
};

/**
 * @param derivedTags attributes the shop worked out rather than stored — new,
 * best seller, in stock — so "best sellers" as a search term finds them.
 */
export function productSearchFields(
  product: SearchableProduct,
  derivedTags: readonly string[] = []
): SearchFields {
  const type = product.type || '';
  const tags = Array.from(new Set([...(product.tags || []), ...derivedTags]));
  const collections = product.collections || [];

  return {
    primary: [product.name, product.botanical],
    secondary: [
      product.shortDescription,
      product.description,
      product.details,
      product.careNotes,
      product.searchTerms,
      product.badge,
      product.sku,
      // The category is searchable, so "carnivorous" finds the flytraps whether
      // or not the word appears anywhere in their own copy.
      product.categoryTitle ?? product.category?.title ?? null,
      /**
       * And the words the owner gave that category. The category editor
       * promises these reach the site search; without this they reached
       * nothing, so a synonym she stored on "carnivorous plants" found neither
       * the category nor a single sundew.
       */
      (product.category?.keywords || []).join(' ') || null,
      type ? `${productTypeLabel(type)} ${productTypePlural(type)}` : null,
      tagSearchText(tags),
      collections
        .map((collection) =>
          [collection.title, collection.tagline, ...(collection.keywords || [])].join(' ')
        )
        .join('\n')
    ]
  };
}

export type SearchableCareSheet = {
  plantName: string;
  botanical?: string | null;
  category?: string | null;
  summary?: string | null;
  symptoms?: string | null;
  causes?: string | null;
  treatment?: string | null;
  tips?: string | null;
  petSafety?: string | null;
  difficulty?: string | null;
  light?: string | null;
  water?: string | null;
};

export function careSheetSearchFields(sheet: SearchableCareSheet): SearchFields {
  return {
    primary: [sheet.plantName, sheet.botanical],
    secondary: [
      sheet.summary,
      sheet.category,
      sheet.symptoms,
      sheet.causes,
      sheet.treatment,
      sheet.tips,
      sheet.petSafety,
      sheet.difficulty,
      sheet.light,
      sheet.water
    ]
  };
}

export type SearchableCollectionPage = SearchableCollection & {
  description?: string | null;
  intro?: string | null;
};

export function collectionSearchFields(collection: SearchableCollectionPage): SearchFields {
  return {
    primary: [collection.title],
    secondary: [
      collection.tagline,
      collection.description,
      collection.intro,
      (collection.keywords || []).join(' ')
    ]
  };
}

export function classSearchFields(event: {
  title: string;
  description?: string | null;
  location?: string | null;
}): SearchFields {
  return { primary: [event.title], secondary: [event.description, event.location] };
}
