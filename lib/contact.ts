import { CLASSES_PUBLICLY_VISIBLE } from './class-visibility.ts';

/**
 * The contact form's subject list is also the contract for every `?subject=`
 * prefill. Gallery, empty collections and the empty shop all deep-link here;
 * a free-text subject would let those links invent options the form does not
 * actually offer.
 */
export const CONTACT_SUBJECTS = [
  'General question',
  'Plant care question',
  'Product or order question',
  'Availability or restock',
  'Custom or bulk order',
  'Custom planter arrangement',
  'Local pickup inquiry',
  'Wholesale or collaboration'
] as const;

export const CLASS_CONTACT_SUBJECTS = ['Planter class', 'Private group class'] as const;

export type ContactSubject =
  (typeof CONTACT_SUBJECTS)[number] | (typeof CLASS_CONTACT_SUBJECTS)[number];

export function allowedContactSubjects(
  classesVisible = CLASSES_PUBLICLY_VISIBLE
): ContactSubject[] {
  if (!classesVisible) return [...CONTACT_SUBJECTS];
  return [...CONTACT_SUBJECTS.slice(0, 3), ...CLASS_CONTACT_SUBJECTS, ...CONTACT_SUBJECTS.slice(3)];
}

export function parseContactPrefill(
  params: { subject?: string; message?: string },
  classesVisible = CLASSES_PUBLICLY_VISIBLE
) {
  const allowed = allowedContactSubjects(classesVisible);
  const requested = (params.subject || '').trim();
  const subject = allowed.includes(requested as ContactSubject)
    ? (requested as ContactSubject)
    : 'General question';
  const message = (params.message || '').slice(0, 5000);
  return { subject, message };
}

export function contactHref(prefill: { subject?: ContactSubject; message?: string } = {}) {
  const params = new URLSearchParams();
  if (prefill.subject) params.set('subject', prefill.subject);
  if (prefill.message?.trim()) params.set('message', prefill.message.trim().slice(0, 5000));
  const query = params.toString();
  return query ? `/contact?${query}` : '/contact';
}

/**
 * The subject behind every "custom or bulk order" button on the site.
 *
 * One subject rather than a form of its own. A planter made for a particular
 * room, thirty favours for a wedding and a classroom's worth of terrarium kits
 * are all the same conversation — what is it for, how many, by when — and
 * Tammy has it by email, which the contact form already starts with the
 * sender's address attached. Choosing the subject for the visitor is what lets
 * her inbox say what a message is before she opens it.
 */
export const CUSTOM_ORDER_SUBJECT: ContactSubject = 'Custom or bulk order';

/** The contact form, opened on a custom or bulk order, with the note started. */
export function customOrderHref(message?: string) {
  return contactHref({ subject: CUSTOM_ORDER_SUBJECT, message });
}
