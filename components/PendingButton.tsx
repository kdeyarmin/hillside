'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that goes disabled while its form's action is in flight.
 *
 * The compose and reply forms send real mail, and a second click while the
 * first send was still going produced a second delivery. The server refuses the
 * repeat as well; this stops the common case before it gets there, and tells
 * the owner why the button stopped responding.
 */
export default function PendingButton({
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
    <button className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
