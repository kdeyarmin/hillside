'use client';

/**
 * Destructive admin actions used to fire on the first click. A confirm()
 * here is enough — the server still refuses locked collections.
 */
export default function ConfirmSubmit({
  message,
  className,
  children
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
