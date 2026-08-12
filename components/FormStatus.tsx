/**
 * A form's success or error message, in a live region that actually announces.
 *
 * Five forms rendered their status as `{message && <p role="status">…</p>}`. A
 * live region has to be in the accessibility tree *before* its content changes —
 * one that appears already carrying text is usually not announced at all, so
 * those messages were silent to screen-reader users even where `aria-live` was
 * set. The element is therefore always rendered and only its content changes.
 *
 * Errors are `alert`/assertive rather than `status`/polite: a failed submission
 * needs to interrupt, because the user is about to move on believing it worked.
 */
export default function FormStatus({
  message,
  tone = 'success',
  className = '',
  id
}: {
  message?: string | null;
  tone?: 'success' | 'error' | 'notice';
  className?: string;
  id?: string;
}) {
  const isError = tone === 'error';
  return (
    <p
      id={id}
      className={`form-status ${message ? tone : 'is-empty'} ${className}`.trim()}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      {message || ''}
    </p>
  );
}
