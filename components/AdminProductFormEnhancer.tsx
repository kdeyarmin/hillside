'use client';

import { useEffect } from 'react';

/**
 * Two pieces of progressive enhancement for the product form.
 *
 * **The detail fields follow the category.** Every kind's fields are in the
 * page; all but one are hidden. Picking a different category here swaps them on
 * the spot instead of after a save — and with scripting off, the fields for the
 * category the product is already in are the ones on screen, which is the
 * answer that was correct anyway.
 *
 * **Variants can be added without saving.** The form ships with a blank row or
 * two, which is the whole mechanism without scripting; this adds a button that
 * clones one so a plant sold in five pots does not need five round trips.
 *
 * Everything here is an addition to a form that already works. Nothing is
 * created that the server would not otherwise receive, and nothing is required
 * for a save to be correct.
 */

/**
 * Deliberately narrow. `[data-spec-kind]` alone also matches the category
 * `<select>`'s own options, which carry the kind they choose — and hiding all
 * but one of those would empty the dropdown the moment it was used.
 */
const SPEC_SECTION = 'fieldset.admin-spec-kind[data-spec-kind]';

function showKind(root: ParentNode, kind: string) {
  root.querySelectorAll<HTMLFieldSetElement>(SPEC_SECTION).forEach((section) => {
    const inactive = section.dataset.specKind !== kind;
    section.hidden = inactive;
    /**
     * Disabled as well as hidden, because a hidden input is still submitted:
     * several kinds ask for the same field name, so leaving the others enabled
     * would let a stale copy win over the one the owner just typed in.
     */
    section.disabled = inactive;
  });
}

function enhanceCategorySelect(select: HTMLSelectElement) {
  if (select.dataset.categoryEnhanced === 'true') return;
  select.dataset.categoryEnhanced = 'true';

  const form = select.closest('form');
  if (!form) return;

  const apply = () => {
    const chosen = select.selectedOptions[0]?.dataset.kind;
    if (chosen) showKind(form, chosen);
  };

  select.addEventListener('change', apply);
  apply();
}

/** Empties a cloned row so it reads as the blank invitation it now is. */
function clearRow(row: HTMLElement) {
  row.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    input.value = '';
  });
  row.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
    select.selectedIndex = 0;
  });
  row.querySelectorAll<HTMLDetailsElement>('details').forEach((details) => {
    details.open = false;
  });
  /**
   * The photo uploader attaches itself to the image field and marks it done.
   * A clone carries the marker and the markup but not the listeners, so both
   * are stripped and the uploader's observer fits a live one back on.
   */
  row.querySelectorAll<HTMLElement>('.admin-upload-tools').forEach((tools) => tools.remove());
  row.querySelectorAll<HTMLElement>('[data-upload-enhanced]').forEach((field) => {
    delete field.dataset.uploadEnhanced;
  });
}

const MAX_VARIANT_ROWS = 12;

function enhanceVariantList(list: HTMLElement) {
  if (list.dataset.variantEnhanced === 'true') return;
  list.dataset.variantEnhanced = 'true';

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'btn outline small';
  addButton.textContent = 'Add another variant';

  const rows = () => Array.from(list.querySelectorAll<HTMLElement>('[data-variant-row]'));

  const refresh = () => {
    addButton.disabled = rows().length >= MAX_VARIANT_ROWS;
  };

  addButton.addEventListener('click', () => {
    const existing = rows();
    const template = existing[existing.length - 1];
    if (!template || existing.length >= MAX_VARIANT_ROWS) return;

    const clone = template.cloneNode(true) as HTMLElement;
    clearRow(clone);
    const title = clone.querySelector<HTMLElement>('.admin-variant-title');
    if (title) title.textContent = `Variant ${existing.length + 1}`;
    list.append(clone);
    clone.querySelector<HTMLInputElement>('input')?.focus();
    refresh();
  });

  const controls = document.createElement('div');
  controls.className = 'admin-actions';
  controls.append(addButton);
  list.insertAdjacentElement('afterend', controls);
  refresh();
}

export default function AdminProductFormEnhancer() {
  useEffect(() => {
    const enhanceAll = () => {
      document
        .querySelectorAll<HTMLSelectElement>('select[data-category-select]')
        .forEach(enhanceCategorySelect);
      document.querySelectorAll<HTMLElement>('[data-variant-list]').forEach(enhanceVariantList);
    };

    enhanceAll();
    const observer = new MutationObserver(enhanceAll);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
