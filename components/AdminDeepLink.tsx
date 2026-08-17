'use client';

import { useEffect } from 'react';

/**
 * Server actions and GET filters cannot keep a `#hash` reliably — Next's
 * `redirect()` often drops the fragment, and a search form posts to `/admin`
 * without one. After a save Tammy would land at the top of a long dashboard
 * with every `<details>` closed. This scrolls to the section (and focused
 * row) the action asked for.
 */
export default function AdminDeepLink({
  section,
  focusId
}: {
  section?: string;
  focusId?: string;
}) {
  useEffect(() => {
    const target =
      (focusId ? document.getElementById(focusId) : null) ||
      (section ? document.getElementById(section) : null);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
  }, [focusId, section]);

  return null;
}
