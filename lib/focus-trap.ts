const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/** Everything inside `container` a keyboard can actually reach right now. */
export function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0
      );
    }
  );
}

/**
 * Keeps Tab inside an open dialog. Call from a keydown handler that has already
 * established the event is a Tab.
 *
 * The case worth naming is focus starting *outside* the dialog. That is not
 * hypothetical: a dialog focuses its close button on the next animation frame,
 * so anything that presses Tab in the gap between the dialog appearing and that
 * frame running — an impatient keyboard user, or the responsive audit — is
 * tabbing while focus is still on the button that opened it. Handling only the
 * shift-Tab side of that, as this code did in two places, let a forward Tab walk
 * straight out of the modal into the page behind it.
 *
 * Returns true when it moved focus, so the caller can preventDefault.
 */
export function trapTabKey(
  event: Pick<KeyboardEvent, 'shiftKey'>,
  container: HTMLElement | null,
  fallback?: HTMLElement | null
) {
  const focusables = focusableElements(container);
  if (!focusables.length) {
    fallback?.focus();
    return Boolean(fallback);
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (!container?.contains(active)) {
    (event.shiftKey ? last : first).focus();
    return true;
  }

  if (event.shiftKey && active === first) {
    last.focus();
    return true;
  }

  if (!event.shiftKey && active === last) {
    first.focus();
    return true;
  }

  return false;
}
