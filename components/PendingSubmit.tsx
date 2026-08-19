'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that says what it is doing while it does it.
 *
 * Adding an Amazon pick goes and reads the item's page, which takes a second or
 * two of nothing happening. Without this the owner clicks again, and a second
 * click is a second lookup.
 */
export default function PendingSubmit({
  className,
  pendingLabel,
  children
}: {
  className?: string;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending || undefined}>
      {pending ? pendingLabel : children}
    </button>
  );
}
