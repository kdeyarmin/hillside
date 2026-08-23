import { InventoryStatus, type ProductSpecKind, type ProductType } from '@prisma/client';
import AdminProductPicker from '@/components/AdminProductPicker';
import ProductPhotoManager from '@/components/ProductPhotoManager';
import { groupTags, PRODUCT_TAGS } from '@/lib/product-tags';
import {
  INVENTORY_STATUS_HINTS,
  INVENTORY_STATUS_LABELS,
  inventoryStatusValue,
  restockDateValue
} from '@/lib/inventory';
import { SPEC_KIND_BY_TYPE, SPEC_KIND_LABELS } from '@/lib/product-categories';
import {
  readProductSpecs,
  specGroupsFor,
  specInputName,
  type SpecField
} from '@/lib/product-specs';
import {
  MAX_SIZE_OPTIONS,
  sizeStockSummary,
  storedSizesTrackStock,
  readStoredSizes,
  variantEditorRows,
  variantFulfillmentChoice,
  VARIANT_FIELD_NAMES,
  VARIANT_FULFILLMENT_CHOICES,
  type StoredSize
} from '@/lib/product-sizes';
import { formatMoney, productTypeLabel } from '@/lib/store';

export type AdminCategoryOption = {
  id: string;
  title: string;
  slug: string;
  specKind: ProductSpecKind;
  active: boolean;
};

export type AdminProductDraft = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string;
  details: string | null;
  careNotes: string | null;
  shippingNote: string | null;
  ships?: boolean;
  pickup?: boolean;
  type: ProductType;
  categoryId: string | null;
  priceCents: number;
  compareAtCents: number | null;
  inventory: number;
  imageUrl: string | null;
  lifestyleImageUrl: string | null;
  detailImageUrl: string | null;
  scaleImageUrl: string | null;
  packagingImageUrl: string | null;
  supplier: string | null;
  supplierItemNumber: string | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  inventoryNotes: string | null;
  inventoryStatus: InventoryStatus;
  lastRestockedAt: Date | null;
  badge: string | null;
  botanical: string | null;
  searchTerms: string | null;
  staffPick: boolean;
  tags: string[];
  seasonStartsAt: Date | null;
  seasonEndsAt: Date | null;
  relatedProducts?: Array<{ id: string }>;
  crossSells?: Array<{ id: string }>;
  bundleItems?: Array<{ id: string }>;
  active: boolean;
  featured: boolean;
  sortOrder: number;
  galleryImages: string[];
  sizes: unknown;
  sizeLabel: string | null;
  specs: unknown;
  weightOunces: number | null;
  dimensions: string | null;
  collections?: Array<{ id: string }>;
};

const money = (cents: number) => (cents / 100).toFixed(2);

/**
 * One structured detail field. Suggestions go in a `<datalist>` rather than a
 * `<select>`: the usual answers are two keystrokes away and an answer nobody
 * anticipated is still typeable, which matters because "bright indirect, but it
 * copes with a north window" is a real light requirement.
 */
function SpecInput({
  field,
  kind,
  value
}: {
  field: SpecField;
  kind: ProductSpecKind;
  value: string;
}) {
  const listId = `spec-${kind}-${field.key}-options`;
  return (
    <label className={`admin-label${field.long ? ' full' : ''}`}>
      {field.label}
      {field.long ? (
        <textarea
          className="admin-input"
          name={specInputName(field.key)}
          rows={3}
          defaultValue={value}
          placeholder={field.placeholder}
        />
      ) : (
        <input
          className="admin-input"
          name={specInputName(field.key)}
          defaultValue={value}
          placeholder={field.placeholder}
          list={field.suggestions ? listId : undefined}
        />
      )}
      {field.suggestions && (
        <datalist id={listId}>
          {field.suggestions.map((suggestion) => (
            <option value={suggestion} key={suggestion} />
          ))}
        </datalist>
      )}
      {field.hint && <span className="admin-hint">{field.hint}</span>}
    </label>
  );
}

/**
 * The detail fields for one kind of product. Every kind is rendered, and all but
 * the one the chosen category asks for is hidden — so switching the category
 * dropdown swaps the questions on the spot, and with scripting off the fields
 * for the saved category are the ones on screen.
 *
 * Values are looked up by field key across every kind, which is why re-shelving
 * a soap as an apothecary good keeps its ingredient list: both kinds ask for
 * `ingredients`, and both read the same stored value.
 */
function SpecSections({
  kind,
  activeKind,
  specs
}: {
  kind: ProductSpecKind;
  activeKind: ProductSpecKind;
  specs: Record<string, string>;
}) {
  const inactive = kind !== activeKind;
  return (
    /**
     * A `<fieldset>` rather than a `<div>`, and disabled rather than merely
     * hidden. Several kinds ask for the same field — `ingredients` belongs to
     * teas, soaps and lotions alike — so every kind's copy of it is in the page
     * under the same name. A hidden input is still submitted, and the server
     * would read the first one it finds: the owner's edit to the visible field
     * would be thrown away in favour of the stale copy above it. Disabling the
     * fieldset takes its whole subtree out of the submission, which is what
     * makes "only the chosen category's fields are saved" true rather than
     * merely apparent.
     */
    <fieldset
      className="admin-spec-kind"
      data-spec-kind={kind}
      hidden={inactive}
      disabled={inactive}
    >
      {specGroupsFor(kind).map((group) => (
        <fieldset className="admin-spec-group" key={group.title}>
          <legend>{group.title}</legend>
          {group.hint && <p className="admin-hint">{group.hint}</p>}
          <div className="admin-form-grid">
            {group.fields.map((field) => (
              <SpecInput field={field} kind={kind} value={specs[field.key] || ''} key={field.key} />
            ))}
          </div>
        </fieldset>
      ))}
    </fieldset>
  );
}

function variantSummary(variant: StoredSize, basePriceCents: number, counted: boolean) {
  if (!variant.label) return 'New variant';
  const price = formatMoney(variant.priceCents ?? basePriceCents);
  const stock = counted ? ` · ${Math.max(0, variant.inventory ?? 0)} on hand` : '';
  return `${variant.label} — ${price}${stock}`;
}

function VariantRow({
  variant,
  basePriceCents,
  counted,
  index
}: {
  variant: StoredSize;
  basePriceCents: number;
  counted: boolean;
  index: number;
}) {
  const blank = !variant.label;
  return (
    <div className="admin-variant" data-variant-row>
      <div className="admin-variant-head">
        <span className="admin-variant-title">
          {blank ? `Variant ${index + 1}` : variantSummary(variant, basePriceCents, counted)}
        </span>
      </div>
      <div className="admin-form-grid admin-variant-main">
        <label className="admin-label">
          Variant name
          <input
            className="admin-input"
            name={VARIANT_FIELD_NAMES.label}
            defaultValue={variant.label}
            placeholder={'6" nursery pot'}
          />
        </label>
        <label className="admin-label">
          Price
          <input
            className="admin-input"
            name={VARIANT_FIELD_NAMES.price}
            type="number"
            min="0"
            step="0.01"
            defaultValue={variant.priceCents == null ? '' : money(variant.priceCents)}
            placeholder="same as the product"
          />
        </label>
        <label className="admin-label">
          Quantity on hand
          <input
            className="admin-input"
            name={VARIANT_FIELD_NAMES.inventory}
            type="number"
            min="0"
            defaultValue={variant.inventory == null ? '' : variant.inventory}
            placeholder="shares the product’s"
          />
        </label>
      </div>
      <details className="admin-variant-more">
        <summary>SKU, weight, size, photo and how it gets home</summary>
        <div className="admin-form-grid">
          <label className="admin-label">
            SKU / item number
            <input
              className="admin-input"
              name={VARIANT_FIELD_NAMES.sku}
              defaultValue={variant.sku || ''}
              placeholder="same as the product"
            />
          </label>
          <label className="admin-label">
            Shipping weight (oz)
            <input
              className="admin-input"
              name={VARIANT_FIELD_NAMES.weightOunces}
              type="number"
              min="0"
              step="1"
              defaultValue={variant.weightOunces == null ? '' : variant.weightOunces}
            />
          </label>
          <label className="admin-label">
            Dimensions
            <input
              className="admin-input"
              name={VARIANT_FIELD_NAMES.dimensions}
              defaultValue={variant.dimensions || ''}
              placeholder={'6" pot, 14" tall overall'}
            />
          </label>
          <label className="admin-label">
            How it gets home
            <select
              className="admin-input"
              name={VARIANT_FIELD_NAMES.fulfillment}
              defaultValue={variantFulfillmentChoice(variant)}
            >
              {VARIANT_FULFILLMENT_CHOICES.map(([value, label]) => (
                <option value={value} key={value || 'inherit'}>
                  {label}
                </option>
              ))}
            </select>
            <span className="admin-hint">
              A big specimen that cannot post safely can be pickup only while the small pots ship.
            </span>
          </label>
          <label className="admin-label full">
            Photo URL for this variant
            <input
              className="admin-input"
              name={VARIANT_FIELD_NAMES.imageUrl}
              defaultValue={variant.imageUrl || ''}
              placeholder="same as the product"
            />
          </label>
        </div>
      </details>
    </div>
  );
}

export default function ProductFields({
  product,
  collections,
  categories,
  catalog = []
}: {
  collections: Array<{ id: string; title: string }>;
  categories: AdminCategoryOption[];
  product?: AdminProductDraft;
  /** Every other product, for the "goes with this" pickers. */
  catalog?: Array<{ id: string; name: string; sku: string | null }>;
}) {
  const assigned = new Set((product?.collections || []).map((collection) => collection.id));
  const chosenTags = new Set(product?.tags || []);
  const otherProducts = catalog.filter((entry) => entry.id !== product?.id);
  const dateValue = (value: Date | null | undefined) =>
    value ? value.toISOString().slice(0, 10) : '';
  const stored = readStoredSizes(product?.sizes);
  const counted = storedSizesTrackStock(stored);
  const sizeStock = sizeStockSummary(product?.sizes);
  const specs = readProductSpecs(product?.specs);
  const rows = variantEditorRows(product?.sizes, stored.length ? 1 : 2);
  const basePriceCents = product?.priceCents ?? 0;

  const chosenCategory = categories.find((category) => category.id === product?.categoryId);
  const activeKind: ProductSpecKind =
    chosenCategory?.specKind ??
    categories[0]?.specKind ??
    SPEC_KIND_BY_TYPE[product?.type ?? 'OTHER'] ??
    'GENERAL';

  return (
    <>
      {product && <input type="hidden" name="id" value={product.id} />}
      {product && <input type="hidden" name="expectedInventory" value={product.inventory} />}
      <div className="admin-form-grid">
        <label className="admin-label">
          Product name
          <input className="admin-input" name="name" defaultValue={product?.name} required />
        </label>
        <label className="admin-label">
          URL slug
          <input
            className="admin-input"
            name="slug"
            defaultValue={product?.slug}
            placeholder="created-from-name"
          />
        </label>
        <label className="admin-label">
          SKU / item number
          <input className="admin-input" name="sku" defaultValue={product?.sku || ''} />
        </label>
        {categories.length > 0 ? (
          <label className="admin-label">
            Category
            <select
              className="admin-input"
              name="categoryId"
              data-category-select
              required
              defaultValue={product?.categoryId || ''}
            >
              {/* Only offered while a product is genuinely uncategorised, so a
                  category cannot be dropped by accident once one is chosen. It
                  has no value, and the field is required, so it is a prompt
                  rather than an answer: a product saved without a category
                  would be asked for the wrong details and would fall out of
                  every filter that leads to it. */}
              {!product?.categoryId && <option value="">— Choose a category —</option>}
              {categories.map((category) => (
                <option value={category.id} data-kind={category.specKind} key={category.id}>
                  {category.title}
                  {category.active ? '' : ' (hidden from the shop)'}
                </option>
              ))}
            </select>
            <span className="admin-hint">
              The category decides which details this product is asked for below, and which shop
              filter it appears under. Manage the list in Website content → Categories.
            </span>
          </label>
        ) : (
          <label className="admin-label">
            Category
            <select className="admin-input" name="type" defaultValue={product?.type || 'PLANT'}>
              {(['PLANT', 'TEA', 'TEA_SUPPLY', 'SOAP', 'LOTION', 'OTHER'] as ProductType[]).map(
                (type) => (
                  <option value={type} key={type}>
                    {productTypeLabel(type)}
                  </option>
                )
              )}
            </select>
            <span className="admin-hint">
              The full category list has not been set up on this database yet.
            </span>
          </label>
        )}
        <label className="admin-label">
          Price
          <input
            className="admin-input"
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product ? money(product.priceCents) : ''}
            required
          />
        </label>
        <label className="admin-label">
          Compare-at price
          <input
            className="admin-input"
            name="compareAt"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.compareAtCents ? money(product.compareAtCents) : ''}
          />
        </label>
        <label className="admin-label">
          Quantity on hand
          <input
            className="admin-input"
            name="inventory"
            type="number"
            min="0"
            defaultValue={product?.inventory ?? 0}
            required
          />
          {/* Counted variants own this number — it is the sum of them — so saying
              so here is the only way the box explains itself on a form that has
              no scripting to grey it out. */}
          <span className="admin-hint">
            {sizeStock
              ? `Added up from the variants below: ${sizeStock}. Change a variant’s quantity to change this.`
              : 'Leave this as the whole shelf. Count the variants separately below if you want a quantity for each.'}
          </span>
        </label>
        <label className="admin-label">
          Display order
          <input
            className="admin-input"
            name="sortOrder"
            type="number"
            defaultValue={product?.sortOrder ?? 0}
          />
        </label>
        <label className="admin-label">
          Badge
          <input
            className="admin-input"
            name="badge"
            defaultValue={product?.badge || ''}
            placeholder="Our pick"
          />
        </label>
        <label className="admin-label">
          Shipping weight (oz)
          <input
            className="admin-input"
            name="weightOunces"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.weightOunces ?? ''}
          />
          <span className="admin-hint">Packed weight, for working out postage.</span>
        </label>
        <label className="admin-label">
          Dimensions
          <input
            className="admin-input"
            name="dimensions"
            defaultValue={product?.dimensions || ''}
            placeholder={'8 × 8 × 10 in'}
          />
        </label>
        <label className="admin-label full">
          Short card description
          <input
            className="admin-input"
            name="shortDescription"
            defaultValue={product?.shortDescription || ''}
          />
        </label>
        <label className="admin-label full">
          Main description
          <textarea
            className="admin-input"
            name="description"
            rows={4}
            defaultValue={product?.description}
            required
          />
        </label>
        <label className="admin-label full">
          Anything else worth saying
          <textarea
            className="admin-input"
            name="details"
            rows={3}
            defaultValue={product?.details || ''}
          />
          <span className="admin-hint">
            Free text, shown under “About this item”. The structured details below are the ones a
            customer scans for, so put ingredients, sizes and care there rather than here.
          </span>
        </label>
        <label className="admin-label full">
          Plant care note
          <textarea
            className="admin-input"
            name="careNotes"
            rows={2}
            defaultValue={product?.careNotes || ''}
          />
        </label>
        <label className="admin-label full">
          Shipping / pickup note
          <textarea
            className="admin-input"
            name="shippingNote"
            rows={2}
            defaultValue={product?.shippingNote || ''}
          />
        </label>
      </div>

      {/* Named fields rather than the whole row: everything handed to a client
          component is serialized into the payload twice over, and the photo
          editor has no use for the variant list or the supplier. */}
      <ProductPhotoManager
        product={
          product && {
            imageUrl: product.imageUrl,
            lifestyleImageUrl: product.lifestyleImageUrl,
            detailImageUrl: product.detailImageUrl,
            scaleImageUrl: product.scaleImageUrl,
            packagingImageUrl: product.packagingImageUrl,
            galleryImages: product.galleryImages || []
          }
        }
      />

      <fieldset className="admin-subsection">
        <legend>
          <h3>How it is found and merchandised</h3>
        </legend>
        <div className="admin-grid">
          <label className="admin-label">
            Botanical (Latin) name
            <input
              className="admin-input"
              name="botanical"
              defaultValue={product?.botanical || ''}
              placeholder="Epipremnum aureum"
            />
            <span className="admin-hint">
              Shown under the product name, and searchable — a lot of people type the Latin name.
            </span>
          </label>
          <label className="admin-label">
            Other words people search for
            <input
              className="admin-input"
              name="searchTerms"
              defaultValue={product?.searchTerms || ''}
              placeholder="devil's ivy, money plant"
            />
            <span className="admin-hint">
              Never shown to customers. Nicknames, common misspellings, what it is called elsewhere.
            </span>
          </label>
          <label className="admin-label">
            In season from
            <input
              className="admin-input"
              name="seasonStartsAt"
              type="date"
              defaultValue={dateValue(product?.seasonStartsAt)}
            />
            <span className="admin-hint">
              Only the day and month matter — a season repeats every year. Leave both empty unless
              this is a seasonal item.
            </span>
          </label>
          <label className="admin-label">
            In season until
            <input
              className="admin-input"
              name="seasonEndsAt"
              type="date"
              defaultValue={dateValue(product?.seasonEndsAt)}
            />
            <span className="admin-hint">
              Out of season it keeps its page and its price — it just stops appearing in seasonal
              rows.
            </span>
          </label>
          <label className="admin-checkbox">
            <input name="staffPick" type="checkbox" defaultChecked={product?.staffPick ?? false} />{' '}
            Tammy&rsquo;s pick
          </label>
        </div>
      </fieldset>

      {/* Attributes are what customers filter the shop by: pet safe, low light,
          handmade. Grouped the way they are shown to shoppers, and the plant ones
          are marked so a soap does not get a light requirement. */}
      <fieldset className="admin-collection-picker">
        <legend>What is true about this product</legend>
        <span className="admin-hint">
          These become the filters in the shop and the “good to know” links on the product page.
        </span>
        {groupTags(PRODUCT_TAGS).map((group) => (
          <div className="admin-tag-group" key={group.key}>
            <b>
              {group.label}
              {group.tags.every((tag) => tag.types?.includes('PLANT')) ? ' (plants)' : ''}
            </b>
            {group.tags.map((tag) => (
              <label className="admin-checkbox" key={tag.slug} title={tag.hint}>
                <input
                  type="checkbox"
                  name="tags"
                  value={tag.slug}
                  defaultChecked={chosenTags.has(tag.slug)}
                />{' '}
                {tag.label}
              </label>
            ))}
          </div>
        ))}
      </fieldset>

      {otherProducts.length > 0 && (
        <div className="admin-picker-grid">
          <AdminProductPicker
            name="relatedIds"
            legend="Related products"
            hint="Shown under “You may also like”. Leave empty to let the shop suggest similar items itself."
            products={otherProducts}
            selectedIds={(product?.relatedProducts || []).map((entry) => entry.id)}
          />
          <AdminProductPicker
            name="crossSellIds"
            legend="Goes well with this"
            hint="Shown as “what people usually add” — the pot, the mix, the soap that goes with it."
            products={otherProducts}
            selectedIds={(product?.crossSells || []).map((entry) => entry.id)}
          />
          <AdminProductPicker
            name="bundleIds"
            legend="What is inside this set"
            hint="Only for a bundle or gift set. The pieces are listed on its page and still sold on their own."
            products={otherProducts}
            selectedIds={(product?.bundleItems || []).map((entry) => entry.id)}
          />
        </div>
      )}

      <fieldset className="admin-subsection">
        <legend>
          <h3>Restocking</h3>
        </legend>
        <p className="admin-hint">
          Owner-facing only — none of this appears in the shop. It is what decides whether an empty
          shelf is a job.
        </p>
        <div className="admin-grid">
          <label className="admin-label">
            Supplier or vendor
            <input
              className="admin-input"
              name="supplier"
              defaultValue={product?.supplier || ''}
              placeholder="Ebensburg Growers"
            />
          </label>
          <label className="admin-label">
            Their item number
            <input
              className="admin-input"
              name="supplierItemNumber"
              defaultValue={product?.supplierItemNumber || ''}
              placeholder="As it reads on their packing slip"
            />
          </label>
          <label className="admin-label">
            Reorder point
            <input
              className="admin-input"
              name="reorderPoint"
              type="number"
              min="0"
              defaultValue={product?.reorderPoint ?? ''}
              placeholder="Leave empty if you never reorder this"
            />
            <span className="admin-hint">
              When the quantity on hand drops to this, it appears under Needs reorder.
            </span>
          </label>
          <label className="admin-label">
            Reorder quantity
            <input
              className="admin-input"
              name="reorderQuantity"
              type="number"
              min="0"
              defaultValue={product?.reorderQuantity ?? ''}
              placeholder="How many to order at a time"
            />
          </label>
          <label className="admin-label">
            Inventory status
            <select
              className="admin-input"
              name="inventoryStatus"
              defaultValue={product?.inventoryStatus || InventoryStatus.STOCKED}
            >
              {Object.values(InventoryStatus).map((status) => (
                <option value={status} key={status}>
                  {INVENTORY_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <span className="admin-hint">
              {INVENTORY_STATUS_HINTS[inventoryStatusValue(product?.inventoryStatus)]}
            </span>
          </label>
          <label className="admin-label">
            Last restocked
            <input
              className="admin-input"
              name="lastRestockedAt"
              type="date"
              defaultValue={restockDateValue(product?.lastRestockedAt)}
            />
            <span className="admin-hint">
              Fills itself in whenever you raise the quantity on hand. Change it here if the box
              actually arrived on another day.
            </span>
          </label>
          <label className="admin-label full">
            Private inventory notes
            <textarea
              className="admin-input"
              name="inventoryNotes"
              rows={2}
              defaultValue={product?.inventoryNotes || ''}
              placeholder="Two trays under the bench. Order by the flat of 18."
            />
          </label>
        </div>
      </fieldset>

      <section className="admin-subsection" data-spec-sections>
        <h3>Details for this kind of product</h3>
        <p className="admin-hint">
          Only what this category needs. Everything here is optional — a field left empty is simply
          not shown on the website.
        </p>
        {(Object.keys(SPEC_KIND_LABELS) as ProductSpecKind[]).map((kind) => (
          <SpecSections kind={kind} activeKind={activeKind} specs={specs} key={kind} />
        ))}
      </section>

      <section className="admin-subsection">
        <h3>Sizes and variants</h3>
        <p className="admin-hint">
          For anything sold in more than one form — a pothos in a 4&quot; nursery pot and a 6&quot;
          decorative planter. Leave every row blank if this is sold one way. Each variant can carry
          its own price, stock, SKU, photograph, weight and shipping answer; anything left blank
          follows the product above, so raising the price here still moves every variant with it.
        </p>
        <label className="admin-label" style={{ maxWidth: 320 }}>
          What the dropdown is called
          <input
            className="admin-input"
            name="sizeLabel"
            defaultValue={product?.sizeLabel || ''}
            placeholder="Size"
          />
          <span className="admin-hint">“Pot size”, “Jar size”. Leave blank for “Size”.</span>
        </label>
        <div className="admin-variant-list" data-variant-list>
          {rows.map((variant, index) => (
            <VariantRow
              variant={variant}
              basePriceCents={basePriceCents}
              counted={counted}
              index={index}
              key={`${variant.label || 'blank'}-${index}`}
            />
          ))}
        </div>
        <p className="admin-hint">
          Fill a quantity on any row and each variant is counted on its own — a row left blank then
          counts as none left. Leave every quantity empty and all the variants share the one
          quantity on hand above. Up to {MAX_SIZE_OPTIONS} variants.
        </p>
      </section>

      {collections.length > 0 && (
        <fieldset className="admin-collection-picker">
          <legend>Collections this product belongs to</legend>
          {collections.map((collection) => (
            <label className="admin-checkbox" key={collection.id}>
              <input
                type="checkbox"
                name="collectionIds"
                value={collection.id}
                defaultChecked={assigned.has(collection.id)}
              />{' '}
              {collection.title}
            </label>
          ))}
        </fieldset>
      )}
      <div className="admin-actions">
        <label className="admin-checkbox">
          <input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> Active in
          shop
        </label>
        <label className="admin-checkbox">
          <input name="featured" type="checkbox" defaultChecked={product?.featured ?? false} />{' '}
          Featured
        </label>
        <label className="admin-checkbox">
          <input name="ships" type="checkbox" defaultChecked={product?.ships ?? true} /> Ships
        </label>
        <label className="admin-checkbox">
          <input name="pickup" type="checkbox" defaultChecked={product?.pickup ?? true} /> Local
          pickup
        </label>
      </div>
    </>
  );
}
