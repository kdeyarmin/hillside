import { z } from 'zod';

/**
 * The name of the spam honeypot field, shared by every public form.
 *
 * It is deliberately NOT called `website`, and must never be renamed back to
 * `website`, `url`, `homepage`, `company` or anything else a browser profile
 * holds a value for. A field named `website` looks to Chrome, Safari and every
 * password manager like a real "your website" input, so they autofill it — and
 * an autofilled honeypot is a real customer being shown "thanks, we got it"
 * while their message, newsletter signup, review or class registration is
 * silently thrown away. `hp_reference` has no autofill meaning attached to it,
 * so nothing fills it on a person's behalf.
 *
 * The markup that carries it is off-screen (`.honeypot` in app/globals.css)
 * rather than `display: none`, with `autoComplete="off"`, `tabIndex={-1}` and
 * `aria-hidden="true"`: unreachable to a person or a screen reader, still in
 * the DOM for a bot that fills every input it finds.
 */
export const HONEYPOT_FIELD = 'hp_reference';

/**
 * The previous name. Still accepted, and still trips the trap, because a bot
 * that scraped the old markup and a visitor holding a cached page both keep
 * posting it. Read-only compatibility — nothing renders this field any more.
 */
export const LEGACY_HONEYPOT_FIELD = 'website';

/**
 * Bounded rather than required-empty: `max(0)` made a filled honeypot fail
 * schema validation and return 400, which meant the quiet-success branch could
 * never run and a bot was told plainly that the field was the problem. The cap
 * keeps it from being used to post a payload.
 */
const honeypotValue = z.string().max(200).optional().default('');

/**
 * Spread into a route's `z.object({ … })` shape to accept both honeypot names:
 *
 *     const schema = z.object({ email: …, ...honeypotFields });
 *     if (honeypotTripped(parsed.data)) return NextResponse.json({ message: '…' });
 */
export const honeypotFields = {
  [HONEYPOT_FIELD]: honeypotValue,
  [LEGACY_HONEYPOT_FIELD]: honeypotValue
} as const;

/** What a parsed body looks like to the check below. */
export type HoneypotInput = {
  [HONEYPOT_FIELD]?: string | null;
  [LEGACY_HONEYPOT_FIELD]?: string | null;
};

/**
 * Whether this submission came from a bot. Either field being filled trips it,
 * so dropping the old name from the forms did not drop the protection with it.
 * The caller answers a tripped submission with its ordinary success message —
 * telling a bot which field gave it away is how the next one gets past.
 */
export function honeypotTripped(input: HoneypotInput): boolean {
  return Boolean(input[HONEYPOT_FIELD]?.trim() || input[LEGACY_HONEYPOT_FIELD]?.trim());
}
